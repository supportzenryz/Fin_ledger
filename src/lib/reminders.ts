import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLoans, loadSettings, type LoanView, type Settings } from "./data";
import { addDays, todayIST } from "./dates";
import { loanNo } from "./format";
import { dueReminder, overdueReminder, type Message } from "./messages";
import { notify } from "./notify";

export type Planned = { loan: LoanView; message: Message; dedupeKey: string };

/** Which reminders should go out today. Pure, so the Reminders page can preview it. */
export function planReminders(loans: LoanView[], settings: Settings, today = todayIST()): Planned[] {
  const out: Planned[] = [];
  const soon = addDays(today, settings.remind_days_before);
  for (const l of loans) {
    if (l.status !== "active") continue;
    const base = { name: l.customer.name, loan: loanNo(l.loan_no), business: settings.business_name };
    const s = l.s;
    if (s.overdueAmount > 0 && s.overdueSince && settings.overdue_remind_days.includes(s.overdueDays)) {
      out.push({
        loan: l,
        message: overdueReminder({ ...base, amount: s.overdueAmount, since: s.overdueSince }),
        dedupeKey: `${l.id}:overdue:${s.overdueSince}:${s.overdueDays}`,
      });
      continue;
    }
    const dueToday = s.periods.find((p) => p.due === today && p.status !== "paid");
    if (dueToday) {
      out.push({
        loan: l,
        message: dueReminder("due_today", { ...base, amount: s.interestArrears, due: today }),
        dedupeKey: `${l.id}:due:${today}`,
      });
      continue;
    }
    if (settings.remind_days_before > 0 && s.nextDue && s.nextDue.date === soon && s.nextDue.amount > 0) {
      out.push({
        loan: l,
        message: dueReminder("reminder_before", { ...base, amount: s.nextDue.amount, due: s.nextDue.date }),
        dedupeKey: `${l.id}:before:${s.nextDue.date}`,
      });
    }
  }
  return out;
}

export async function runReminders(client: SupabaseClient) {
  const [loans, settings] = await Promise.all([loadLoans(client, { status: "active" }), loadSettings(client)]);
  const planned = planReminders(loans, settings);
  const results = [];
  for (const p of planned) {
    const r = await notify(client, settings, p.loan.customer, p.loan.id, p.message, p.dedupeKey);
    results.push({ loan: loanNo(p.loan.loan_no), kind: p.message.kind, whatsapp: r.whatsapp.status, email: r.email.status });
  }
  return results;
}
