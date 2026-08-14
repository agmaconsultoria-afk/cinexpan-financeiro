import { NextRequest, NextResponse } from "next/server";
import { exigirEdicao } from "@/lib/auth/session";
import { lerCredenciais, analiseVendaMes, AnaliseVendaMes } from "@/lib/rastreio/omie-client";
import { lerPosicaoEstoque, salvarAnaliseEstoque, EstoquePosicaoSnapshot } from "@/lib/rastreio/db";
import { construirModelo, custoUnitGranel, ehArgila, volumeM3 } from "@/lib/rastreio/custeio-granel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ResultadoAnalise {
  cmv: number; // CMV a custo de granel (matéria-prima)
  vendas: number;
  estoqueCusto: number; // estoque avaliado a custo de granel (mesma régua do CMV)
  estoquePrecoVenda: number;
  qtdeEstoque: number; // volume (m³) de argila em estoque
  qtdeVendida: number; // volume (m³) de argila vendida no mês
  totalNFs: number;
  vendaSemVolume: number; // venda de produtos sem volume/custo identificável
}

/**
 * CMV e estoque a custo de GRANEL (matéria-prima): cada produto empacotado é
 * valorado por volume × custo do granel da mesma argila; solto/granel usa o
 * próprio custo médio. Isso remove o custo de ensacamento inflado do custo
 * médio do Omie. Giro (custo) fica com CMV e estoque na MESMA régua.
 * Estoque a preço de venda mantém o preço médio praticado no mês por produto.
 */
function calcularAnalise(venda: AnaliseVendaMes, snapshot: EstoquePosicaoSnapshot): ResultadoAnalise {
  const modelo = construirModelo(snapshot.itens);
  const infoPorCodigo = new Map<string, { unidade: string; familia: string; cmc: number }>();
  for (const it of snapshot.itens) {
    infoPorCodigo.set((it.codigo || "").toUpperCase(), {
      unidade: it.unidade,
      familia: it.familia,
      cmc: Number(it.cmcUnitario) || 0,
    });
  }

  // CMV = Σ (qtd vendida × custo unitário a granel). Vendas são só de argila.
  // qtdeVendida em VOLUME (m³) p/ a Cobertura.
  let cmv = 0;
  let vendaSemVolume = 0;
  let qtdeVendida = 0;
  for (const p of Object.values(venda.porProduto)) {
    const info = infoPorCodigo.get((p.codigo || "").toUpperCase());
    const r = custoUnitGranel(p.descricao, info?.unidade ?? "", info?.familia ?? "", info ? info.cmc : null, modelo);
    if (r.custoUnit <= 0) vendaSemVolume += p.venda;
    cmv += p.quantidade * r.custoUnit;
    if (ehArgila(p.descricao, info?.familia ?? "")) {
      qtdeVendida += p.quantidade * (volumeM3(p.descricao, info?.unidade ?? "") ?? 0);
    }
  }

  // Estoque de ARGILA (produto acabado + em processo) — exclui matéria-prima e
  // embalagem. Custo a granel e preço de venda na mesma régua do CMV.
  const markupGlobal = cmv > 0 ? venda.vendas / cmv : 1;
  let estoqueCusto = 0;
  let estoquePrecoVenda = 0;
  let qtdeEstoque = 0;
  for (const item of snapshot.itens) {
    if (!ehArgila(item.descricao, item.familia)) continue;
    const r = custoUnitGranel(item.descricao, item.unidade, item.familia, Number(item.cmcUnitario) || 0, modelo);
    const saldo = Number(item.quantidade) || 0;
    estoqueCusto += saldo * r.custoUnit;
    qtdeEstoque += saldo * (volumeM3(item.descricao, item.unidade) ?? 0);
    const vp = venda.porProduto[(item.codigo || "").toUpperCase()];
    const precoUnit = vp && vp.quantidade > 0 ? vp.venda / vp.quantidade : r.custoUnit * markupGlobal;
    estoquePrecoVenda += saldo * precoUnit;
  }

  return { cmv, vendas: venda.vendas, estoqueCusto, estoquePrecoVenda, qtdeEstoque, qtdeVendida, totalNFs: venda.totalNFs, vendaSemVolume };
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
      qtdeEstoque: r.qtdeEstoque,
      qtdeVendida: r.qtdeVendida,
      totalNFs: r.totalNFs,
    });
    return NextResponse.json({ ok: true, competencia, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}

/** GET — diagnóstico (NÃO grava): totais + amostra por produto (custo a granel). */
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
    const modelo = construirModelo(snapshot.itens);
    const infoPorCodigo = new Map<string, { unidade: string; familia: string; cmc: number }>();
    for (const it of snapshot.itens) infoPorCodigo.set((it.codigo || "").toUpperCase(), { unidade: it.unidade, familia: it.familia, cmc: Number(it.cmcUnitario) || 0 });
    const round = (n: number) => Math.round(n * 10000) / 10000;
    const amostra = Object.values(venda.porProduto)
      .map((p) => {
        const info = infoPorCodigo.get((p.codigo || "").toUpperCase());
        const c = custoUnitGranel(p.descricao, info?.unidade ?? "", info?.familia ?? "", info ? info.cmc : null, modelo);
        const precoMedio = p.quantidade > 0 ? p.venda / p.quantidade : 0;
        return {
          codigo: p.codigo,
          descricao: p.descricao,
          quantidade: round(p.quantidade),
          precoMedioVenda: round(precoMedio),
          custoUnitGranel: round(c.custoUnit),
          custoTotal: round(p.quantidade * c.custoUnit),
          markup: c.custoUnit > 0 ? round(precoMedio / c.custoUnit) : null,
          base: c.base,
          volumeM3: c.volumeM3,
          tipo: c.tipo,
        };
      })
      .sort((a, b) => b.custoTotal - a.custoTotal)
      .slice(0, 24);
    return NextResponse.json({
      ok: true,
      competencia,
      ...r,
      markupGlobal: r.cmv > 0 ? round(r.vendas / r.cmv) : null,
      granelPorTipo: Object.fromEntries([...modelo.granelPorTipo.entries()].map(([k, val]) => [k, round(val)])),
      granelGlobal: round(modelo.granelGlobal),
      amostraPorProduto: amostra,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}
