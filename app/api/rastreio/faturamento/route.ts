import { NextRequest, NextResponse } from "next/server";
import { setFaturamento, setVendasPF } from "@/lib/rastreio/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/rastreio/faturamento
 * body: { mes: "YYYY-MM", faturamento?: number, vendasPF?: number }
 * Grava o faturamento manual / vendas PF da competência na base.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mes = (body?.mes ?? "").toString();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
    }
    if (typeof body.faturamento === "number") setFaturamento(mes, body.faturamento);
    if (typeof body.vendasPF === "number") setVendasPF(mes, body.vendasPF);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gravar.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
