import { NextRequest, NextResponse } from "next/server";
import { exigirSessao } from "@/lib/auth/session";
import { trocarSenha } from "@/lib/auth/db";

export const dynamic = "force-dynamic";

/** POST /api/auth/senha — troca a senha do usuário autenticado. */
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao();
  if (sessao instanceof NextResponse) return sessao;

  try {
    const body = await req.json();
    const senhaAtual = (body?.senhaAtual ?? "").toString();
    const novaSenha = (body?.novaSenha ?? "").toString();

    if (!senhaAtual || !novaSenha) {
      return NextResponse.json({ ok: false, erro: "Preencha todos os campos." }, { status: 400 });
    }
    if (novaSenha.length < 6) {
      return NextResponse.json(
        { ok: false, erro: "A nova senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const ok = await trocarSenha(sessao.id, senhaAtual, novaSenha);
    if (!ok) {
      return NextResponse.json({ ok: false, erro: "Senha atual incorreta." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao trocar a senha.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
