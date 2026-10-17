import { Flash } from "@/components/ui";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "New customer" };

export default async function NewCustomer({ searchParams }: PageProps<"/customers/new">) {
  const { error } = await searchParams;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="page-title">New customer</h1>
      <Flash error={error} />
      <CustomerForm />
      <p className="muted">
        Collect only the last 4 digits of Aadhaar. When uploading an Aadhaar copy, use a masked Aadhaar (downloadable from the UIDAI site) or cover the first 8 digits.
      </p>
    </div>
  );
}
