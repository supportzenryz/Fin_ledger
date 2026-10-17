import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Settings } from "./data";
import { waNumber } from "./format";
import type { Message } from "./messages";

type Result = { status: "sent" | "failed" | "skipped"; detail: string };

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function emailConfigured() {
  return gmailConfigured() || Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM_EMAIL);
}

function gmailConfigured() {
  return Boolean(process.env.GMAIL_SCRIPT_URL && process.env.GMAIL_SCRIPT_SECRET);
}

/** WhatsApp Cloud API (Meta). Business-initiated messages must use an approved template. */
async function sendWhatsApp(phone: string, m: Message): Promise<Result> {
  const to = waNumber(phone);
  if (!to) return { status: "skipped", detail: "invalid phone number" };
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: m.template,
        language: { code: process.env.WA_TEMPLATE_LANG || "en" },
        components: [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { status: "failed", detail: body?.error?.message ?? `HTTP ${res.status}` };
  return { status: "sent", detail: body?.messages?.[0]?.id ?? "ok" };
}

/**
 * Your own Gmail through a Google Apps Script web app (docs/gmail-apps-script.gs).
 * Free, no domain needed, 100 emails/day on a personal Google account.
 */
async function sendGmail(to: string, m: Message, settings: Settings): Promise<Result> {
  try {
    // Apps Script answers with a redirect to the script's output; fetch follows it.
    const res = await fetch(process.env.GMAIL_SCRIPT_URL!, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: process.env.GMAIL_SCRIPT_SECRET,
        to,
        subject: m.subject,
        text: m.text,
        name: process.env.MAIL_FROM_NAME || settings.business_name,
        replyTo: settings.email || undefined,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) return { status: "failed", detail: body?.error ?? `HTTP ${res.status}` };
    return { status: "sent", detail: `gmail (${body.remaining ?? "?"} left today)` };
  } catch (e) {
    return { status: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Gmail if set up, otherwise Resend (needs a verified domain). HTTP APIs only: Workers can't reliably use SMTP. */
async function sendEmail(to: string, m: Message, settings: Settings): Promise<Result> {
  if (gmailConfigured()) return sendGmail(to, m, settings);
  try {
    const name = (process.env.MAIL_FROM_NAME || settings.business_name).replace(/[<>"]/g, "");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${name} <${process.env.MAIL_FROM_EMAIL}>`,
        to: [to],
        reply_to: settings.email || undefined,
        subject: m.subject,
        text: m.text,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "failed", detail: body?.message ?? `HTTP ${res.status}` };
    return { status: "sent", detail: body?.id ?? "ok" };
  } catch (e) {
    return { status: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sends a message on every enabled channel and logs it. With a dedupeKey, a channel that
 * already succeeded for that key is not sent again (so the daily job is safe to re-run).
 */
export async function notify(
  client: SupabaseClient,
  settings: Settings,
  customer: Pick<Customer, "id" | "phone" | "email" | "whatsapp_opt_in">,
  loanId: string | null,
  m: Message,
  dedupeKey?: string,
): Promise<Record<"whatsapp" | "email", Result>> {
  const out = {} as Record<"whatsapp" | "email", Result>;
  for (const channel of ["whatsapp", "email"] as const) {
    const key = dedupeKey ? `${dedupeKey}:${channel}` : null;
    if (key) {
      const { data } = await client.from("notifications").select("status").eq("dedupe_key", key).maybeSingle();
      if (data?.status === "sent") {
        out[channel] = { status: "skipped", detail: "already sent" };
        continue;
      }
    }
    let r: Result;
    if (channel === "whatsapp") {
      if (!settings.whatsapp_enabled || !whatsappConfigured()) r = { status: "skipped", detail: "WhatsApp not set up" };
      else if (!customer.whatsapp_opt_in) r = { status: "skipped", detail: "customer opted out" };
      else r = await sendWhatsApp(customer.phone, m);
    } else {
      if (!settings.email_enabled || !emailConfigured()) r = { status: "skipped", detail: "email not set up" };
      else if (!customer.email) r = { status: "skipped", detail: "no email" };
      else r = await sendEmail(customer.email, m, settings);
    }
    out[channel] = r;
    const row = { customer_id: customer.id, loan_id: loanId, channel, kind: m.kind, status: r.status, detail: r.detail, dedupe_key: key };
    if (key) await client.from("notifications").upsert(row, { onConflict: "dedupe_key" });
    else await client.from("notifications").insert(row);
  }
  return out;
}

export function describe(r: Record<"whatsapp" | "email", Result>): string {
  return (Object.entries(r) as [string, Result][])
    .map(([ch, x]) => `${ch === "whatsapp" ? "WhatsApp" : "Email"}: ${x.status}${x.status === "sent" ? "" : ` (${x.detail})`}`)
    .join(" · ");
}
