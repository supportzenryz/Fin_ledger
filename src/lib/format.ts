const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rs(n: number | null | undefined): string {
  return "₹" + inr.format(Math.round(n ?? 0));
}

/** Plain "Rs." version for PDFs and WhatsApp template params. */
export function rsPlain(n: number): string {
  return "Rs. " + inr.format(Math.round(n));
}

/** 10-digit Indian mobile -> 91XXXXXXXXXX (WhatsApp format). Returns null if not usable. */
export function waNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  return null;
}

export function waLink(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function loanNo(n: number): string {
  return "L" + String(n).padStart(4, "0");
}
