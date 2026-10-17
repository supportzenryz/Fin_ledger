import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIST } from "./dates";
import { computeLoan, type LoanSummary } from "./engine";
import { fetchAll } from "./supabase";

export type Customer = {
  id: string;
  code: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  occupation: string | null;
  pan: string | null;
  aadhaar_last4: string | null;
  guarantor_name: string | null;
  guarantor_phone: string | null;
  notes: string | null;
  whatsapp_opt_in: boolean;
  archived: boolean;
  created_at: string;
};

export type Loan = {
  id: string;
  loan_no: number;
  customer_id: string;
  principal: number;
  rate_pct_month: number;
  start_date: string;
  tenure_months: number | null;
  disbursal_mode: string;
  disbursal_ref: string | null;
  collateral: string | null;
  notes: string | null;
  status: "active" | "closed" | "written_off";
  closed_on: string | null;
};

export type Payment = {
  id: string;
  loan_id: string;
  paid_on: string;
  amount: number;
  principal_part: number | null;
  mode: string;
  reference: string | null;
  notes: string | null;
};

export type Settings = {
  business_name: string;
  owner_name: string;
  address: string;
  phone: string;
  email: string;
  default_rate_pct: number;
  agreement_terms: string;
  remind_days_before: number;
  overdue_remind_days: number[];
  whatsapp_enabled: boolean;
  email_enabled: boolean;
};

export type LoanView = Loan & { customer: Customer; payments: Payment[]; s: LoanSummary };

export function summarize(loan: Loan, payments: Payment[], asOf = todayIST()): LoanSummary {
  return computeLoan(
    {
      principal: Number(loan.principal),
      ratePct: Number(loan.rate_pct_month),
      startDate: loan.start_date,
      tenureMonths: loan.tenure_months,
      status: loan.status,
      closedOn: loan.closed_on,
    },
    payments.map((p) => ({
      id: p.id,
      paidOn: p.paid_on,
      amount: Number(p.amount),
      principalPart: p.principal_part == null ? null : Number(p.principal_part),
    })),
    asOf,
  );
}

/** Loads loans (optionally filtered) with their customer and payments, and runs the engine on each. */
export async function loadLoans(
  client: SupabaseClient,
  filter: { customerId?: string; loanId?: string; status?: Loan["status"] } = {},
): Promise<LoanView[]> {
  const loans = await fetchAll<Loan & { customer: Customer }>((from, to) => {
    let q = client.from("loans").select("*, customer:customers(*)").order("loan_no");
    if (filter.customerId) q = q.eq("customer_id", filter.customerId);
    if (filter.loanId) q = q.eq("id", filter.loanId);
    if (filter.status) q = q.eq("status", filter.status);
    return q.range(from, to);
  });
  if (!loans.length) return [];
  const payments = await fetchAll<Payment>((from, to) => {
    let q = client.from("payments").select("*").order("paid_on").order("created_at");
    if (filter.customerId || filter.loanId) q = q.in("loan_id", loans.map((l) => l.id));
    return q.range(from, to);
  });
  const byLoan = new Map<string, Payment[]>();
  for (const p of payments) byLoan.set(p.loan_id, [...(byLoan.get(p.loan_id) ?? []), p]);
  const asOf = todayIST();
  return loans.map((l) => {
    const ps = byLoan.get(l.id) ?? [];
    return { ...l, payments: ps, s: summarize(l, ps, asOf) };
  });
}

export async function loadSettings(client: SupabaseClient): Promise<Settings> {
  const { data, error } = await client.from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return data as Settings;
}
