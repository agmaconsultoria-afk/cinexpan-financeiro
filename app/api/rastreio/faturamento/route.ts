import { NextRequest, NextResponse } from "next/server";
import { setFaturamento, setVendasPF, setFaturamentoOmie } from "@/lib/rastreio/db";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/rastreio/faturamento
 * body: { mes: "YYYY-MM", faturamento?: number, vendasPF?: number }
 * Grava o faturamento manual / vendas PF da competência na base.
 */
export async function POST(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;
  try {
    const body = await req.json();
    const mes = (body?.mes ?? "").toString();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
    }
    if (typeof body.faturamento === "number") await setFaturamento(mes, body.faturamento);
    if (typeof body.vendasPF === "number") await setVendasPF(mes, body.vendasPF);
    if (typeof body.faturamentoOmie === "number") await setFaturamentoOmie(mes, body.faturamentoOmie);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gravar.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
