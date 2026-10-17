"use client";

import { useState } from "react";
import { createLoan } from "../actions";

type Opt = { id: string; name: string; phone: string; email: string | null };

const inr = (n: number) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

export function LoanForm({ customers, customerId, defaultRate, today }: { customers: Opt[]; customerId?: string; defaultRate: number; today: string }) {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(String(defaultRate));
  const [months, setMonths] = useState("");
  const p = Number(amount.replace(/,/g, "")) || 0;
  const monthly = (p * (Number(rate) || 0)) / 100;
  const n = Number(months) || 0;

  return (
    <form action={createLoan} className="card grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="customer_id">Customer *</label>
        <select id="customer_id" name="customer_id" className="input" defaultValue={customerId ?? ""} required>
          <option value="" disabled>Select customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="principal">Loan amount (₹) *</label>
        <input id="principal" name="principal" className="input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" />
      </div>
      <div>
        <label className="label" htmlFor="rate_pct_month">Interest % per month *</label>
        <input id="rate_pct_month" name="rate_pct_month" className="input" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="start_date">Date given</label>
        <input id="start_date" name="start_date" type="date" className="input" defaultValue={today} required />
      </div>
      <div>
        <label className="label" htmlFor="tenure_months">Term in months (optional)</label>
        <input id="tenure_months" name="tenure_months" className="input" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="e.g. 12" />
      </div>
      <div>
        <label className="label" htmlFor="disbursal_mode">Given by</label>
        <select id="disbursal_mode" name="disbursal_mode" className="input">
          <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="disbursal_ref">UPI / bank reference</label>
        <input id="disbursal_ref" name="disbursal_ref" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="collateral">Security / collateral (optional)</label>
        <input id="collateral" name="collateral" className="input" placeholder="e.g. gold chain 20g, vehicle RC, cheque no." />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" className="input" rows={2} />
      </div>

      <div className="rounded-lg bg-brand-soft/60 p-3 text-sm sm:col-span-2">
        <div>Monthly interest: <b>{inr(monthly)}</b> (₹{rate || 0} per ₹100 per month · {((Number(rate) || 0) * 12).toFixed(1)}% a year)</div>
        {n > 0 && <div>Interest over {n} months: <b>{inr(monthly * n)}</b> · total back incl. principal: <b>{inr(p + monthly * n)}</b></div>}
      </div>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="send_agreement" defaultChecked />
        Create agreement and send the sign-and-upload link to the customer (email / WhatsApp)
      </label>
      <div className="sm:col-span-2">
        <button className="btn">Create loan</button>
      </div>
    </form>
  );
}
