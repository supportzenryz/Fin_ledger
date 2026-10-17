import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase";
import { findAgreement } from "../lookup";

// Customer downloads their agreement PDF through the secret link.
export async function GET(_req: Request, ctx: RouteContext<"/a/[token]/pdf">) {
  const { token } = await ctx.params;
  const ag = await findAgreement(token);
  if (!ag || ag.expired) return new NextResponse("Link expired or invalid", { status: 404 });
  const { data, error } = await adminDb().storage.from("agreements").download(ag.pdf_path);
  if (error || !data) return new NextResponse("File not found", { status: 404 });
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="loan-agreement-L${String(ag.loan_no).padStart(4, "0")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
