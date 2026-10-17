import Link from "next/link";
import { Empty, Flash } from "@/components/ui";
import { loadSettings } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { fetchAll, requireOwner } from "@/lib/supabase";
import { LoanForm } from "./loan-form";

export const metadata = { title: "New loan" };

export default async function NewLoan({ searchParams }: PageProps<"/loans/new">) {
  const { customer, error } = await searchParams;
  const client = await requireOwner();
  const [customers, settings] = await Promise.all([
    fetchAll<{ id: string; name: string; phone: string; email: string | null }>((from, to) =>
      client.from("customers").select("id, name, phone, email").eq("archived", false).order("name").range(from, to)),
    loadSettings(client),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="page-title">New loan</h1>
      <Flash error={error} />
      {customers.length === 0 ? (
        <Empty>Add a customer first. <Link className="link" href="/customers/new">Add customer</Link></Empty>
      ) : (
        <LoanForm customers={customers} customerId={customer ? String(customer) : undefined} defaultRate={Number(settings.default_rate_pct)} today={todayIST()} />
      )}
    </div>
  );
}
