"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { putSigned, shrink } from "@/lib/client-upload";
import { finalizeUpload, prepareUpload } from "./actions";

export function UploadForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const signedRaw = form.getAll("signed").filter((f): f is File => f instanceof File && f.size > 0);
    const idRaw = form.get("id_proof");
    if (!signedRaw.length || !(idRaw instanceof File) || !idRaw.size) return setError("Please choose the signed agreement and your ID proof.");
    try {
      setBusy("Preparing files…");
      const signed = await Promise.all(signedRaw.map(shrink));
      const id = await shrink(idRaw);
      const prep = await prepareUpload(token, signed.map((f) => ({ type: f.type, size: f.size })), { type: id.type, size: id.size });
      if (!prep.ok) return setError(prep.error);
      for (let i = 0; i < signed.length; i++) {
        setBusy(`Uploading page ${i + 1} of ${signed.length}…`);
        await putSigned(prep.data.signed[i], signed[i]);
      }
      setBusy("Uploading ID proof…");
      await putSigned(prep.data.id, id);
      setBusy("Finishing…");
      const done = await finalizeUpload(token, {
        signed: prep.data.signed.map((t) => t.path),
        id: prep.data.id.path,
        idType: String(form.get("id_type")),
        idName: idRaw.name,
        consent: form.get("consent") === "on",
      });
      if (!done.ok) return setError(done.error);
      router.refresh();
    } catch {
      setError("Upload failed. Please check your internet connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h2 className="font-semibold">Step 2 · Upload</h2>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div>
        <label className="label" htmlFor="signed">Signed agreement (one PDF, or a photo of each page)</label>
        <input id="signed" name="signed" type="file" multiple required accept="application/pdf,image/*" className="input" />
      </div>
      <div className="grid grid-cols-[9rem_1fr] gap-2">
        <div>
          <label className="label" htmlFor="id_type">ID proof type</label>
          <select id="id_type" name="id_type" className="input">
            <option value="aadhaar_masked">Aadhaar (masked)</option>
            <option value="pan">PAN card</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="id_proof">ID proof photo / PDF</label>
          <input id="id_proof" name="id_proof" type="file" required accept="application/pdf,image/*" className="input" />
        </div>
      </div>
      <p className="text-xs text-slate-500">For Aadhaar, please cover the first 8 digits or upload the masked Aadhaar from the UIDAI website.</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>I confirm that I have signed this agreement, and I agree that my ID proof may be stored only for this loan&apos;s records.</span>
      </label>
      <button className="btn w-full" disabled={!!busy}>{busy ?? "Submit signed agreement"}</button>
    </form>
  );
}
