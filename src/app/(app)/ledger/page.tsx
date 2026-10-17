import Link from "next/link";
import { Empty, Stat } from "@/components/ui";
import { cashBook } from "@/lib/cashbook";
import { loadLoans } from "@/lib/data";
import { formatDate, monthKey, todayIST } from "@/lib/dates";
import { rs } from "@/lib/format";
import { requireOwner } from "@/lib/supabase";

export const metadata = { title: "Ledger" };

export default async function Ledger({ searchParams }: PageProps<"/ledger">) {
  const { m } = await searchParams;
  const month = m === "all" ? undefined : String(m ?? monthKey(todayIST()));
  const client = await requireOwner();
  const rows = cashBook(await loadLoans(client), month);
  const t = rows.reduce((s, r) => ({ out: s.out + r.out, in: s.in + r.in, interest: s.interest + r.interest, principal: s.principal + r.principal }), { out: 0, in: 0, interest: 0, principal: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Ledger (cash book)</h1>
          <p className="muted">Every rupee out (loans) and in (payments). Each loan also has its own passbook.</p>
        </div>
        <a href={`/api/export?m=${month ?? "all"}`} className="btn-outline">Download Excel (CSV)</a>
      </div>
      <form className="flex flex-wrap items-center gap-2">
        <input type="month" name="m" defaultValue={month} className="input w-44" />
        <button className="btn-outline">Show</button>
        <Link href="/ledger?m=all" className="btn-outline">All time</Link>
      </form>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money out (loans given)" value={rs(t.out)} />
        <Stat label="Money in (received)" value={rs(t.in)} tone="good" />
        <Stat label="of which interest" value={rs(t.interest)} tone="good" />
        <Stat label="of which principal" value={rs(t.principal)} />
      </div>
      {rows.length === 0 ? (
        <Empty>No entries for this period.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th className="pl-4">Date</th><th>Customer</th><th>Loan</th><th>Type</th><th>Mode / ref</th><th className="text-right">Out</th><th className="text-right">In</th><th className="pr-4 text-right">Interest</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap pl-4">{formatDate(r.date)}</td>
                  <td><Link href={`/customers/${r.customerId}`} className="hover:underline">{r.customer}</Link></td>
                  <td><Link href={`/loans/${r.loanId}`} className="link">{r.loan}</Link></td>
                  <td>{r.type}</td>
                  <td className="text-xs text-slate-500">{r.mode}{r.reference ? ` · ${r.reference}` : ""}</td>
                  <td className="text-right tabular-nums text-red-700">{r.out ? rs(r.out) : ""}</td>
                  <td className="text-right tabular-nums text-emerald-700">{r.in ? rs(r.in) : ""}</td>
                  <td className="pr-4 text-right tabular-nums">{r.interest ? rs(r.interest) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
