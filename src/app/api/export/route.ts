import { NextResponse, type NextRequest } from "next/server";
import { cashBook } from "@/lib/cashbook";
import { loadLoans } from "@/lib/data";
import { db } from "@/lib/supabase";

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV of the cash book (opens in Excel / Google Sheets). Also works as a backup of every transaction.
export async function GET(req: NextRequest) {
  const client = await db();
  const { data: isAdmin } = await client.rpc("is_admin");
  if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });
  const m = req.nextUrl.searchParams.get("m");
  const month = m && m !== "all" ? m : undefined;
  const rows = cashBook(await loadLoans(client), month);
  const header = ["Date", "Customer", "Loan", "Type", "Mode", "Reference", "Money out", "Money in", "Interest part", "Principal part"];
  const lines = [header, ...rows.map((r) => [r.date, r.customer, r.loan, r.type, r.mode, r.reference, r.out, r.in, r.interest, r.principal])];
  const csv = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lendbook-${month ?? "all"}.csv"`,
    },
  });
}
