import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Badge, Empty, Flash } from "@/components/ui";
import { loadLoans, loadSettings } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { loanNo, waLink } from "@/lib/format";
import { emailConfigured, whatsappConfigured } from "@/lib/notify";
import { planReminders, runReminders } from "@/lib/reminders";
import { requireOwner } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const metadata = { title: "Reminders" };

type Note = { id: string; channel: string; kind: string; status: string; detail: string | null; created_at: string; customer: { name: string } | null; loan_id: string | null };

async function runNow() {
  "use server";
  const client = await requireOwner();
  const r = await runReminders(client);
  revalidatePath("/reminders");
  redirect(`/reminders?msg=${encodeURIComponent(`Processed ${r.length} reminders`)}`);
}

export default async function Reminders({ searchParams }: PageProps<"/reminders">) {
  const { msg } = await searchParams;
  const client = await requireOwner();
  const [loans, settings, { data: log }] = await Promise.all([
    loadLoans(client, { status: "active" }),
    loadSettings(client),
    client.from("notifications").select("*, customer:customers(name)").order("created_at", { ascending: false }).limit(100).returns<Note[]>(),
  ]);
  const planned = planReminders(loans, settings);
  const wa = settings.whatsapp_enabled && whatsappConfigured();
  const mail = settings.email_enabled && emailConfigured();

  return (
    <div className="space-y-5">
      <Flash msg={msg} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Reminders</h1>
        <form action={runNow}><button className="btn">Send today&apos;s reminders now</button></form>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="badge bg-white ring-1 ring-slate-200">WhatsApp auto: {wa ? "on ✓" : "off"}</span>
        <span className="badge bg-white ring-1 ring-slate-200">Email: {mail ? "on ✓" : "off"}</span>
        <span className="badge bg-white ring-1 ring-slate-200">Before due: {settings.remind_days_before} days</span>
        <span className="badge bg-white ring-1 ring-slate-200">Overdue on day: {settings.overdue_remind_days.join(", ")}</span>
        <Link href="/settings" className="link">Change</Link>
      </div>
      {!wa && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Automatic WhatsApp is off. Until it is set up (see README), use the green WhatsApp buttons below. They open WhatsApp with the message ready, and you just press send.
        </p>
      )}

      <section className="card">
        <h2 className="card-title">Today&apos;s list ({planned.length})</h2>
        {planned.length === 0 ? (
          <Empty>No reminders are due today.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {planned.map((p) => {
              const link = waLink(p.loan.customer.phone, p.message.text);
              return (
                <li key={p.dedupeKey} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/loans/${p.loan.id}`} className="link">{p.loan.customer.name} · {loanNo(p.loan.loan_no)}</Link>
                    <span className="ml-2"><Badge status={p.message.kind === "overdue" ? "overdue" : "due"}>{p.message.kind.replace("_", " ")}</Badge></span>
                    <div className="text-xs text-slate-500">{p.message.text}</div>
                  </div>
                  {link && <a href={link} target="_blank" rel="noreferrer" className="btn-wa px-2 py-1 text-xs">WhatsApp</a>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Message log</h2>
        {(log ?? []).length === 0 ? (
          <Empty>Nothing sent yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Customer</th><th>Type</th><th>Channel</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {log!.map((n) => (
                  <tr key={n.id}>
                    <td className="whitespace-nowrap">{formatDate(n.created_at.slice(0, 10))}</td>
                    <td>{n.loan_id ? <Link className="link" href={`/loans/${n.loan_id}`}>{n.customer?.name ?? "-"}</Link> : n.customer?.name ?? "-"}</td>
                    <td>{n.kind.replace("_", " ")}</td>
                    <td>{n.channel}</td>
                    <td><Badge status={n.status} /></td>
                    <td className="max-w-xs truncate text-xs text-slate-500">{n.detail}</td>
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
