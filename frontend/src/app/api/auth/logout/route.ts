import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    // best-effort — the real session is the cookie we're about to delete
    // either way, so a backend hiccup here shouldn't block logout.
    await backendFetch("auth/logout", { method: "POST", accessToken: token }).catch(() => undefined);
  }

  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
