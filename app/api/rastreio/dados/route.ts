import { NextResponse } from "next/server";
import { lerTudo } from "@/lib/rastreio/db";
import { exigirSessao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/rastreio/dados — histórico acumulado + configuração de faturamento. */
export async function GET() {
  const sessao = await exigirSessao();
  if (sessao instanceof NextResponse) return sessao;
  try {
    const dados = await lerTudo();
    return NextResponse.json({ ok: true, ...dados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao ler a base.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
