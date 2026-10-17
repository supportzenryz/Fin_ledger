import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Empty, Flash, Stat, loanHealth } from "@/components/ui";
import { loadLoans, loadSettings } from "@/lib/data";
import { formatDate, todayIST } from "@/lib/dates";
import { loanNo, rs, waLink } from "@/lib/format";
import { dueReminder, overdueReminder } from "@/lib/messages";
import { requireOwner } from "@/lib/supabase";
import { appUrl } from "@/lib/url";
import { deletePayment, recordPayment, remindNow, reviewAgreement, sendAgreement, setLoanStatus, updateLoanNotes } from "../actions";

type Agreement = { id: string; token: string; status: string; pdf_path: string; signed_path: string | null; id_proof_path: string | null; submitted_at: string | null; expires_at: string; created_at: string };
type Note = { id: string; channel: string; kind: string; status: string; detail: string | null; created_at: string };

const file = (bucket: string, path: string) => `/api/file?bucket=${bucket}&path=${encodeURIComponent(path)}`;

export default async function LoanPage({ params, searchParams }: PageProps<"/loans/[id]">) {
  const { id } = await params;
  const { msg, error } = await searchParams;
  const client = await requireOwner();
  const [[l], settings, { data: agreements }, { data: notes }] = await Promise.all([
    loadLoans(client, { loanId: id }),
    loadSettings(client),
    client.from("agreements").select("*").eq("loan_id", id).order("created_at", { ascending: false }).returns<Agreement[]>(),
    client.from("notifications").select("*").eq("loan_id", id).order("created_at", { ascending: false }).limit(20).returns<Note[]>(),
  ]);
  if (!l) notFound();
  const s = l.s;
  const base = await appUrl();
  const today = todayIST();
  const reminder = s.overdueAmount > 0
    ? overdueReminder({ name: l.customer.name, amount: s.overdueAmount, loan: loanNo(l.loan_no), since: s.overdueSince!, business: settings.business_name })
    : s.nextDue ? dueReminder("reminder_before", { name: l.customer.name, amount: s.nextDue.amount, loan: loanNo(l.loan_no), due: s.nextDue.date, business: settings.business_name }) : null;
  const wa = reminder ? waLink(l.customer.phone, reminder.text) : null;
  const allocation = new Map(s.allocations.map((a) => [a.paymentId, a]));
  const suggested = s.overdueAmount > 0 ? s.overdueAmount : (s.nextDue?.amount ?? 0);

  return (
    <div className="space-y-5">
      <Flash msg={msg} error={error} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{loanNo(l.loan_no)} · <Link href={`/customers/${l.customer_id}`} className="link">{l.customer.name}</Link> <Badge status={loanHealth(l)} /></h1>
          <p className="muted">
            {rs(l.principal)} at {l.rate_pct_month}% / month · given {formatDate(l.start_date)} by {l.disbursal_mode}
            {s.maturityDate && ` · term ends ${formatDate(s.maturityDate)}`}
            {l.closed_on && ` · closed ${formatDate(l.closed_on)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && l.status === "active" && <a href={wa} target="_blank" rel="noreferrer" className="btn-wa">WhatsApp reminder</a>}
          {reminder && l.status === "active" && (
            <form action={remindNow}><input type="hidden" name="loan_id" value={l.id} /><button className="btn-outline">Send auto reminder</button></form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Principal outstanding" value={rs(s.principalOutstanding)} />
        <Stat label="Overdue interest" value={rs(s.overdueAmount)} sub={s.overdueSince ? `since ${formatDate(s.overdueSince)} (${s.overdueDays} days)` : "none"} tone={s.overdueAmount ? "bad" : "default"} />
        <Stat label="Next due" value={s.nextDue ? rs(s.nextDue.amount) : "-"} sub={s.nextDue ? formatDate(s.nextDue.date) : undefined} />
        <Stat label="To close today" value={rs(s.settlementToday)} sub="principal + interest till today" />
        <Stat label="Interest received" value={rs(s.interestPaid)} sub={`total received ${rs(s.totalPaid)}`} tone="good" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {l.status === "active" ? (
          <section className="card">
            <h2 className="card-title">Record payment</h2>
            <form action={recordPayment} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="loan_id" value={l.id} />
              <div>
                <label className="label" htmlFor="amount">Amount received (₹)</label>
                <input id="amount" name="amount" className="input" inputMode="decimal" required defaultValue={suggested || ""} />
              </div>
              <div>
                <label className="label" htmlFor="paid_on">Date</label>
                <input id="paid_on" name="paid_on" type="date" className="input" defaultValue={today} required />
              </div>
              <div>
                <label className="label" htmlFor="mode">Mode</label>
                <select id="mode" name="mode" className="input">
                  <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reference">UPI / txn reference</label>
                <input id="reference" name="reference" className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="principal_part">Of this, towards principal (leave empty = automatic)</label>
                <input id="principal_part" name="principal_part" className="input" inputMode="decimal" placeholder="Auto: pending interest first, then this month's interest, rest principal" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">Note</label>
                <input id="notes" name="notes" className="input" />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="send_receipt" defaultChecked /> Send receipt to customer
              </label>
              <div className="sm:col-span-2"><button className="btn">Save payment</button></div>
            </form>
          </section>
        ) : (
          <section className="card">
            <h2 className="card-title">Loan {l.status.replace("_", " ")}</h2>
            <p className="muted">This loan was closed on {formatDate(l.closed_on)}. Reopen it to record more payments.</p>
          </section>
        )}

        <section className="card">
          <h2 className="card-title">Agreement</h2>
          {(agreements ?? []).length === 0 ? (
            <Empty>No agreement sent yet.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {agreements!.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><Badge status={a.status} /> <span className="text-slate-500">sent {formatDate(a.created_at.slice(0, 10))}</span></span>
                    <a className="link" href={file("agreements", a.pdf_path)} target="_blank">Agreement PDF</a>
                  </div>
                  <div className="mt-2 break-all text-xs text-slate-500">Customer link: {base}/a/{a.token}</div>
                  {a.signed_path && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <a className="link" href={file("agreements", a.signed_path)} target="_blank">Signed copy</a>
                      {a.id_proof_path && <a className="link" href={file("kyc", a.id_proof_path)} target="_blank">ID proof</a>}
                      <span className="text-xs text-slate-500">uploaded {a.submitted_at ? formatDate(a.submitted_at.slice(0, 10)) : ""}</span>
                    </div>
                  )}
                  {a.status === "submitted" && (
                    <div className="mt-2 flex gap-2">
                      <form action={reviewAgreement}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="verified" /><button className="btn px-2 py-1 text-xs">Verify</button></form>
                      <form action={reviewAgreement}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="rejected" /><button className="btn-danger px-2 py-1 text-xs">Reject (ask again)</button></form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={sendAgreement} className="mt-3">
            <input type="hidden" name="loan_id" value={l.id} />
            <button className="btn-outline">{(agreements ?? []).length ? "Send a fresh agreement link" : "Create & send agreement"}</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Passbook</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Details</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th><th></th></tr></thead>
            <tbody>
              {s.ledger.map((r, i) => {
                const p = r.paymentId ? l.payments.find((x) => x.id === r.paymentId) : null;
                return (
                  <tr key={i} className={r.kind === "payment" ? "bg-emerald-50/40" : ""}>
                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                    <td>
                      {r.label}
                      {p && <div className="text-xs text-slate-500">{p.mode}{p.reference ? ` · ${p.reference}` : ""}{p.notes ? ` · ${p.notes}` : ""}{p.principal_part != null ? " · manual split" : ""}</div>}
                    </td>
                    <td className="text-right tabular-nums">{r.debit ? rs(r.debit) : ""}</td>
                    <td className="text-right tabular-nums text-emerald-700">{r.credit ? rs(r.credit) : ""}</td>
                    <td className="text-right font-medium tabular-nums">{rs(r.balance)}</td>
                    <td className="text-right">
                      {p && allocation.has(p.id) && (
                        <form action={deletePayment}>
                          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="loan_id" value={l.id} />
                          <button className="text-xs text-red-600 hover:underline" title="Delete this payment">Delete</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Monthly interest schedule</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>#</th><th>Period</th><th>Due date</th><th className="text-right">On principal</th><th className="text-right">Interest</th><th className="text-right">Paid</th><th>Status</th></tr></thead>
            <tbody>
              {[...s.periods].reverse().map((p) => (
                <tr key={p.n}>
                  <td>{p.n}</td>
                  <td className="whitespace-nowrap">{formatDate(p.from)} – {formatDate(p.due)}</td>
                  <td className="whitespace-nowrap">{formatDate(p.due)}</td>
                  <td className="text-right tabular-nums">{rs(p.principalBase)}</td>
                  <td className="text-right tabular-nums">{rs(p.interest)}</td>
                  <td className="text-right tabular-nums">{rs(p.paid)}</td>
                  <td><Badge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">Notes & security</h2>
          <form action={updateLoanNotes} className="space-y-3">
            <input type="hidden" name="id" value={l.id} />
            <input name="collateral" className="input" placeholder="Security / collateral" defaultValue={l.collateral ?? ""} />
            <textarea name="notes" className="input" rows={3} placeholder="Notes" defaultValue={l.notes ?? ""} />
            <button className="btn-outline">Save</button>
          </form>
          <div className="mt-4 border-t border-slate-100 pt-4">
            {l.status === "active" ? (
              <form action={setLoanStatus} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={l.id} />
                <div>
                  <label className="label" htmlFor="closed_on">Close date</label>
                  <input id="closed_on" type="date" name="closed_on" className="input" defaultValue={today} />
                </div>
                <button name="status" value="closed" className="btn-outline">Close loan</button>
                <button name="status" value="written_off" className="btn-danger">Write off</button>
              </form>
            ) : (
              <form action={setLoanStatus}>
                <input type="hidden" name="id" value={l.id} />
                <button name="status" value="active" className="btn-outline">Reopen loan</button>
              </form>
            )}
            {l.status === "active" && s.principalOutstanding > 0 && (
              <p className="mt-2 text-xs text-slate-500">Tip: record the final payment first; the loan stops charging interest once principal is fully repaid.</p>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Messages sent</h2>
          {(notes ?? []).length === 0 ? (
            <Empty>No messages yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {notes!.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2 py-1.5">
                  <span>{n.kind.replace("_", " ")} · {n.channel}<div className="text-xs text-slate-500">{n.detail}</div></span>
                  <span className="text-right"><Badge status={n.status} /><div className="text-xs text-slate-500">{formatDate(n.created_at.slice(0, 10))}</div></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
