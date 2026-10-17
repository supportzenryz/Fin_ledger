import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";
import { computeLoan } from "./engine";

const loan = { principal: 100000, ratePct: 2, startDate: "2026-01-10" };

describe("addMonths", () => {
  it("clamps to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("computeLoan", () => {
  it("charges monthly interest and flags overdue", () => {
    const s = computeLoan(loan, [], "2026-04-15");
    expect(s.periods.filter((p) => p.status === "overdue")).toHaveLength(3);
    expect(s.overdueAmount).toBe(6000);
    expect(s.overdueSince).toBe("2026-02-10");
    expect(s.nextDue).toEqual({ date: "2026-05-10", amount: 8000 });
    expect(s.ledger.at(-1)!.balance).toBe(106000);
  });

  it("interest on the due date clears that month", () => {
    const s = computeLoan(loan, [{ id: "a", paidOn: "2026-02-10", amount: 2000 }], "2026-02-20");
    expect(s.overdueAmount).toBe(0);
    expect(s.periods[0].status).toBe("paid");
    expect(s.principalOutstanding).toBe(100000);
  });

  it("early interest is held as advance, not principal", () => {
    const s = computeLoan(loan, [{ id: "a", paidOn: "2026-02-07", amount: 2000 }], "2026-02-20");
    expect(s.principalOutstanding).toBe(100000);
    expect(s.periods[0].status).toBe("paid");
    expect(s.advanceCredit).toBe(0);
  });

  it("part principal reduces interest from next month", () => {
    const s = computeLoan(
      loan,
      [
        { id: "a", paidOn: "2026-02-10", amount: 2000 },
        { id: "b", paidOn: "2026-02-25", amount: 50000, principalPart: 50000 },
      ],
      "2026-04-10",
    );
    expect(s.principalOutstanding).toBe(50000);
    // month 2 (Feb10-Mar10) still on 1,00,000; month 3 on 50,000
    expect(s.periods.map((p) => p.interest).slice(0, 3)).toEqual([2000, 2000, 1000]);
    expect(s.overdueAmount).toBe(2000);
    expect(s.periods[2].status).toBe("due");
  });

  it("auto allocation: arrears, then advance, then principal", () => {
    const s = computeLoan(loan, [{ id: "a", paidOn: "2026-03-15", amount: 30000 }], "2026-03-20");
    const a = s.allocations[0];
    expect(a.toInterest).toBe(4000);
    expect(a.toAdvance).toBe(2000);
    expect(a.toPrincipal).toBe(24000);
    expect(s.principalOutstanding).toBe(76000);
  });

  it("full settlement stops interest", () => {
    const s = computeLoan(loan, [{ id: "a", paidOn: "2026-02-10", amount: 102000 }], "2026-06-01");
    expect(s.principalOutstanding).toBe(0);
    expect(s.periods).toHaveLength(1);
    expect(s.nextDue).toBeNull();
    expect(s.ledger.at(-1)!.balance).toBe(0);
  });

  it("mid-month payoff books the extra as closing interest", () => {
    const s = computeLoan(
      loan,
      [
        { id: "a", paidOn: "2026-02-10", amount: 2000 },
        { id: "b", paidOn: "2026-02-24", amount: 101000 },
      ],
      "2026-05-01",
    );
    expect(s.principalOutstanding).toBe(0);
    expect(s.interestCharged).toBe(3000);
    expect(s.ledger.at(-1)!.balance).toBe(0);
    expect(s.nextDue).toBeNull();
  });

  it("settlement today pro-rates the running month", () => {
    const s = computeLoan(loan, [{ id: "a", paidOn: "2026-02-10", amount: 2000 }], "2026-02-24");
    // 14 of 28 days in Feb10-Mar10 => half of 2000
    expect(s.settlementToday).toBe(101000);
  });
});
