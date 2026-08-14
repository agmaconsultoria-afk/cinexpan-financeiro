import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/auth/session";
import { listarPosicoesEstoque, listarAnalisesEstoque, lerTudo } from "@/lib/rastreio/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/estoque/analise
 * Base da análise Estoque × Venda: retorna os snapshots de posição de estoque
 * salvos (por competência) + o faturamento (venda) de cada mês, para o cálculo
 * de giro de estoque e custo médio na tela.
 */
export async function GET() {
  const sessao = await exigirSessao();
  if (sessao instanceof NextResponse) return sessao;

  try {
    const [posicoes, analises, dados] = await Promise.all([
      listarPosicoesEstoque(),
      listarAnalisesEstoque(),
      lerTudo(),
    ]);

    // Venda do mês: prioriza o faturamento apurado do Omie; cai para o manual.
    const faturamento: Record<string, number> = {};
    const meses = new Set([...Object.keys(dados.faturamento), ...Object.keys(dados.faturamentoOmie)]);
    for (const m of meses) {
      faturamento[m] = dados.faturamentoOmie[m] || dados.faturamento[m] || 0;
    }

    return NextResponse.json({
      ok: true,
      posicoes,
      analises,
      faturamento,
      vendasPF: dados.vendasPF,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar a análise de estoque.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
