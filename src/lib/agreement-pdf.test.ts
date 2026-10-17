import { writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildAgreementPdf } = await import("./agreement-pdf");

describe("agreement pdf", () => {
  it("renders, including non-Latin names", async () => {
    const bytes = await buildAgreementPdf(
      { id: "l", loan_no: 7, customer_id: "c", principal: 150000, rate_pct_month: 2, start_date: "2026-10-17", tenure_months: 12, disbursal_mode: "upi", disbursal_ref: "UPI123", collateral: "Gold chain 20g", notes: null, status: "active", closed_on: null },
      { id: "c", code: 1, name: "Ravi Kumar (ரவி)", phone: "9876543210", email: null, address: "12, Gandhi St, Coimbatore 641001", occupation: null, pan: "ABCDE1234F", aadhaar_last4: "1234", guarantor_name: "Suresh", guarantor_phone: "9000000000", notes: null, whatsapp_opt_in: true, archived: false, created_at: "" },
      { business_name: "Sri Finance", owner_name: "Sathish", address: "Coimbatore", phone: "9999999999", email: "", default_rate_pct: 2, agreement_terms: "1. Pay interest monthly.\n2. Principal on demand.", remind_days_before: 3, overdue_remind_days: [1], whatsapp_enabled: false, email_enabled: false },
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });
});
