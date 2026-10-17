import Link from "next/link";
import { signOut } from "../login/actions";
import { loadSettings } from "@/lib/data";
import { requireOwner } from "@/lib/supabase";
import { Nav } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const client = await requireOwner();
  const settings = await loadSettings(client);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-bold text-white">₹</span>
            <span className="font-semibold">{settings.business_name || "LendBook"}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/loans/new" className="btn">+ New loan</Link>
            <form action={signOut}>
              <button className="btn-outline hidden sm:inline-flex">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5 pb-24 md:pb-8">
        <Nav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
