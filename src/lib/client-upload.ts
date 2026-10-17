// Browser-side upload helpers. Files go straight to Supabase Storage through one-time signed
// upload URLs, so large phone photos never pass through the (size-limited) app server.
import { createClient } from "@supabase/supabase-js";

export type UploadTicket = { bucket: string; path: string; token: string };

const MAX_SIDE = 1800;

/** Re-encodes photos as JPEG, at most 1800px on the long side (~300-600 KB). PDFs are left alone. */
export async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // browser can't decode it (e.g. HEIC outside Safari): upload as-is, server validates
  }
}

export async function putSigned(t: UploadTicket, file: File): Promise<void> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await sb.storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
}
