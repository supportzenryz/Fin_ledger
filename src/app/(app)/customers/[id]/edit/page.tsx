import { notFound } from "next/navigation";
import { Flash } from "@/components/ui";
import type { Customer } from "@/lib/data";
import { requireOwner } from "@/lib/supabase";
import { CustomerForm } from "../../customer-form";

export const metadata = { title: "Edit customer" };

export default async function EditCustomer({ params, searchParams }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const { error } = await searchParams;
  const client = await requireOwner();
  const { data } = await client.from("customers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="page-title">Edit {data.name}</h1>
      <Flash error={error} />
      <CustomerForm c={data as Customer} />
    </div>
  );
}
