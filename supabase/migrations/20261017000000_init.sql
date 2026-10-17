-- LendBook schema: personal lending ledger (monthly interest).
-- Access model: only users listed in public.admins can read/write anything.
-- Customer-facing agreement links are served by the Next.js server using the service role.

create extension if not exists pgcrypto;

-- ---------- access control ----------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy admins_self_read on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- The first account that signs up becomes the owner; later sign-ups get no access.
create or replace function public.claim_first_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values (new.id);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.claim_first_admin();

-- ---------- settings (single row) ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'My Finance',
  owner_name text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  default_rate_pct numeric(6,3) not null default 2,
  agreement_terms text not null default
'1. The Borrower agrees to pay interest every month on or before the due date.
2. Interest is calculated on the principal outstanding at the start of each monthly period.
3. Part-payments of principal reduce interest from the next period onwards.
4. The Borrower may repay the principal in full at any time along with interest due till date.
5. The Borrower confirms that the identity documents provided are genuine.',
  remind_days_before int not null default 3,
  overdue_remind_days int[] not null default '{1,7,15,30}',
  whatsapp_enabled boolean not null default false,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------- customers & KYC ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code serial unique,
  name text not null,
  phone text not null,              -- WhatsApp number, 10 digits or with 91
  email text,
  address text,
  occupation text,
  pan text,
  aadhaar_last4 text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  guarantor_name text,
  guarantor_phone text,
  notes text,
  whatsapp_opt_in boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customers (name);
create index on public.customers (phone);

create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  doc_type text not null check (doc_type in ('pan','aadhaar_masked','photo','address_proof','bank','other')),
  file_path text not null,          -- storage path in bucket 'kyc'
  file_name text,
  uploaded_by text not null default 'owner' check (uploaded_by in ('owner','customer')),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.kyc_documents (customer_id);

-- ---------- loans & payments ----------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_no serial unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  principal numeric(14,2) not null check (principal > 0),
  rate_pct_month numeric(6,3) not null check (rate_pct_month >= 0),   -- e.g. 2 = Rs 2 per 100 per month
  start_date date not null,
  tenure_months int check (tenure_months is null or tenure_months > 0), -- informational maturity
  disbursal_mode text not null default 'cash' check (disbursal_mode in ('cash','upi','bank','cheque')),
  disbursal_ref text,
  collateral text,
  notes text,
  status text not null default 'active' check (status in ('active','closed','written_off')),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.loans (customer_id);
create index on public.loans (status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  paid_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  principal_part numeric(14,2) check (principal_part is null or principal_part >= 0), -- null = auto allocate
  mode text not null default 'cash' check (mode in ('cash','upi','bank','cheque')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.payments (loan_id, paid_on);
create index on public.payments (paid_on);

-- ---------- agreements ----------
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'sent' check (status in ('sent','submitted','verified','rejected')),
  pdf_path text not null,           -- storage path in bucket 'agreements'
  signed_path text,
  id_proof_path text,
  submitted_at timestamptz,
  submitted_ip text,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index on public.agreements (loan_id);

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  loan_id uuid references public.loans(id) on delete set null,
  channel text not null check (channel in ('whatsapp','email')),
  kind text not null,               -- reminder_before, due_today, overdue, receipt, agreement
  dedupe_key text unique,           -- prevents the daily job sending the same reminder twice
  status text not null check (status in ('sent','failed','skipped')),
  detail text,
  created_at timestamptz not null default now()
);
create index on public.notifications (created_at desc);

-- ---------- audit log ----------
create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','loans','payments','agreements','kyc_documents'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit()', t, t);
  end loop;
  foreach t in array array['customers','loans','settings'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch()', t, t);
  end loop;
end $$;

-- ---------- RLS: admins only ----------
do $$
declare t text;
begin
  foreach t in array array['settings','customers','kyc_documents','loans','payments','agreements','notifications','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('kyc','kyc', false), ('agreements','agreements', false)
on conflict (id) do nothing;

create policy lendbook_storage_admin on storage.objects for all
  using (bucket_id in ('kyc','agreements') and public.is_admin())
  with check (bucket_id in ('kyc','agreements') and public.is_admin());
