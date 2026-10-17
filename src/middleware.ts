import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Deprecated "middleware" name on purpose: OpenNext for Cloudflare runs it on the edge runtime,
// which it fully supports (Node "proxy.ts" is still experimental there).
// Keeps the Supabase session fresh and sends signed-out visitors to /login.
// Real authorization happens in requireOwner() and in database RLS.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user && !request.nextUrl.pathname.startsWith("/login")) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Public: customer agreement links, cron endpoint, PWA files and static assets.
  matcher: ["/((?!a/|api/cron|_next/|icons/|manifest.webmanifest|sw.js|favicon.ico|offline).*)"],
};
