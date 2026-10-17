"use server";

import { redirect } from "next/navigation";
import { adminDb, db } from "@/lib/supabase";

export async function ownerExists(): Promise<boolean> {
  const { count } = await adminDb().from("admins").select("*", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export async function signIn(formData: FormData) {
  const client = await db();
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email")).trim(),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/");
}

// Only allowed while no owner exists; the database trigger makes this first account the owner.
export async function createOwner(formData: FormData) {
  if (await ownerExists()) redirect("/login?error=Owner+account+already+exists");
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  if (password.length < 8) redirect("/login?error=Password+must+be+at+least+8+characters");
  const { error } = await adminDb().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  await signIn(formData);
}

export async function signOut() {
  const client = await db();
  await client.auth.signOut();
  redirect("/login");
}
