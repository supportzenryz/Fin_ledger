import "server-only";
import { adminDb } from "@/lib/supabase";

export type PublicAgreement = {
  id: string;
  loan_id: string;
  customer_id: string;
  status: string;
  pdf_path: string;
  expired: boolean;
  customer_name: string;
  principal: number;
  rate: number;
  start_date: string;
  loan_no: number;
  business: string;
};

/** Looks up an agreement by its secret link token (service role; the token is the only credential). */
export async function findAgreement(token: string): Promise<PublicAgreement | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const client = adminDb();
  const { data } = await client
    .from("agreements")
    .select("id, loan_id, status, pdf_path, expires_at, loan:loans(customer_id, principal, rate_pct_month, start_date, loan_no, customer:customers(name))")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { data: s } = await client.from("settings").select("business_name").eq("id", 1).single();
  const loan = data.loan as unknown as { customer_id: string; principal: number; rate_pct_month: number; start_date: string; loan_no: number; customer: { name: string } };
  return {
    id: data.id,
    loan_id: data.loan_id,
    customer_id: loan.customer_id,
    status: data.status,
    pdf_path: data.pdf_path,
    expired: new Date(data.expires_at) < new Date(),
    customer_name: loan.customer.name,
    principal: Number(loan.principal),
    rate: Number(loan.rate_pct_month),
    start_date: loan.start_date,
    loan_no: loan.loan_no,
    business: s?.business_name ?? "",
  };
}
