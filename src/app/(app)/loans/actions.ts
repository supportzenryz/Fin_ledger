"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAgreementPdf } from "@/lib/agreement-pdf";
import { loadLoans, loadSettings, type Customer, type Loan } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { loanNo } from "@/lib/format";
import { agreementLink, dueReminder, overdueReminder, receipt } from "@/lib/messages";
import { describe, notify } from "@/lib/notify";
import { requireOwner } from "@/lib/supabase";
import { appUrl } from "@/lib/url";

const num = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").replace(/,/g, "").trim();
  return v === "" ? null : Number(v);
};
const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const go = (path: string, q: { msg?: string; error?: string }): never =>
  redirect(`${path}?${new URLSearchParams(q as Record<string, string>).toString()}`);

export async function createLoan(formData: FormData) {
  const client = await requireOwner();
  const principal = num(formData, "principal");
  const rate = num(formData, "rate_pct_month");
  const row = {
    customer_id: str(formData, "customer_id"),
    principal,
    rate_pct_month: rate,
    start_date: str(formData, "start_date") ?? todayIST(),
    tenure_months: num(formData, "tenure_months"),
    disbursal_mode: str(formData, "disbursal_mode") ?? "cash",
    disbursal_ref: str(formData, "disbursal_ref"),
    collateral: str(formData, "collateral"),
    notes: str(formData, "notes"),
  };
  if (!row.customer_id || !principal || principal <= 0 || rate == null || rate < 0) {
    go("/loans/new", { error: "Customer, amount and rate are required" });
  }
  const { data, error } = await client.from("loans").insert(row).select("id").single();
  if (error) go("/loans/new", { error: error.message });
  let msg = "Loan created";
  if (formData.get("send_agreement") === "on") msg += ". " + (await issueAgreement(client, data!.id));
  revalidatePath("/");
  go(`/loans/${data!.id}`, { msg });
}

export async function updateLoanNotes(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  await client.from("loans").update({ notes: str(formData, "notes"), collateral: str(formData, "collateral") }).eq("id", id);
  go(`/loans/${id}`, { msg: "Saved" });
}

export async function recordPayment(formData: FormData) {
  const client = await requireOwner();
  const loanId = String(formData.get("loan_id"));
  const amount = num(formData, "amount");
  const principalPart = num(formData, "principal_part");
  if (!amount || amount <= 0) go(`/loans/${loanId}`, { error: "Enter the amount received" });
  if (principalPart != null && (principalPart < 0 || principalPart > amount!)) {
    go(`/loans/${loanId}`, { error: "Principal part must be between 0 and the amount" });
  }
  const paidOn = str(formData, "paid_on") ?? todayIST();
  const { error } = await client.from("payments").insert({
    loan_id: loanId,
    paid_on: paidOn,
    amount,
    principal_part: principalPart,
    mode: str(formData, "mode") ?? "cash",
    reference: str(formData, "reference"),
    notes: str(formData, "notes"),
  });
  if (error) go(`/loans/${loanId}`, { error: error.message });
  let msg = "Payment recorded";
  if (formData.get("send_receipt") === "on") {
    const [l] = await loadLoans(client, { loanId });
    const settings = await loadSettings(client);
    const r = await notify(client, settings, l.customer, l.id, receipt({
      name: l.customer.name, amount: amount!, date: paidOn, loan: loanNo(l.loan_no),
      principalLeft: l.s.principalOutstanding, business: settings.business_name,
    }));
    msg += ". Receipt - " + describe(r);
  }
  revalidatePath("/");
  go(`/loans/${loanId}`, { msg });
}

export async function deletePayment(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  const loanId = String(formData.get("loan_id"));
  await client.from("payments").delete().eq("id", id);
  go(`/loans/${loanId}`, { msg: "Payment removed" });
}

export async function setLoanStatus(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as Loan["status"];
  const closedOn = status === "active" ? null : (str(formData, "closed_on") ?? todayIST());
  await client.from("loans").update({ status, closed_on: closedOn }).eq("id", id);
  revalidatePath("/");
  go(`/loans/${id}`, { msg: status === "active" ? "Loan reopened" : `Loan marked ${status.replace("_", " ")}` });
}

/** Generates the agreement PDF, stores it, creates the customer link and sends it. Returns a status line. */
async function issueAgreement(client: SupabaseClient, loanId: string): Promise<string> {
  const { data: loan } = await client.from("loans").select("*, customer:customers(*)").eq("id", loanId).single<Loan & { customer: Customer }>();
  if (!loan) return "Loan not found";
  const settings = await loadSettings(client);
  const bytes = await buildAgreementPdf(loan, loan.customer, settings);
  const path = `${loanId}/agreement-${Date.now()}.pdf`;
  const up = await client.storage.from("agreements").upload(path, bytes, { contentType: "application/pdf" });
  if (up.error) return "Agreement upload failed: " + up.error.message;
  const { data: ag, error } = await client.from("agreements").insert({ loan_id: loanId, pdf_path: path }).select("token").single();
  if (error) return "Agreement failed: " + error.message;
  const url = `${await appUrl()}/a/${ag.token}`;
  const r = await notify(client, settings, loan.customer, loanId, agreementLink({
    name: loan.customer.name, amount: Number(loan.principal), url, business: settings.business_name,
  }));
  return "Agreement link created - " + describe(r);
}

export async function sendAgreement(formData: FormData) {
  const client = await requireOwner();
  const loanId = String(formData.get("loan_id"));
  go(`/loans/${loanId}`, { msg: await issueAgreement(client, loanId) });
}

export async function reviewAgreement(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  const status = formData.get("decision") === "verified" ? "verified" : "rejected";
  const { data } = await client.from("agreements").update({ status }).eq("id", id).select("loan_id").single();
  go(`/loans/${data?.loan_id}`, { msg: status === "verified" ? "Agreement verified" : "Agreement rejected - the customer can upload again using the same link" });
}

export async function remindNow(formData: FormData) {
  const client = await requireOwner();
  const loanId = String(formData.get("loan_id"));
  const [l] = await loadLoans(client, { loanId });
  const settings = await loadSettings(client);
  const base = { name: l.customer.name, loan: loanNo(l.loan_no), business: settings.business_name };
  const m = l.s.overdueAmount > 0
    ? overdueReminder({ ...base, amount: l.s.overdueAmount, since: l.s.overdueSince! })
    : l.s.nextDue
      ? dueReminder("reminder_before", { ...base, amount: l.s.nextDue.amount, due: l.s.nextDue.date })
      : null;
  if (!m) go(`/loans/${loanId}`, { error: "Nothing due on this loan" });
  const r = await notify(client, settings, l.customer, l.id, m!);
  go(`/loans/${loanId}`, { msg: "Reminder - " + describe(r) });
}
