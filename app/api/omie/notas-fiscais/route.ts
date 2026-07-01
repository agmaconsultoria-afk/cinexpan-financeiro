import { NextRequest, NextResponse } from "next/server";
import { lerCredenciais, listarNotasFiscais, callOmie } from "@/lib/rastreio/omie-client";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/omie/notas-fiscais?competencia=YYYY-MM
 * GET /api/omie/notas-fiscais?de=01/06/2026&ate=30/06/2026
 *
 * Consulta as Notas Fiscais de Saída no Omie (produtos/nf) e retorna
 * os itens já normalizados. As credenciais nunca são expostas ao cliente.
 */
export async function GET(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;

  const cred = lerCredenciais();
  if (!cred) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Credenciais do Omie não configuradas. Defina OMIE_APP_KEY e OMIE_APP_SECRET no ambiente.",
      },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia");
  let dataDe: string | undefined;
  let dataAte: string | undefined;

  const p2 = (n: number) => String(n).padStart(2, "0");

  if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
    const [y, m] = competencia.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
    dataDe = `01/${p2(m)}/${y}`;
    dataAte = `${p2(ultimoDia)}/${p2(m)}/${y}`;
  } else {
    dataDe = searchParams.get("de") ?? undefined;
    dataAte = searchParams.get("ate") ?? undefined;
  }

  // Modo debug de pedido: consulta um pedido por código, OU lista pedidos do
  // período, para descobrir onde fica a "Operação" que o relatório do Omie usa.
  const pedidoDebug = searchParams.get("pedido");
  if (pedidoDebug) {
    const resultados: Record<string, unknown> = { ok: true, pedidoDebug: true };
    if (pedidoDebug === "list") {
      // Lista os primeiros pedidos do período (estrutura completa p/ ver a operação)
      const p: Record<string, unknown> = { pagina: 1, registros_por_pagina: 3, apenas_importado_api: "N" };
      if (dataDe) p.filtrar_por_data_de = dataDe;
      if (dataAte) p.filtrar_por_data_ate = dataAte;
      for (const [rec, met] of [
        ["produtos/pedido/", "ListarPedidos"],
        ["pedido/pedido_venda_produto/", "ListarPedidos"],
      ] as [string, string][]) {
        try {
          resultados[`${rec}${met}`] = await callOmie(cred, rec, met, p);
        } catch (e) {
          resultados[`${rec}${met}_erro`] = e instanceof Error ? e.message : String(e);
        }
      }
      return NextResponse.json(resultados);
    }
    const ids = pedidoDebug.split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      for (const [rec, met, params] of [
        ["produtos/pedido/", "ConsultarPedido", { codigo_pedido: Number(id) }],
        ["pedido/pedido_venda_produto/", "ConsultarPedido", { codigo_pedido: Number(id) }],
      ] as [string, string, Record<string, unknown>][]) {
        try {
          resultados[`${rec}_${id}`] = await callOmie(cred, rec, met, params);
        } catch (e) {
          resultados[`${rec}_${id}_erro`] = e instanceof Error ? e.message : String(e);
        }
      }
    }
    return NextResponse.json(resultados);
  }

  // Modo debug: amostra bruta dos endpoints de NF para diagnóstico.
  if (searchParams.get("debug") === "1") {
    const resultados: Record<string, unknown> = { ok: true, debug: true };
    const baseParams = dataDe ? { pagina: 1, registros_por_pagina: 1, filtrar_por_data_de: dataDe, filtrar_por_data_ate: dataAte } : { pagina: 1, registros_por_pagina: 1 };
    for (const [rec, met, params] of [
      ["produtos/nfconsultar/", "ListarNF", baseParams],
      ["produtos/nf/", "ListarNFe", { pagina: 1, registros_por_pagina: 1 }],
      ["pedido/pedido_venda_produto/", "ListarPedidos", { pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N", filtrar_por_etapa: "70" }],
    ] as [string, string, Record<string, unknown>][]) {
      try {
        resultados[`${rec}${met}`] = await callOmie(cred, rec, met, params);
      } catch (e) {
        resultados[`${rec}${met}_erro`] = e instanceof Error ? e.message : String(e);
      }
    }
    return NextResponse.json(resultados);
  }

  try {
    const resultado = await listarNotasFiscais(cred, { dataDe, dataAte });

    // Resumo por natureza da operação (ide.natOp), por operação derivada do CFOP
    // (Venda/Remessa/Devolução) e por CFOP — ajuda a validar contra o relatório Omie.
    const resumoPorNatOp: Record<string, { nfs: number; total: number }> = {};
    const resumoPorOperacao: Record<string, { nfs: number; total: number }> = {};
    const resumoPorCFOP: Record<string, { nfs: number; total: number }> = {};
    const resumoPorCategoria: Record<string, { nfs: number; total: number }> = {};
    const resumoPorFinNFe: Record<string, { nfs: number; total: number }> = {};
    const rotuloFinNFe: Record<string, string> = { "1": "1 - Normal", "2": "2 - Complementar", "3": "3 - Ajuste", "4": "4 - Devolução" };
    for (const item of resultado.itens) {
      const chaveNat = item.natOp || "(sem natureza)";
      if (!resumoPorNatOp[chaveNat]) resumoPorNatOp[chaveNat] = { nfs: 0, total: 0 };
      resumoPorNatOp[chaveNat].nfs++;
      resumoPorNatOp[chaveNat].total += item.totalMercadoria;

      const chaveOp = item.operacao || "(sem operação)";
      if (!resumoPorOperacao[chaveOp]) resumoPorOperacao[chaveOp] = { nfs: 0, total: 0 };
      resumoPorOperacao[chaveOp].nfs++;
      resumoPorOperacao[chaveOp].total += item.totalMercadoria;

      const chaveCfop = item.cfop || "(sem CFOP)";
      if (!resumoPorCFOP[chaveCfop]) resumoPorCFOP[chaveCfop] = { nfs: 0, total: 0 };
      resumoPorCFOP[chaveCfop].nfs++;
      resumoPorCFOP[chaveCfop].total += item.totalMercadoria;

      const chaveCat = item.categoria || "(sem categoria)";
      if (!resumoPorCategoria[chaveCat]) resumoPorCategoria[chaveCat] = { nfs: 0, total: 0 };
      resumoPorCategoria[chaveCat].nfs++;
      resumoPorCategoria[chaveCat].total += item.totalMercadoria;

      const chaveFin = rotuloFinNFe[item.finNFe] || item.finNFe || "(sem finNFe)";
      if (!resumoPorFinNFe[chaveFin]) resumoPorFinNFe[chaveFin] = { nfs: 0, total: 0 };
      resumoPorFinNFe[chaveFin].nfs++;
      resumoPorFinNFe[chaveFin].total += item.totalMercadoria;
    }

    return NextResponse.json({
      ok: true,
      fonte: resultado.fonte,
      totalNFs: resultado.totalNFs,
      truncado: resultado.truncado,
      itens: resultado.itens,
      resumoPorNatOp,
      resumoPorOperacao,
      resumoPorCFOP,
      resumoPorCategoria,
      resumoPorFinNFe,
      excluidas: resultado.excluidas,
      primeiroCompl: resultado.primeiroCompl,
      // Incluído apenas quando itens = 0 — ajuda a diagnosticar estrutura real da API
      ...(resultado.primeiroRegistroBruto !== undefined ? { primeiroRegistroBruto: resultado.primeiroRegistroBruto } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao consultar NFs.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
