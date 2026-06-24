import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { removerSessao } from "@/lib/auth/db";
import { COOKIE_SESSAO } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — encerra a sessão atual. */
export async function POST() {
  const token = cookies().get(COOKIE_SESSAO)?.value;
  if (token) {
    try {
      await removerSessao(token);
    } catch {
      // ignora erro de banco no logout
    }
  }
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(COOKIE_SESSAO, "", { path: "/", maxAge: 0 });
  return resp;
}
