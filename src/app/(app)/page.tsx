import Link from "next/link";
import { Empty, Stat } from "@/components/ui";
import { loadLoans } from "@/lib/data";
import { addDays, addMonths, formatDate, monthKey, todayIST } from "@/lib/dates";
import { loanNo, rs } from "@/lib/format";
import { requireOwner } from "@/lib/supabase";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const client = await requireOwner();
  const [loans, { data: pending }] = await Promise.all([
    loadLoans(client),
    client.from("agreements").select("loan_id, loan:loans(loan_no, customer:customers(name))").eq("status", "submitted").returns<{ loan_id: string; loan: { loan_no: number; customer: { name: string } } }[]>(),
  ]);
  const today = todayIST();
  const thisMonth = monthKey(today);
  const active = loans.filter((l) => l.status === "active");

  const principalOut = active.reduce((s, l) => s + l.s.principalOutstanding, 0);
  const overdueLoans = active.filter((l) => l.s.overdueAmount > 0).sort((a, b) => b.s.overdueDays - a.s.overdueDays);
  const overdueTotal = overdueLoans.reduce((s, l) => s + l.s.overdueAmount, 0);
  const monthlyIncome = active.reduce((s, l) => s + l.s.monthlyInterest, 0);
  const weekEnd = addDays(today, 7);
  const dueSoon = active
    .filter((l) => l.s.nextDue && l.s.nextDue.date <= weekEnd)
    .sort((a, b) => a.s.nextDue!.date.localeCompare(b.s.nextDue!.date));

  // last 6 months: money in (payments), interest part, money out (new loans)
  const months = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(thisMonth + "-01", i - 5)));
  const flow = new Map(months.map((m) => [m, { lent: 0, collected: 0, interest: 0 }]));
  let totalInterestEarned = 0;
  for (const l of loans) {
    const lentIn = flow.get(monthKey(l.start_date));
    if (lentIn) lentIn.lent += Number(l.principal);
    for (const a of l.s.allocations) {
      totalInterestEarned += a.toInterest + a.toAdvance;
      const f = flow.get(monthKey(a.date));
      if (f) {
        f.collected += a.amount;
        f.interest += a.toInterest + a.toAdvance;
      }
    }
  }
  const cur = flow.get(thisMonth)!;
  const maxBar = Math.max(1, ...[...flow.values()].flatMap((f) => [f.lent, f.collected]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="muted">As of {formatDate(today)}</p>
        </div>
      </div>

      {(pending ?? []).length > 0 && (
        <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          Signed agreements waiting for your check:{" "}
          {pending!.map((a, i) => (
            <span key={a.loan_id}>{i > 0 && ", "}<Link className="link" href={`/loans/${a.loan_id}`}>{a.loan.customer.name} ({loanNo(a.loan.loan_no)})</Link></span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money lent out" value={rs(principalOut)} sub={`${active.length} active loans`} />
        <Stat label="Overdue interest" value={rs(overdueTotal)} sub={`${overdueLoans.length} customers`} tone={overdueTotal ? "bad" : "default"} />
        <Stat label="Expected interest / month" value={rs(monthlyIncome)} sub={principalOut ? `${((monthlyIncome / principalOut) * 100).toFixed(2)}% avg rate` : undefined} />
        <Stat label="Collected this month" value={rs(cur.collected)} sub={`${rs(cur.interest)} interest`} tone="good" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">Overdue ({overdueLoans.length})</h2>
          {overdueLoans.length === 0 ? (
            <Empty>No overdue interest. 🎉</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Customer</th><th>Loan</th><th className="text-right">Pending</th><th className="text-right">Days</th></tr></thead>
                <tbody>
                  {overdueLoans.slice(0, 10).map((l) => (
                    <tr key={l.id}>
                      <td><Link className="link" href={`/loans/${l.id}`}>{l.customer.name}</Link></td>
                      <td className="text-slate-500">{loanNo(l.loan_no)}</td>
                      <td className="text-right font-medium text-red-700 tabular-nums">{rs(l.s.overdueAmount)}</td>
                      <td className="text-right tabular-nums">{l.s.overdueDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {overdueLoans.length > 10 && <Link href="/loans?filter=overdue" className="link mt-2 inline-block text-sm">See all</Link>}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Due in next 7 days ({dueSoon.length})</h2>
          {dueSoon.length === 0 ? (
            <Empty>Nothing due this week.</Empty>
          ) : (
            <table className="table">
              <thead><tr><th>Customer</th><th>Due</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {dueSoon.map((l) => (
                  <tr key={l.id}>
                    <td><Link className="link" href={`/loans/${l.id}`}>{l.customer.name}</Link></td>
                    <td>{formatDate(l.s.nextDue!.date)}</td>
                    <td className="text-right tabular-nums">{rs(l.s.nextDue!.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title mb-0">Last 6 months</h2>
          <div className="flex gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-slate-400" />Lent</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />Collected</span>
          </div>
        </div>
        <div className="grid grid-cols-6 items-end gap-2" style={{ height: 160 }}>
          {months.map((m) => {
            const f = flow.get(m)!;
            return (
              <div key={m} className="flex h-full flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t bg-slate-400" style={{ height: `${(f.lent / maxBar) * 100}%` }} title={`Lent ${rs(f.lent)}`} />
                  <div className="w-1/3 rounded-t bg-brand" style={{ height: `${(f.collected / maxBar) * 100}%` }} title={`Collected ${rs(f.collected)}`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 grid grid-cols-6 gap-2 text-center text-xs text-slate-500">
          {months.map((m) => (
            <div key={m}>
              <div>{formatDate(m + "-01").split(" ").slice(1).join(" ")}</div>
              <div className="tabular-nums text-slate-700">{rs(flow.get(m)!.collected)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total interest earned" value={rs(totalInterestEarned)} tone="good" />
        <Stat label="Loans given (all time)" value={String(loans.length)} />
        <Stat label="Closed loans" value={String(loans.filter((l) => l.status === "closed").length)} />
        <Stat label="Lent this month" value={rs(cur.lent)} />
      </div>
      {loans.length === 0 && (
        <Empty>
          No loans yet. <Link href="/customers/new" className="link">Add a customer</Link> and then create a loan.
        </Empty>
      )}
    </div>
  );
}
