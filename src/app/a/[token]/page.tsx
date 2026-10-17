import type { Metadata } from "next";
import { formatDate } from "@/lib/dates";
import { loanNo, rs } from "@/lib/format";
import { findAgreement } from "./lookup";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Loan agreement", robots: { index: false } };

function Shell({ business, children }: { business?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 py-8">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">₹</span>
        <span className="font-semibold">{business || "Loan agreement"}</span>
      </div>
      {children}
    </main>
  );
}

export default async function AgreementPage({ params }: PageProps<"/a/[token]">) {
  const { token } = await params;
  const ag = await findAgreement(token);

  if (!ag || ag.expired) {
    return <Shell><div className="card">This link is invalid or has expired. Please contact the lender for a new link.</div></Shell>;
  }
  if (ag.status === "submitted" || ag.status === "verified") {
    return (
      <Shell business={ag.business}>
        <div className="card space-y-2">
          <h1 className="text-lg font-semibold">Thank you, {ag.customer_name} ✓</h1>
          <p className="muted">We have received your signed agreement and ID proof for loan {loanNo(ag.loan_no)}. {ag.status === "verified" ? "It has been verified." : "We will verify it shortly."}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell business={ag.business}>
      <div className="card space-y-1">
        <h1 className="text-lg font-semibold">Hello {ag.customer_name}</h1>
        <p className="muted">Loan {loanNo(ag.loan_no)} · {rs(ag.principal)} at {ag.rate}% per month · dated {formatDate(ag.start_date)}</p>
      </div>
      {ag.status === "rejected" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your previous upload could not be accepted. Please upload clear copies again.</p>}

      <div className="card space-y-3">
        <h2 className="font-semibold">Step 1 · Download and sign</h2>
        <a href={`/a/${token}/pdf`} className="btn w-full">Download agreement (PDF)</a>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Print the agreement and read it fully.</li>
          <li>Write your initials at the bottom of every page and sign where it says <b>Signature of Borrower</b>.</li>
          <li>Take clear photos of every page in good light, or scan them into one PDF.</li>
        </ol>
      </div>

      <UploadForm token={token} />
    </Shell>
  );
}
