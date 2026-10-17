"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { putSigned, shrink } from "@/lib/client-upload";
import { prepareKycUpload, registerKyc } from "../actions";

export function KycUpload({ customerId, docTypes }: { customerId: string; docTypes: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const raw = form.get("file");
    const docType = String(form.get("doc_type"));
    if (!(raw instanceof File) || !raw.size) return setError("Choose a file");
    setBusy(true);
    setError(null);
    try {
      const file = await shrink(raw);
      const prep = await prepareKycUpload(customerId, docType, file.type, file.size);
      if (!prep.ok) return setError(prep.error);
      await putSigned(prep.ticket, file);
      await registerKyc(customerId, docType, prep.ticket.path, raw.name);
      formEl.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <select name="doc_type" className="input">
          {Object.entries(docTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="file" name="file" accept="image/*,application/pdf" className="input" required />
        <button className="btn" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
    </form>
  );
}
