import type { ReactNode } from "react";
import type { LoanView } from "@/lib/data";

export function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900";
  return (
    <div className="card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  active: "bg-sky-50 text-sky-700",
  closed: "bg-slate-100 text-slate-600",
  written_off: "bg-slate-200 text-slate-700",
  overdue: "bg-red-50 text-red-700",
  due: "bg-amber-50 text-amber-800",
  partial: "bg-amber-50 text-amber-800",
  upcoming: "bg-slate-100 text-slate-600",
  sent: "bg-amber-50 text-amber-800",
  submitted: "bg-sky-50 text-sky-700",
  verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
  skipped: "bg-slate-100 text-slate-600",
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`badge ${badgeTones[status] ?? "bg-slate-100 text-slate-600"}`}>{children ?? status.replace("_", " ")}</span>;
}

export function loanHealth(l: LoanView): "overdue" | "active" | "closed" | "written_off" {
  if (l.status !== "active") return l.status;
  return l.s.overdueAmount > 0 ? "overdue" : "active";
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, name, children, className = "" }: { label: string; name?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      {children}
    </div>
  );
}

export function Flash({ msg, error }: { msg?: string | string[]; error?: string | string[] }) {
  if (error) return <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{String(error)}</p>;
  if (msg) return <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{String(msg)}</p>;
  return null;
}
