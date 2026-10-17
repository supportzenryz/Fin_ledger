// Message wording. WhatsApp templates (approved in Meta) must use the same {{n}} order — see README.
import { formatDate } from "./dates";

export type MessageKind = "reminder_before" | "due_today" | "overdue" | "receipt" | "agreement";

export type Message = {
  kind: MessageKind;
  template: string; // WhatsApp template name
  params: string[]; // template body params, in order
  subject: string;
  text: string; // same content as plain text (email body / wa.me link)
};

const amt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));
const tpl = (envName: string, fallback: string) => process.env[envName] || fallback;

export function dueReminder(kind: "reminder_before" | "due_today", o: { name: string; amount: number; loan: string; due: string; business: string }): Message {
  const p = [o.name, amt(o.amount), o.loan, formatDate(o.due), o.business];
  return {
    kind,
    template: tpl("WA_TEMPLATE_DUE", "lendbook_due_reminder"),
    params: p,
    subject: `Interest due on ${p[3]} - ${o.loan}`,
    text: `Hello ${p[0]}, this is a reminder that interest of Rs. ${p[1]} for your loan ${p[2]} is due on ${p[3]}. Please ignore if already paid. - ${p[4]}`,
  };
}

export function overdueReminder(o: { name: string; amount: number; loan: string; since: string; business: string }): Message {
  const p = [o.name, amt(o.amount), o.loan, formatDate(o.since), o.business];
  return {
    kind: "overdue",
    template: tpl("WA_TEMPLATE_OVERDUE", "lendbook_overdue"),
    params: p,
    subject: `Pending interest - ${o.loan}`,
    text: `Hello ${p[0]}, interest of Rs. ${p[1]} for your loan ${p[2]} has been pending since ${p[3]}. Kindly pay at the earliest. - ${p[4]}`,
  };
}

export function receipt(o: { name: string; amount: number; date: string; loan: string; principalLeft: number; business: string }): Message {
  const p = [o.name, amt(o.amount), formatDate(o.date), o.loan, amt(o.principalLeft), o.business];
  return {
    kind: "receipt",
    template: tpl("WA_TEMPLATE_RECEIPT", "lendbook_payment_received"),
    params: p,
    subject: `Payment received - ${o.loan}`,
    text: `Hello ${p[0]}, we have received Rs. ${p[1]} on ${p[2]} towards your loan ${p[3]}. Principal outstanding: Rs. ${p[4]}. Thank you. - ${p[5]}`,
  };
}

export function agreementLink(o: { name: string; amount: number; url: string; business: string }): Message {
  const p = [o.name, amt(o.amount), o.url, o.business];
  return {
    kind: "agreement",
    template: tpl("WA_TEMPLATE_AGREEMENT", "lendbook_agreement"),
    params: p,
    subject: `Your loan agreement from ${o.business}`,
    text: `Hello ${p[0]}, your loan agreement for Rs. ${p[1]} is ready. Please download it, sign it, and upload the signed copy with your ID proof here: ${p[2]} - ${p[3]}`,
  };
}
