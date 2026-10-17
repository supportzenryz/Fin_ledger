import { createOwner, ownerExists, signIn } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const setup = !(await ownerExists());
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={setup ? createOwner : signIn} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">₹</span>
          <div>
            <h1 className="font-semibold">LendBook</h1>
            <p className="muted">{setup ? "Create your owner account (one time)" : "Sign in to your ledger"}</p>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{String(error)}</p>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8}
            autoComplete={setup ? "new-password" : "current-password"} />
        </div>
        <button className="btn w-full">{setup ? "Create account" : "Sign in"}</button>
      </form>
    </main>
  );
}
