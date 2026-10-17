import { redirect } from "next/navigation";
import { Field, Flash } from "@/components/ui";
import { loadSettings } from "@/lib/data";
import { emailConfigured, whatsappConfigured } from "@/lib/notify";
import { requireOwner } from "@/lib/supabase";

export const metadata = { title: "Settings" };

async function save(formData: FormData) {
  "use server";
  const client = await requireOwner();
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const days = s("overdue_remind_days").split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const { error } = await client.from("settings").update({
    business_name: s("business_name") || "My Finance",
    owner_name: s("owner_name"),
    address: s("address"),
    phone: s("phone"),
    email: s("email"),
    default_rate_pct: Number(s("default_rate_pct")) || 0,
    agreement_terms: s("agreement_terms"),
    remind_days_before: Math.max(0, Number(s("remind_days_before")) || 0),
    overdue_remind_days: days,
    whatsapp_enabled: formData.get("whatsapp_enabled") === "on",
    email_enabled: formData.get("email_enabled") === "on",
  }).eq("id", 1);
  redirect(error ? `/settings?error=${encodeURIComponent(error.message)}` : "/settings?msg=Settings+saved");
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { msg, error } = await searchParams;
  const client = await requireOwner();
  const st = await loadSettings(client);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="page-title">Settings</h1>
      <Flash msg={msg} error={error} />
      <form action={save} className="space-y-5">
        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="card-title sm:col-span-2">Business (printed on agreements and messages)</h2>
          <Field label="Business name" name="business_name"><input className="input" id="business_name" name="business_name" defaultValue={st.business_name} /></Field>
          <Field label="Lender name (you)" name="owner_name"><input className="input" id="owner_name" name="owner_name" defaultValue={st.owner_name} /></Field>
          <Field label="Phone" name="phone"><input className="input" id="phone" name="phone" defaultValue={st.phone} /></Field>
          <Field label="Email (customers' replies go here)" name="email"><input className="input" id="email" name="email" type="email" defaultValue={st.email} /></Field>
          <Field label="Address" name="address" className="sm:col-span-2"><textarea className="input" id="address" name="address" rows={2} defaultValue={st.address} /></Field>
          <Field label="Default interest % per month" name="default_rate_pct"><input className="input" id="default_rate_pct" name="default_rate_pct" inputMode="decimal" defaultValue={st.default_rate_pct} /></Field>
        </section>

        <section className="card space-y-3">
          <h2 className="card-title">Agreement terms</h2>
          <textarea className="input font-mono text-xs" name="agreement_terms" rows={10} defaultValue={st.agreement_terms} />
          <p className="muted">Printed in section 2 of every new agreement. Have your lawyer check it once.</p>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="card-title sm:col-span-2">Reminders</h2>
          <Field label="Remind this many days before due date (0 = off)" name="remind_days_before">
            <input className="input" id="remind_days_before" name="remind_days_before" inputMode="numeric" defaultValue={st.remind_days_before} />
          </Field>
          <Field label="Overdue reminders on these days late" name="overdue_remind_days">
            <input className="input" id="overdue_remind_days" name="overdue_remind_days" defaultValue={st.overdue_remind_days.join(", ")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="whatsapp_enabled" defaultChecked={st.whatsapp_enabled} />
            Automatic WhatsApp {whatsappConfigured() ? "(API connected ✓)" : "(API keys not added yet)"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="email_enabled" defaultChecked={st.email_enabled} />
            Email {emailConfigured() ? "(connected ✓)" : "(not set up yet)"}
          </label>
        </section>
        <button className="btn">Save settings</button>
      </form>
    </div>
  );
}
