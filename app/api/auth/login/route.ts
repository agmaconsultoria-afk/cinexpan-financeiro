import { NextRequest, NextResponse } from "next/server";
import { autenticar, criarSessao } from "@/lib/auth/db";
import { COOKIE_SESSAO, COOKIE_MAX_AGE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/login  body: { email, senha } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body?.email ?? "").toString();
    const senha = (body?.senha ?? "").toString();
    if (!email || !senha) {
      return NextResponse.json({ ok: false, erro: "Informe email e senha." }, { status: 400 });
    }

    const usuario = await autenticar(email, senha);
    if (!usuario) {
      return NextResponse.json(
        { ok: false, erro: "Email ou senha inválidos." },
        { status: 401 }
      );
    }

    const token = await criarSessao(usuario.id);
    const resp = NextResponse.json({ ok: true, usuario });
    resp.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao autenticar.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
