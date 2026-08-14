import { NextRequest, NextResponse } from "next/server";
import { exigirEdicao } from "@/lib/auth/session";
import { lerCredenciais, analiseVendaMes } from "@/lib/rastreio/omie-client";
import { lerPosicaoEstoque, salvarAnaliseEstoque } from "@/lib/rastreio/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/estoque/processar?competencia=YYYY-MM
 * Calcula a base do giro do mês:
 *  - CMV e Vendas (Σ das NFs de venda do mês, item a item).
 *  - Estoque a custo (do snapshot salvo) e estoque avaliado a PREÇO DE VENDA
 *    (saldo × preço médio de venda do produto no mês; sem venda no mês, cai no
 *    custo × markup global).
 * Requer que a Posição de Estoque do mês já tenha sido gravada.
 */
export async function POST(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;

  const cred = lerCredenciais();
  if (!cred) {
    return NextResponse.json(
      { ok: false, erro: "Credenciais do Omie não configuradas (OMIE_APP_KEY / OMIE_APP_SECRET)." },
      { status: 400 }
    );
  }

  const competencia = new URL(req.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ ok: false, erro: "Informe a competência (YYYY-MM)." }, { status: 400 });
  }

  const snapshot = await lerPosicaoEstoque(competencia);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, erro: "Rode a Posição de Estoque deste mês primeiro (não há posição salva)." },
      { status: 400 }
    );
  }

  try {
    const venda = await analiseVendaMes(cred, competencia);
    const markupGlobal = venda.cmv > 0 ? venda.vendas / venda.cmv : 1;

    // Estoque avaliado a preço de venda: usa o preço médio praticado no mês por
    // produto; se o produto não teve venda no mês, aplica o markup global sobre o custo.
    let estoquePrecoVenda = 0;
    for (const item of snapshot.itens) {
      const cod = (item.codigo || "").toString().toUpperCase();
      const vp = venda.porProduto[cod];
      const precoUnit =
        vp && vp.quantidade > 0 ? vp.venda / vp.quantidade : (item.cmcUnitario || 0) * markupGlobal;
      estoquePrecoVenda += (item.quantidade || 0) * precoUnit;
    }

    await salvarAnaliseEstoque({
      competencia,
      cmv: venda.cmv,
      vendas: venda.vendas,
      estoqueCusto: snapshot.totalCmc,
      estoquePrecoVenda,
      totalNFs: venda.totalNFs,
    });

    return NextResponse.json({
      ok: true,
      competencia,
      cmv: venda.cmv,
      vendas: venda.vendas,
      estoqueCusto: snapshot.totalCmc,
      estoquePrecoVenda,
      totalNFs: venda.totalNFs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao processar a análise de venda do mês.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
