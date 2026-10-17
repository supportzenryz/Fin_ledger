import Link from "next/link";
import { Badge, Empty, loanHealth } from "@/components/ui";
import { loadLoans } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { loanNo, rs } from "@/lib/format";
import { requireOwner } from "@/lib/supabase";

export const metadata = { title: "Loans" };

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "overdue", label: "Overdue" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default async function Loans({ searchParams }: PageProps<"/loans">) {
  const { filter = "active", q } = await searchParams;
  const client = await requireOwner();
  const all = await loadLoans(client);
  const term = String(q ?? "").trim().toLowerCase();
  const loans = all
    .filter((l) =>
      filter === "all" ? true
        : filter === "overdue" ? l.status === "active" && l.s.overdueAmount > 0
          : filter === "closed" ? l.status !== "active"
            : l.status === "active")
    .filter((l) => !term || l.customer.name.toLowerCase().includes(term) || loanNo(l.loan_no).toLowerCase().includes(term))
    .sort((a, b) => b.s.overdueDays - a.s.overdueDays || (a.s.nextDue?.date ?? "z").localeCompare(b.s.nextDue?.date ?? "z"));
  const totals = loans.reduce((t, l) => ({ p: t.p + l.s.principalOutstanding, o: t.o + l.s.overdueAmount, m: t.m + (l.status === "active" ? l.s.monthlyInterest : 0) }), { p: 0, o: 0, m: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Loans</h1>
        <Link href="/loans/new" className="btn">+ New loan</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/loans?filter=${f.key}`}
            className={`rounded-full px-3 py-1 text-sm ${filter === f.key ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="filter" value={String(filter)} />
          <input name="q" defaultValue={String(q ?? "")} placeholder="Search customer / loan no." className="input w-56" />
        </form>
      </div>
      <p className="muted">
        {loans.length} loans · principal out {rs(totals.p)} · overdue {rs(totals.o)} · monthly interest {rs(totals.m)}
      </p>
      {loans.length === 0 ? (
        <Empty>No loans here.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th className="pl-4">Loan</th><th>Customer</th><th>Given</th><th className="text-right">Amount</th><th className="text-right">Rate</th><th className="text-right">Principal out</th><th className="text-right">Overdue</th><th>Next due</th><th className="pr-4">Status</th></tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="pl-4"><Link href={`/loans/${l.id}`} className="link">{loanNo(l.loan_no)}</Link></td>
                  <td><Link href={`/customers/${l.customer_id}`} className="hover:underline">{l.customer.name}</Link></td>
                  <td className="whitespace-nowrap">{formatDate(l.start_date)}</td>
                  <td className="text-right tabular-nums">{rs(l.principal)}</td>
                  <td className="text-right">{l.rate_pct_month}%</td>
                  <td className="text-right tabular-nums">{rs(l.s.principalOutstanding)}</td>
                  <td className="text-right tabular-nums">{l.s.overdueAmount ? <span className="text-red-700">{rs(l.s.overdueAmount)} · {l.s.overdueDays}d</span> : "-"}</td>
                  <td className="whitespace-nowrap">{l.s.nextDue ? `${formatDate(l.s.nextDue.date)}` : "-"}</td>
                  <td className="pr-4"><Badge status={loanHealth(l)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
