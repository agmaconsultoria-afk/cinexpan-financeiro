import { NextRequest, NextResponse } from "next/server";
import { gravarHistoricoOmie, lerHistoricoOmie, limparHistoricoOmie } from "@/lib/rastreio/db";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const historico = await lerHistoricoOmie(50);
    return NextResponse.json({ ok: true, historico });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao ler histórico.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;
  try {
    await limparHistoricoOmie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao limpar histórico.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;
  try {
    const body = await req.json();
    const mes = (body?.mes ?? "").toString();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
    }
    const totalNFs = Number(body?.totalNFs ?? 0);
    const totalFaturado = Number(body?.totalFaturado ?? 0);
    await gravarHistoricoOmie(mes, totalNFs, totalFaturado);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gravar histórico.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
