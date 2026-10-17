import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Customer, Loan, Settings } from "./data";
import { addMonths, formatDate } from "./dates";
import { loanNo, rsPlain } from "./format";

/** Builds the loan agreement the customer downloads, signs and uploads back. */
export async function buildAgreementPdf(loan: Loan, c: Customer, s: Settings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Loan agreement ${loanNo(loan.loan_no)}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 50; // A4
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  // Standard PDF fonts are Latin-only; anything else (e.g. Tamil script) becomes "?".
  const safe = (t: string) =>
    [...t].map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    }).join("");
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (t: string, o: { size?: number; f?: PDFFont; x?: number; gap?: number; center?: boolean } = {}) => {
    const size = o.size ?? 10.5, f = o.f ?? font, x = o.x ?? M;
    for (const line of wrap(t, f, size, W - x - M)) {
      ensure(size + 4);
      const lx = o.center ? (W - f.widthOfTextAtSize(line, size)) / 2 : x;
      page.drawText(line, { x: lx, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.12) });
      y -= size + 4;
    }
    y -= o.gap ?? 4;
  };
  const row = (k: string, v: string) => {
    ensure(16);
    page.drawText(k, { x: M, y: y - 10.5, size: 10.5, font: bold });
    const lines = wrap(v, font, 10.5, W - M - 210);
    lines.forEach((l, i) => page.drawText(l, { x: M + 160, y: y - 10.5 - i * 14.5, size: 10.5, font }));
    y -= 14.5 * lines.length + 2;
  };

  text("(To be executed on non-judicial stamp paper / e-stamp of appropriate value as per the Indian Stamp Act as applicable in Tamil Nadu)", { size: 8, gap: 10 });
  text("LOAN AGREEMENT", { size: 16, f: bold, center: true, gap: 2 });
  text(`Agreement No. ${loanNo(loan.loan_no)}   ·   Date: ${formatDate(loan.start_date)}`, { size: 10, center: true, gap: 14 });

  text("This Loan Agreement is made between:", { gap: 6 });
  text(`LENDER: ${s.owner_name || s.business_name}${s.business_name && s.owner_name ? ` (${s.business_name})` : ""}, ${s.address || "____________________"}, Phone: ${s.phone || "__________"}`, { gap: 6 });
  text(`BORROWER: ${c.name}, ${c.address || "____________________"}, Phone: ${c.phone}${c.pan ? `, PAN: ${c.pan}` : ""}${c.aadhaar_last4 ? `, Aadhaar: XXXX XXXX ${c.aadhaar_last4}` : ""}`, { gap: 12 });

  text("1. LOAN DETAILS", { f: bold, gap: 4 });
  const monthly = Math.round(Number(loan.principal) * Number(loan.rate_pct_month) / 100);
  row("Loan amount (principal)", rsPlain(Number(loan.principal)));
  row("Interest rate", `${loan.rate_pct_month}% per month (Rs. ${loan.rate_pct_month} per Rs. 100 per month)`);
  row("Monthly interest", `${rsPlain(monthly)} on the full principal`);
  row("Date of loan", formatDate(loan.start_date));
  row("Interest due date", `Every month on the same date, first due ${formatDate(addMonths(loan.start_date, 1))}`);
  row("Term", loan.tenure_months ? `${loan.tenure_months} months - principal repayable by ${formatDate(addMonths(loan.start_date, loan.tenure_months))}` : "Principal repayable on demand / as mutually agreed");
  row("Mode of payment", `${loan.disbursal_mode.toUpperCase()}${loan.disbursal_ref ? ` (Ref: ${loan.disbursal_ref})` : ""}`);
  if (loan.collateral) row("Security / collateral", loan.collateral);
  if (c.guarantor_name) row("Guarantor", `${c.guarantor_name}${c.guarantor_phone ? `, ${c.guarantor_phone}` : ""}`);
  y -= 8;

  text("2. TERMS AND CONDITIONS", { f: bold, gap: 4 });
  text(s.agreement_terms, { gap: 10 });

  text("3. DECLARATION", { f: bold, gap: 4 });
  text(`I, ${c.name}, acknowledge receipt of ${rsPlain(Number(loan.principal))} from the Lender on the date mentioned above and agree to repay it with interest as per the terms above. I have read and understood this agreement and sign it of my own free will.`, { gap: 30 });

  ensure(140);
  const sig = (label: string, x: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + 200, y }, thickness: 0.8 });
    page.drawText(label, { x, y: y - 14, size: 10, font: bold });
    page.drawText("Name:", { x, y: y - 30, size: 9.5, font });
    page.drawText("Date:", { x, y: y - 44, size: 9.5, font });
  };
  sig("Signature of Borrower", M);
  sig("Signature of Lender", W - M - 200);
  y -= 90;
  ensure(60);
  sig("Witness 1", M);
  sig("Witness 2", W - M - 200);

  pdf.getPages().forEach((p, i, all) =>
    p.drawText(`${loanNo(loan.loan_no)} · Page ${i + 1} of ${all.length} · Borrower initials: ______`, { x: M, y: 25, size: 8, font, color: rgb(0.4, 0.4, 0.45) }),
  );
  return pdf.save();
}
