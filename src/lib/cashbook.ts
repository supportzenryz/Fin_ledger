import type { LoanView } from "./data";
import { loanNo } from "./format";

export type CashRow = {
  date: string;
  customer: string;
  customerId: string;
  loanId: string;
  loan: string;
  type: "Loan given" | "Payment received";
  mode: string;
  reference: string;
  out: number;
  in: number;
  interest: number;
  principal: number;
};

/** Business-wide cash book: every loan given (money out) and every payment (money in). */
export function cashBook(loans: LoanView[], month?: string): CashRow[] {
  const rows: CashRow[] = [];
  for (const l of loans) {
    const common = { customer: l.customer.name, customerId: l.customer_id, loanId: l.id, loan: loanNo(l.loan_no) };
    rows.push({ ...common, date: l.start_date, type: "Loan given", mode: l.disbursal_mode, reference: l.disbursal_ref ?? "", out: Number(l.principal), in: 0, interest: 0, principal: 0 });
    const alloc = new Map(l.s.allocations.map((a) => [a.paymentId, a]));
    for (const p of l.payments) {
      const a = alloc.get(p.id);
      rows.push({
        ...common, date: p.paid_on, type: "Payment received", mode: p.mode, reference: p.reference ?? "",
        out: 0, in: Number(p.amount), interest: a ? a.toInterest + a.toAdvance : 0, principal: a ? a.toPrincipal : 0,
      });
    }
  }
  return rows
    .filter((r) => !month || r.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
