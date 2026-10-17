"use server";

import { headers } from "next/headers";
import { PDFDocument } from "pdf-lib";
import type { UploadTicket } from "@/lib/client-upload";
import { adminDb } from "@/lib/supabase";
import { findAgreement } from "./lookup";

const MAX = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "application/pdf"];
const extOf = (t: string) => (t === "application/pdf" ? "pdf" : t === "image/png" ? "png" : "jpg");

type FileMeta = { type: string; size: number };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function activeAgreement(token: string) {
  const ag = await findAgreement(token);
  if (!ag || ag.expired || !["sent", "rejected"].includes(ag.status)) return null;
  return ag;
}

/** Step 1: validate what the customer is about to upload and hand out one-time upload URLs. */
export async function prepareUpload(token: string, signed: FileMeta[], id: FileMeta): Promise<Result<{ signed: UploadTicket[]; id: UploadTicket }>> {
  const ag = await activeAgreement(token);
  if (!ag) return { ok: false, error: "This link is no longer active. Please contact the lender." };
  if (signed.length === 0 || signed.length > 10) return { ok: false, error: "Upload the signed agreement (one PDF or up to 10 page photos)." };
  if (signed.some((f) => f.type === "application/pdf") && signed.length > 1) return { ok: false, error: "Upload either one PDF, or photos of the pages - not both." };
  for (const f of [...signed, id]) {
    if (!TYPES.includes(f.type)) return { ok: false, error: "Only PDF, JPG or PNG files are accepted." };
    if (f.size > MAX) return { ok: false, error: "Each file must be under 8 MB." };
  }
  const client = adminDb();
  const stamp = Date.now();
  const ticket = async (bucket: string, path: string): Promise<UploadTicket> => {
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "upload url failed");
    return { bucket, path, token: data.token };
  };
  try {
    return {
      ok: true,
      data: {
        signed: await Promise.all(signed.map((f, i) => ticket("agreements", `${ag.loan_id}/raw-${stamp}-${i + 1}.${extOf(f.type)}`))),
        id: await ticket("kyc", `${ag.customer_id}/customer-id-${stamp}.${extOf(id.type)}`),
      },
    };
  } catch {
    return { ok: false, error: "Could not start the upload. Please try again." };
  }
}

/** Step 2: files are in storage. Combine page photos into one PDF and mark the agreement submitted. */
export async function finalizeUpload(token: string, input: { signed: string[]; id: string; idType: string; idName: string; consent: boolean }): Promise<Result<null>> {
  const ag = await activeAgreement(token);
  if (!ag) return { ok: false, error: "This link is no longer active." };
  if (!input.consent) return { ok: false, error: "Please tick the confirmation box." };
  const rawOk = (p: string) => new RegExp(`^${ag.loan_id}/raw-\\d+-\\d+\\.(pdf|jpg|png)$`).test(p);
  if (!input.signed.length || !input.signed.every(rawOk)) return { ok: false, error: "Upload was incomplete. Please try again." };
  if (!new RegExp(`^${ag.customer_id}/customer-id-\\d+\\.(pdf|jpg|png)$`).test(input.id)) return { ok: false, error: "Upload was incomplete. Please try again." };

  const client = adminDb();
  let signedPath = input.signed[0];
  try {
    if (!signedPath.endsWith(".pdf")) {
      const pdf = await PDFDocument.create();
      for (const p of input.signed) {
        const { data, error } = await client.storage.from("agreements").download(p);
        if (error || !data) throw new Error("missing");
        const bytes = new Uint8Array(await data.arrayBuffer());
        const img = p.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      signedPath = `${ag.loan_id}/signed-${Date.now()}.pdf`;
      const up = await client.storage.from("agreements").upload(signedPath, await pdf.save(), { contentType: "application/pdf" });
      if (up.error) throw new Error(up.error.message);
      await client.storage.from("agreements").remove(input.signed);
    } else {
      const { error } = await client.storage.from("agreements").download(signedPath);
      if (error) throw new Error("missing");
    }
  } catch {
    return { ok: false, error: "Could not read the uploaded pages. Please upload clear JPG/PNG photos or a PDF." };
  }

  const docType = ["pan", "aadhaar_masked", "other"].includes(input.idType) ? input.idType : "other";
  await client.from("kyc_documents").insert({ customer_id: ag.customer_id, doc_type: docType, file_path: input.id, file_name: input.idName.slice(0, 200), uploaded_by: "customer" });
  const h = await headers();
  await client.from("agreements").update({
    status: "submitted",
    signed_path: signedPath,
    id_proof_path: input.id,
    submitted_at: new Date().toISOString(),
    submitted_ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
  }).eq("id", ag.id);
  return { ok: true, data: null };
}
