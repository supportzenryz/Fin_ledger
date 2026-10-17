import Link from "next/link";
import { Field } from "@/components/ui";
import type { Customer } from "@/lib/data";
import { saveCustomer } from "./actions";

export function CustomerForm({ c }: { c?: Customer }) {
  return (
    <form action={saveCustomer} className="card grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Full name *" name="name">
        <input className="input" id="name" name="name" required defaultValue={c?.name} />
      </Field>
      <Field label="Mobile / WhatsApp number *" name="phone">
        <input className="input" id="phone" name="phone" required inputMode="tel" placeholder="98765 43210" defaultValue={c?.phone} />
      </Field>
      <Field label="Email (agreement is sent here)" name="email">
        <input className="input" id="email" name="email" type="email" defaultValue={c?.email ?? ""} />
      </Field>
      <Field label="Occupation" name="occupation">
        <input className="input" id="occupation" name="occupation" defaultValue={c?.occupation ?? ""} />
      </Field>
      <Field label="Address" name="address" className="sm:col-span-2">
        <textarea className="input" id="address" name="address" rows={2} defaultValue={c?.address ?? ""} />
      </Field>
      <Field label="PAN" name="pan">
        <input className="input uppercase" id="pan" name="pan" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" defaultValue={c?.pan ?? ""} />
      </Field>
      <Field label="Aadhaar - last 4 digits only" name="aadhaar_last4">
        <input className="input" id="aadhaar_last4" name="aadhaar_last4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" defaultValue={c?.aadhaar_last4 ?? ""} />
      </Field>
      <Field label="Guarantor / reference name" name="guarantor_name">
        <input className="input" id="guarantor_name" name="guarantor_name" defaultValue={c?.guarantor_name ?? ""} />
      </Field>
      <Field label="Guarantor phone" name="guarantor_phone">
        <input className="input" id="guarantor_phone" name="guarantor_phone" inputMode="tel" defaultValue={c?.guarantor_phone ?? ""} />
      </Field>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <textarea className="input" id="notes" name="notes" rows={2} defaultValue={c?.notes ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="whatsapp_opt_in" defaultChecked={c?.whatsapp_opt_in ?? true} />
        Customer agreed to receive WhatsApp reminders
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn">{c ? "Save changes" : "Add customer"}</button>
        <Link href={c ? `/customers/${c.id}` : "/customers"} className="btn-outline">Cancel</Link>
      </div>
    </form>
  );
}
