"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/supabase";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function saveCustomer(formData: FormData) {
  const client = await requireOwner();
  const id = str(formData, "id");
  const aadhaar = (str(formData, "aadhaar_last4") ?? "").replace(/\D/g, "").slice(-4) || null;
  const row = {
    name: str(formData, "name")!,
    phone: (str(formData, "phone") ?? "").replace(/[^\d+]/g, ""),
    email: str(formData, "email"),
    address: str(formData, "address"),
    occupation: str(formData, "occupation"),
    pan: str(formData, "pan")?.toUpperCase() ?? null,
    aadhaar_last4: aadhaar,
    guarantor_name: str(formData, "guarantor_name"),
    guarantor_phone: str(formData, "guarantor_phone"),
    notes: str(formData, "notes"),
    whatsapp_opt_in: formData.get("whatsapp_opt_in") === "on",
  };
  if (!row.name || !row.phone) redirect(`/customers/${id ? `${id}/edit` : "new"}?error=Name+and+phone+are+required`);
  if (id) {
    const { error } = await client.from("customers").update(row).eq("id", id);
    if (error) redirect(`/customers/${id}/edit?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/customers");
    redirect(`/customers/${id}?msg=Saved`);
  }
  const { data, error } = await client.from("customers").insert(row).select("id").single();
  if (error) redirect(`/customers/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/customers/${data.id}?msg=Customer+added`);
}

export async function setArchived(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  await client.from("customers").update({ archived: formData.get("archived") === "true" }).eq("id", id);
  revalidatePath(`/customers/${id}`);
}

const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const DOC_TYPES = ["pan", "aadhaar_masked", "photo", "address_proof", "bank", "other"];

/** Returns a one-time URL the browser uploads the KYC file to directly. */
export async function prepareKycUpload(customerId: string, docType: string, type: string, size: number) {
  const client = await requireOwner();
  if (!ALLOWED[type]) return { ok: false as const, error: "Only JPG, PNG, WEBP or PDF files" };
  if (size > 8 * 1024 * 1024) return { ok: false as const, error: "File must be under 8 MB" };
  if (!DOC_TYPES.includes(docType)) return { ok: false as const, error: "Unknown document type" };
  const path = `${customerId}/${docType}-${Date.now()}.${ALLOWED[type]}`;
  const { data, error } = await client.storage.from("kyc").createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: error?.message ?? "Upload failed" };
  return { ok: true as const, ticket: { bucket: "kyc", path, token: data.token } };
}

export async function registerKyc(customerId: string, docType: string, path: string, fileName: string) {
  const client = await requireOwner();
  if (!path.startsWith(`${customerId}/`)) return;
  await client.from("kyc_documents").insert({ customer_id: customerId, doc_type: docType, file_path: path, file_name: fileName.slice(0, 200) });
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteKyc(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  const { data } = await client.from("kyc_documents").select("customer_id, file_path").eq("id", id).single();
  if (!data) return;
  await client.storage.from("kyc").remove([data.file_path]);
  await client.from("kyc_documents").delete().eq("id", id);
  revalidatePath(`/customers/${data.customer_id}`);
}

export async function verifyKyc(formData: FormData) {
  const client = await requireOwner();
  const id = String(formData.get("id"));
  const { data } = await client.from("kyc_documents").update({ verified: true }).eq("id", id).select("customer_id").single();
  if (data) revalidatePath(`/customers/${data.customer_id}`);
}
