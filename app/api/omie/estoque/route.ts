import { NextRequest, NextResponse } from "next/server";
import { lerCredenciais, posicaoEstoque, diagnosticoEstoqueProdutos } from "@/lib/rastreio/omie-client";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/omie/estoque?competencia=YYYY-MM
 * Posição de estoque no último dia do mês, cruzada com o cadastro de produtos,
 * no layout do relatório de contabilidade (Código, NCM, Tipo SPED, Família,
 * Unidade, Quantidade, CMC Unitário, CMC Total, Período).
 * ?debug=1 devolve amostras cruas do estoque e do produto p/ conferir campos.
 */
export async function GET(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;

  const cred = lerCredenciais();
  if (!cred) {
    return NextResponse.json(
      { ok: false, erro: "Credenciais do Omie não configuradas (OMIE_APP_KEY / OMIE_APP_SECRET)." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia");
  const debug = searchParams.get("debug") === "1";
  const incluirZerados = searchParams.get("zerados") === "1";
  // ?codigos=0500,201506,1506 -> devolve os campos crus (estoque + cadastro)
  // desses produtos para conferir de qual campo sai o custo médio da contabilidade.
  const debugCodigos = (searchParams.get("codigos") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ ok: false, erro: "Informe a competência (YYYY-MM)." }, { status: 400 });
  }

  // Data da posição = último dia do mês.
  const [y, m] = competencia.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const dataPosicao = `${p2(ultimoDia)}/${p2(m)}/${y}`;
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const periodo = `${y} / ${p2(m)} (${MESES[m - 1]})`;

  try {
    // Diagnóstico rápido: se vier ?codigos=..., consulta só esses produtos
    // direto no Omie (rápido) em vez de varrer todo o catálogo/estoque (lento,
    // estava estourando o tempo da requisição no navegador).
    if (debugCodigos.length) {
      const diag = await diagnosticoEstoqueProdutos(cred, { dataPosicao, codigos: debugCodigos });
      return NextResponse.json({ ok: true, competencia, dataPosicao, periodo, debugCampos: diag });
    }

    const res = await posicaoEstoque(cred, { dataPosicao, incluirZerados, debug, debugCodigos });
    return NextResponse.json({
      ok: true,
      competencia,
      dataPosicao,
      periodo,
      totalRegistros: res.totalRegistros,
      itens: res.itens.map((i) => ({ ...i, periodo })),
      ...(debug ? { amostraEstoque: res.amostraEstoque, amostraProduto: res.amostraProduto } : {}),
      ...(debugCodigos.length ? { debugCampos: res.debugCampos } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar a posição de estoque.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
