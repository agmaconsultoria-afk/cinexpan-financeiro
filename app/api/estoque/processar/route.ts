import { NextRequest, NextResponse } from "next/server";
import { exigirEdicao } from "@/lib/auth/session";
import { lerCredenciais, analiseVendaMes, AnaliseVendaMes } from "@/lib/rastreio/omie-client";
import { lerPosicaoEstoque, salvarAnaliseEstoque, EstoquePosicaoSnapshot } from "@/lib/rastreio/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ResultadoAnalise {
  cmv: number;
  vendas: number;
  estoqueCusto: number;
  estoquePrecoVenda: number;
  totalNFs: number;
  vendaSemCusto: number; // venda de produtos sem CMC no snapshot (usou razão média)
  produtosSemCusto: string[];
}

/**
 * CMV correto = Σ (quantidade vendida × CMC unitário do produto), pegando o CMC
 * do snapshot de estoque do mês. (O campo nCMCTotal da NF é o valor TOTAL de
 * estoque do produto, repetido por NF — não serve como custo da linha.)
 * Para produtos vendidos sem CMC no snapshot, aplica a razão média custo/venda.
 * Estoque a preço de venda = Σ (saldo × preço médio de venda do produto no mês).
 */
function calcularAnalise(venda: AnaliseVendaMes, snapshot: EstoquePosicaoSnapshot): ResultadoAnalise {
  const cmcMap = new Map<string, number>();
  for (const it of snapshot.itens) cmcMap.set((it.codigo || "").toUpperCase(), Number(it.cmcUnitario) || 0);

  let custoCoberto = 0;
  let vendaCoberta = 0;
  let vendaSemCusto = 0;
  const produtosSemCusto: string[] = [];
  for (const p of Object.values(venda.porProduto)) {
    const cmc = cmcMap.get((p.codigo || "").toUpperCase());
    if (cmc != null && cmc > 0) {
      custoCoberto += p.quantidade * cmc;
      vendaCoberta += p.venda;
    } else {
      vendaSemCusto += p.venda;
      if (p.codigo) produtosSemCusto.push(p.codigo);
    }
  }
  const razao = vendaCoberta > 0 ? custoCoberto / vendaCoberta : 0;
  const cmv = custoCoberto + vendaSemCusto * razao;

  // Estoque avaliado a preço de venda (mix do próprio estoque).
  const markupGlobal = cmv > 0 ? venda.vendas / cmv : 1;
  let estoquePrecoVenda = 0;
  for (const item of snapshot.itens) {
    const vp = venda.porProduto[(item.codigo || "").toUpperCase()];
    const precoUnit =
      vp && vp.quantidade > 0 ? vp.venda / vp.quantidade : (Number(item.cmcUnitario) || 0) * markupGlobal;
    estoquePrecoVenda += (Number(item.quantidade) || 0) * precoUnit;
  }

  return {
    cmv,
    vendas: venda.vendas,
    estoqueCusto: snapshot.totalCmc,
    estoquePrecoVenda,
    totalNFs: venda.totalNFs,
    vendaSemCusto,
    produtosSemCusto,
  };
}

function validar(req: NextRequest) {
  const cred = lerCredenciais();
  if (!cred) return { erro: NextResponse.json({ ok: false, erro: "Credenciais do Omie não configuradas." }, { status: 400 }) };
  const competencia = new URL(req.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return { erro: NextResponse.json({ ok: false, erro: "Informe a competência (YYYY-MM)." }, { status: 400 }) };
  }
  return { cred, competencia };
}

/** POST — calcula e GRAVA a análise do mês. */
export async function POST(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;
  const v = validar(req);
  if (v.erro) return v.erro;
  const { cred, competencia } = v;

  const snapshot = await lerPosicaoEstoque(competencia);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, erro: "Rode a Posição de Estoque deste mês primeiro (não há posição salva)." },
      { status: 400 }
    );
  }

  try {
    const venda = await analiseVendaMes(cred, competencia);
    const r = calcularAnalise(venda, snapshot);
    await salvarAnaliseEstoque({
      competencia,
      cmv: r.cmv,
      vendas: r.vendas,
      estoqueCusto: r.estoqueCusto,
      estoquePrecoVenda: r.estoquePrecoVenda,
      totalNFs: r.totalNFs,
    });
    return NextResponse.json({ ok: true, competencia, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}

/** GET — diagnóstico (NÃO grava): totais + amostra por produto (com custo calculado). */
export async function GET(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;
  const v = validar(req);
  if (v.erro) return v.erro;
  const { cred, competencia } = v;

  const snapshot = await lerPosicaoEstoque(competencia);
  if (!snapshot) {
    return NextResponse.json({ ok: false, erro: "Sem posição de estoque salva deste mês." }, { status: 400 });
  }

  try {
    const venda = await analiseVendaMes(cred, competencia);
    const r = calcularAnalise(venda, snapshot);
    const cmcMap = new Map<string, number>();
    for (const it of snapshot.itens) cmcMap.set((it.codigo || "").toUpperCase(), Number(it.cmcUnitario) || 0);
    const amostra = Object.values(venda.porProduto)
      .map((p) => {
        const cmc = cmcMap.get((p.codigo || "").toUpperCase()) ?? null;
        return {
          codigo: p.codigo,
          descricao: p.descricao,
          quantidade: p.quantidade,
          venda: p.venda,
          cmcUnitario: cmc,
          custoCalc: cmc != null ? p.quantidade * cmc : null,
        };
      })
      .sort((a, b) => (b.custoCalc ?? 0) - (a.custoCalc ?? 0))
      .slice(0, 20);
    return NextResponse.json({ ok: true, competencia, ...r, amostraPorProduto: amostra });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}
