import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminders";
import { adminDb } from "@/lib/supabase";

// Called once a day by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const results = await runReminders(adminDb());
  return NextResponse.json({ sent: results.length, results });
}
