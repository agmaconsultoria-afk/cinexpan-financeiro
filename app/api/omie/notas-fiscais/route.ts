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

    // Resumo por natureza da operação (ide.natOp) e por operação Omie (compl.cOperacao)
    const resumoPorNatOp: Record<string, { nfs: number; total: number }> = {};
    const resumoPorOperacao: Record<string, { nfs: number; total: number }> = {};
    for (const item of resultado.itens) {
      const chaveNat = item.natOp || "(sem natureza)";
      if (!resumoPorNatOp[chaveNat]) resumoPorNatOp[chaveNat] = { nfs: 0, total: 0 };
      resumoPorNatOp[chaveNat].nfs++;
      resumoPorNatOp[chaveNat].total += item.totalMercadoria;

      const chaveOp = item.operacao || "(sem operação)";
      if (!resumoPorOperacao[chaveOp]) resumoPorOperacao[chaveOp] = { nfs: 0, total: 0 };
      resumoPorOperacao[chaveOp].nfs++;
      resumoPorOperacao[chaveOp].total += item.totalMercadoria;
    }

    return NextResponse.json({
      ok: true,
      fonte: resultado.fonte,
      totalNFs: resultado.totalNFs,
      truncado: resultado.truncado,
      itens: resultado.itens,
      resumoPorNatOp,
      resumoPorOperacao,
      // Incluído apenas quando itens = 0 — ajuda a diagnosticar estrutura real da API
      ...(resultado.primeiroRegistroBruto !== undefined ? { primeiroRegistroBruto: resultado.primeiroRegistroBruto } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao consultar NFs.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
