import Link from "next/link";
import { Badge, Empty } from "@/components/ui";
import { loadLoans, type Customer } from "@/lib/data";
import { rs } from "@/lib/format";
import { fetchAll, requireOwner } from "@/lib/supabase";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: PageProps<"/customers">) {
  const { q, archived } = await searchParams;
  const client = await requireOwner();
  const showArchived = archived === "1";
  const [customers, loans] = await Promise.all([
    fetchAll<Customer>((from, to) => client.from("customers").select("*").eq("archived", showArchived).order("name").range(from, to)),
    loadLoans(client, { status: "active" }),
  ]);
  const term = String(q ?? "").trim().toLowerCase();
  const list = term
    ? customers.filter((c) => [c.name, c.phone, c.pan, String(c.code)].some((v) => v?.toLowerCase().includes(term)))
    : customers;
  const byCustomer = new Map<string, { principal: number; overdue: number; count: number }>();
  for (const l of loans) {
    const t = byCustomer.get(l.customer_id) ?? { principal: 0, overdue: 0, count: 0 };
    t.principal += l.s.principalOutstanding;
    t.overdue += l.s.overdueAmount;
    t.count++;
    byCustomer.set(l.customer_id, t);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Customers ({list.length})</h1>
        <Link href="/customers/new" className="btn">+ Add customer</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={String(q ?? "")} placeholder="Search name, phone, PAN" className="input max-w-sm" />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <button className="btn-outline">Search</button>
        <Link href={showArchived ? "/customers" : "/customers?archived=1"} className="btn-outline">
          {showArchived ? "Show current" : "Show archived"}
        </Link>
      </form>
      {list.length === 0 ? (
        <Empty>No customers found.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th className="pl-4">Name</th><th>Phone</th><th className="text-right">Active loans</th><th className="text-right">Principal out</th><th className="pr-4 text-right">Overdue</th></tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const t = byCustomer.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className="pl-4"><Link href={`/customers/${c.id}`} className="link">{c.name}</Link> <span className="text-xs text-slate-400">#{c.code}</span></td>
                    <td className="tabular-nums">{c.phone}</td>
                    <td className="text-right">{t?.count ?? 0}</td>
                    <td className="text-right tabular-nums">{rs(t?.principal ?? 0)}</td>
                    <td className="pr-4 text-right">{t?.overdue ? <Badge status="overdue">{rs(t.overdue)}</Badge> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
