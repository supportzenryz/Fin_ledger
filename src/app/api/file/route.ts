import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";

// Opens a private KYC / agreement file for the owner via a short-lived signed URL.
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("bucket");
  const path = req.nextUrl.searchParams.get("path");
  if (!path || (bucket !== "kyc" && bucket !== "agreements")) return new NextResponse("Bad request", { status: 400 });
  const client = await db();
  const { data: isAdmin } = await client.rpc("is_admin");
  if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 120);
  if (error || !data) return new NextResponse(error?.message ?? "Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
