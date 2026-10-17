import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Empty, Flash, Stat, loanHealth } from "@/components/ui";
import { loadLoans, type Customer } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { loanNo, rs, waLink } from "@/lib/format";
import { requireOwner } from "@/lib/supabase";
import { deleteKyc, setArchived, verifyKyc } from "../actions";
import { KycUpload } from "./kyc-upload";

const DOC_TYPES: Record<string, string> = {
  pan: "PAN card",
  aadhaar_masked: "Aadhaar (masked)",
  photo: "Photo",
  address_proof: "Address proof",
  bank: "Bank / cheque",
  other: "Other",
};

type Kyc = { id: string; doc_type: string; file_path: string; file_name: string | null; uploaded_by: string; verified: boolean; created_at: string };

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { msg, error } = await searchParams;
  const client = await requireOwner();
  const [{ data: c }, { data: docs }, loans] = await Promise.all([
    client.from("customers").select("*").eq("id", id).maybeSingle<Customer>(),
    client.from("kyc_documents").select("*").eq("customer_id", id).order("created_at", { ascending: false }).returns<Kyc[]>(),
    loadLoans(client, { customerId: id }),
  ]);
  if (!c) notFound();
  const active = loans.filter((l) => l.status === "active");
  const wa = waLink(c.phone, `Hi ${c.name}, `);

  return (
    <div className="space-y-5">
      <Flash msg={msg} error={error} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{c.name} {c.archived && <Badge status="closed">archived</Badge>}</h1>
          <p className="muted">Customer #{c.code} · since {formatDate(c.created_at.slice(0, 10))}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/loans/new?customer=${c.id}`} className="btn">+ New loan</Link>
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-wa">WhatsApp</a>}
          <a href={`tel:${c.phone}`} className="btn-outline">Call</a>
          <Link href={`/customers/${c.id}/edit`} className="btn-outline">Edit</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Principal outstanding" value={rs(active.reduce((s, l) => s + l.s.principalOutstanding, 0))} />
        <Stat label="Overdue interest" value={rs(active.reduce((s, l) => s + l.s.overdueAmount, 0))} tone="bad" />
        <Stat label="Interest paid (all time)" value={rs(loans.reduce((s, l) => s + l.s.interestPaid, 0))} tone="good" />
        <Stat label="Loans" value={`${active.length} active / ${loans.length} total`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">Details</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-slate-500">Phone</dt><dd>{c.phone} {c.whatsapp_opt_in ? "" : "(no WhatsApp reminders)"}</dd>
            <dt className="text-slate-500">Email</dt><dd>{c.email ?? "-"}</dd>
            <dt className="text-slate-500">Address</dt><dd className="whitespace-pre-line">{c.address ?? "-"}</dd>
            <dt className="text-slate-500">Occupation</dt><dd>{c.occupation ?? "-"}</dd>
            <dt className="text-slate-500">PAN</dt><dd>{c.pan ?? "-"}</dd>
            <dt className="text-slate-500">Aadhaar</dt><dd>{c.aadhaar_last4 ? `XXXX XXXX ${c.aadhaar_last4}` : "-"}</dd>
            <dt className="text-slate-500">Guarantor</dt><dd>{c.guarantor_name ? `${c.guarantor_name} ${c.guarantor_phone ?? ""}` : "-"}</dd>
            <dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-line">{c.notes ?? "-"}</dd>
          </dl>
          <form action={setArchived} className="mt-4">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="archived" value={String(!c.archived)} />
            <button className="btn-outline text-xs">{c.archived ? "Restore customer" : "Archive customer"}</button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">KYC documents</h2>
          {(docs ?? []).length === 0 ? (
            <Empty>No documents yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {docs!.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <a className="link" href={`/api/file?bucket=kyc&path=${encodeURIComponent(d.file_path)}`} target="_blank">{DOC_TYPES[d.doc_type] ?? d.doc_type}</a>
                    <div className="text-xs text-slate-500">
                      {formatDate(d.created_at.slice(0, 10))} · by {d.uploaded_by} {d.verified ? "· ✓ verified" : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!d.verified && (
                      <form action={verifyKyc}><input type="hidden" name="id" value={d.id} /><button className="btn-outline px-2 py-1 text-xs">Mark verified</button></form>
                    )}
                    <form action={deleteKyc}><input type="hidden" name="id" value={d.id} /><button className="btn-danger px-2 py-1 text-xs">Delete</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <KycUpload customerId={c.id} docTypes={DOC_TYPES} />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Loans</h2>
        {loans.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Loan</th><th>Given on</th><th className="text-right">Amount</th><th className="text-right">Rate</th><th className="text-right">Principal out</th><th>Next due</th><th>Status</th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td><Link className="link" href={`/loans/${l.id}`}>{loanNo(l.loan_no)}</Link></td>
                    <td>{formatDate(l.start_date)}</td>
                    <td className="text-right tabular-nums">{rs(l.principal)}</td>
                    <td className="text-right">{l.rate_pct_month}%</td>
                    <td className="text-right tabular-nums">{rs(l.s.principalOutstanding)}</td>
                    <td>{l.s.nextDue ? `${formatDate(l.s.nextDue.date)} · ${rs(l.s.nextDue.amount)}` : "-"}</td>
                    <td><Badge status={loanHealth(l)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
