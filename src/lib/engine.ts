/**
 * Monthly-interest loan engine.
 *
 * Rules (shown to the owner in the app and printed in the agreement):
 * - Interest falls due every month on the same date as the loan start date.
 * - Each month's interest = principal outstanding at the START of that month x rate%.
 *   Principal repaid mid-month reduces interest from the next month.
 * - A payment first clears unpaid interest (oldest first), then the running month's
 *   interest in advance, and the rest reduces principal. The owner can override this
 *   by entering an explicit principal part on the payment.
 * - Interest is rounded to the nearest rupee.
 */
import { addMonths, daysBetween } from "./dates";

export type LoanInput = {
  principal: number;
  ratePct: number; // per month
  startDate: string;
  tenureMonths?: number | null;
  status?: "active" | "closed" | "written_off";
  closedOn?: string | null;
};

export type PaymentInput = {
  id: string;
  paidOn: string;
  amount: number;
  principalPart?: number | null;
};

export type PeriodStatus = "paid" | "partial" | "overdue" | "due" | "upcoming";

export type Period = {
  n: number;
  from: string;
  due: string;
  principalBase: number;
  interest: number;
  paid: number;
  status: PeriodStatus;
};

export type Allocation = {
  paymentId: string;
  date: string;
  amount: number;
  toInterest: number; // matured interest cleared
  toAdvance: number; // running month's interest paid in advance
  toPrincipal: number;
  excess: number;
};

export type LedgerRow = {
  date: string;
  kind: "disbursal" | "interest" | "payment";
  label: string;
  debit: number;
  credit: number;
  balance: number;
  paymentId?: string;
};

export type LoanSummary = {
  principalOutstanding: number;
  interestArrears: number; // matured and unpaid
  overdueAmount: number; // arrears whose due date is before asOf
  overdueSince: string | null;
  overdueDays: number;
  advanceCredit: number;
  interestCharged: number;
  interestPaid: number;
  principalPaid: number;
  totalPaid: number;
  excess: number;
  monthlyInterest: number; // at current principal
  nextDue: { date: string; amount: number } | null;
  maturityDate: string | null;
  settlementToday: number;
  periods: Period[];
  allocations: Allocation[];
  ledger: LedgerRow[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const rupee = (x: number) => Math.round(x);

export function computeLoan(loan: LoanInput, payments: PaymentInput[], asOf: string): LoanSummary {
  const rate = loan.ratePct / 100;
  const endDate =
    loan.status && loan.status !== "active" && loan.closedOn && loan.closedOn < asOf ? loan.closedOn : asOf;
  const pays = [...payments].sort((a, b) => (a.paidOn === b.paidOn ? 0 : a.paidOn < b.paidOn ? -1 : 1));

  let principal = loan.principal;
  let credit = 0; // advance interest
  let excess = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  let interestCharged = 0;
  let currentBase = principal;
  const periods: Period[] = [];
  const allocations: Allocation[] = [];
  type Event = { date: string; order: number; row: Omit<LedgerRow, "balance"> };
  const events: Event[] = [
    { date: loan.startDate, order: 0, row: { date: loan.startDate, kind: "disbursal", label: "Loan given", debit: loan.principal, credit: 0 } },
  ];

  const clearArrears = (amount: number): number => {
    let left = amount;
    for (const p of periods) {
      if (left <= 0) break;
      const owed = p.interest - p.paid;
      if (owed <= 0) continue;
      const take = Math.min(owed, left);
      p.paid = r2(p.paid + take);
      left = r2(left - take);
    }
    return left;
  };

  let pi = 0;
  const applyPayment = (p: PaymentInput) => {
    const a: Allocation = { paymentId: p.id, date: p.paidOn, amount: p.amount, toInterest: 0, toAdvance: 0, toPrincipal: 0, excess: 0 };
    let left = p.amount;
    let forPrincipal: number | null = null;
    if (p.principalPart != null) {
      forPrincipal = Math.min(p.principalPart, left);
      left = r2(left - forPrincipal);
    }
    const afterArrears = clearArrears(left);
    a.toInterest = r2(left - afterArrears);
    left = afterArrears;
    if (forPrincipal == null) {
      const need = Math.max(0, rupee(currentBase * rate) - credit);
      if (left >= principal && principal > 0) {
        // payoff: principal first, anything over it is interest for the running month
        forPrincipal = principal;
        left = r2(left - principal);
        a.toAdvance = Math.min(need, left);
        left = r2(left - a.toAdvance);
      } else {
        a.toAdvance = Math.min(need, left);
        left = r2(left - a.toAdvance);
        forPrincipal = left;
        left = 0;
      }
    } else {
      // explicit split: any interest money beyond arrears is advance interest
      a.toAdvance = left;
      left = 0;
    }
    a.toPrincipal = Math.min(forPrincipal, principal);
    a.excess = r2(forPrincipal - a.toPrincipal + left);
    credit = r2(credit + a.toAdvance);
    principal = r2(principal - a.toPrincipal);
    excess = r2(excess + a.excess);
    interestPaid = r2(interestPaid + a.toInterest + a.toAdvance);
    principalPaid = r2(principalPaid + a.toPrincipal);
    allocations.push(a);
    const parts = [
      a.toInterest && `interest ${a.toInterest}`,
      a.toAdvance && `advance interest ${a.toAdvance}`,
      a.toPrincipal && `principal ${a.toPrincipal}`,
      a.excess && `extra ${a.excess}`,
    ].filter(Boolean);
    events.push({ date: p.paidOn, order: 2, row: { date: p.paidOn, kind: "payment", label: `Payment received (${parts.join(", ")})`, debit: 0, credit: p.amount, paymentId: p.id } });
  };
  const applyUntil = (pred: (d: string) => boolean) => {
    while (pi < pays.length && pred(pays[pi].paidOn)) applyPayment(pays[pi++]);
  };

  let runningFrom: string | null = null;
  for (let k = 1; k < 1200; k++) {
    const from = addMonths(loan.startDate, k - 1);
    const due = addMonths(loan.startDate, k);
    applyUntil((d) => d <= from && d <= endDate);
    currentBase = principal;
    if (principal <= 0) break;
    if (due > endDate) {
      runningFrom = from;
      break;
    }
    applyUntil((d) => d < due);
    if (principal <= 0) break; // repaid mid-month: whatever was paid over principal is the closing interest
    const interest = rupee(currentBase * rate);
    const fromCredit = Math.min(credit, interest);
    credit = r2(credit - fromCredit);
    interestCharged += interest;
    periods.push({ n: k, from, due, principalBase: currentBase, interest, paid: fromCredit, status: "upcoming" });
    events.push({ date: due, order: 1, row: { date: due, kind: "interest", label: `Interest for month ${k} @ ${loan.ratePct}%`, debit: interest, credit: 0 } });
  }
  applyUntil((d) => d <= endDate);

  // Loan repaid: advance interest already received becomes interest for the final part-month.
  if (principal <= 0 && credit > 0) {
    const last = allocations.at(-1)?.date ?? endDate;
    interestCharged += credit;
    events.push({ date: last, order: 3, row: { date: last, kind: "interest", label: "Interest till closure", debit: credit, credit: 0 } });
    credit = 0;
  }

  // statuses
  let interestArrears = 0;
  let overdueAmount = 0;
  let overdueSince: string | null = null;
  for (const p of periods) {
    const owed = r2(p.interest - p.paid);
    interestArrears += owed;
    if (owed <= 0) p.status = "paid";
    else if (p.due < asOf) {
      p.status = "overdue";
      overdueAmount += owed;
      overdueSince ??= p.due;
    } else p.status = p.paid > 0 ? "partial" : "due";
  }

  const active = (loan.status ?? "active") === "active" && principal > 0;
  let nextDue: LoanSummary["nextDue"] = null;
  let settlementToday = r2(principal + interestArrears - credit);
  if (active && runningFrom) {
    const due = addMonths(runningFrom, 1);
    const runningInterest = rupee(currentBase * rate);
    nextDue = { date: due, amount: Math.max(0, r2(interestArrears + runningInterest - credit)) };
    periods.push({ n: periods.length + 1, from: runningFrom, due, principalBase: currentBase, interest: runningInterest, paid: Math.min(credit, runningInterest), status: "upcoming" });
    const elapsed = Math.max(0, daysBetween(runningFrom, asOf));
    const span = daysBetween(runningFrom, due);
    settlementToday = rupee(principal + interestArrears + (runningInterest * elapsed) / span - credit);
  }

  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
  let bal = 0;
  const ledger = events.map((e) => {
    bal = r2(bal + e.row.debit - e.row.credit);
    return { ...e.row, balance: bal };
  });

  return {
    principalOutstanding: principal,
    interestArrears: r2(interestArrears),
    overdueAmount: r2(overdueAmount),
    overdueSince,
    overdueDays: overdueSince ? daysBetween(overdueSince, asOf) : 0,
    advanceCredit: credit,
    interestCharged,
    interestPaid,
    principalPaid,
    totalPaid: r2(pays.reduce((s, p) => s + p.amount, 0)),
    excess,
    monthlyInterest: rupee(principal * rate),
    nextDue,
    maturityDate: loan.tenureMonths ? addMonths(loan.startDate, loan.tenureMonths) : null,
    settlementToday: Math.max(0, settlementToday),
    periods,
    allocations,
    ledger,
  };
}
