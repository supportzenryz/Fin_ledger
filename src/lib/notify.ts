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
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);
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

/** Brevo transactional email over HTTPS (free: 300 emails/day). HTTP works on Cloudflare Workers; SMTP does not reliably. */
async function sendEmail(to: string, m: Message, settings: Settings): Promise<Result> {
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || settings.business_name },
        to: [{ email: to }],
        replyTo: settings.email ? { email: settings.email } : undefined,
        subject: m.subject,
        textContent: m.text,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "failed", detail: body?.message ?? `HTTP ${res.status}` };
    return { status: "sent", detail: body?.messageId ?? "ok" };
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
