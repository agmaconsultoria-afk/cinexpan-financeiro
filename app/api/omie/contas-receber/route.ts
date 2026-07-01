import { NextRequest, NextResponse } from "next/server";
import {
  lerCredenciais,
  listarContasReceber,
  listarMovimentosReceber,
  listarNotasFiscais,
  amostrarContasReceber,
  amostrarMovimentos,
  resolverClientes,
} from "@/lib/rastreio/omie-client";
import { salvarCompetencia, setFaturamentoOmie } from "@/lib/rastreio/db";
import { exigirEdicao } from "@/lib/auth/session";

// Sempre dinâmico (lê credenciais e chama API externa em tempo de requisição).
export const dynamic = "force-dynamic";

/**
 * GET /api/omie/contas-receber?de=01/01/2025&ate=31/12/2026&debug=1
 *
 * Lê as credenciais do ambiente (OMIE_APP_KEY / OMIE_APP_SECRET), consulta o
 * Omie e devolve as contas a receber já no formato do módulo de Rastreio.
 * As credenciais NUNCA são expostas ao cliente.
 */
export async function GET(req: NextRequest) {
  const sessao = await exigirEdicao();
  if (sessao instanceof NextResponse) return sessao;

  const cred = lerCredenciais();
  if (!cred) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Credenciais do Omie não configuradas. Defina OMIE_APP_KEY e OMIE_APP_SECRET no arquivo .env.local e reinicie o servidor.",
      },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const debug = searchParams.get("debug") === "1";
  const fonte = searchParams.get("fonte"); // "mf" para Movimentos Financeiros
  const competencia = searchParams.get("competencia"); // "YYYY-MM"

  // Janela de busca. Por competência (preferido): busca o mês selecionado,
  // com folga de registro até o mês seguinte, e trava a emissão no mês exato.
  let dataDe: string;
  let dataAte: string | undefined;
  let emissaoMin: string | undefined;
  let emissaoMax: string | undefined;
  let pagtoDe: string | undefined;
  let pagtoAte: string | undefined;
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
    const [y, m] = competencia.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const proxMesUlt = new Date(Date.UTC(y, m + 1, 0)); // último dia do mês seguinte
    dataDe = `01/${p2(m)}/${y}`;
    dataAte = `${p2(proxMesUlt.getUTCDate())}/${p2(proxMesUlt.getUTCMonth() + 1)}/${proxMesUlt.getUTCFullYear()}`;
    emissaoMin = `${y}-${p2(m)}-01`;
    emissaoMax = `${y}-${p2(m)}-${p2(ultimoDia)}`;
    // Janela de pagamento p/ cruzamento com MF: do início da competência até hoje.
    const hoje = new Date();
    pagtoDe = `01/${p2(m)}/${y}`;
    pagtoAte = `${p2(hoje.getDate())}/${p2(hoje.getMonth() + 1)}/${hoje.getFullYear()}`;
  } else {
    dataDe = searchParams.get("de") ?? "01/01/2025";
    dataAte = searchParams.get("ate") ?? undefined;
  }

  // Modo debug: resposta enxuta com o registro bruto para conferir o mapeamento.
  if (debug) {
    try {
      const amostra =
        fonte === "mf" ? await amostrarMovimentos(cred) : await amostrarContasReceber(cred);
      return NextResponse.json({ ok: true, debug: true, fonte: fonte ?? "contareceber", ...amostra });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao consultar o Omie.";
      return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
    }
  }

  try {
    // Fonte padrão = ListarContasReceber (inclui títulos em aberto + recebidos,
    // com Recebido/Falta/Atrasado corretos). ?fonte=mf usa Movimentos Financeiros.
    const resultado =
      fonte === "mf"
        ? await listarMovimentosReceber(cred, { dataDe, dataAte, debug })
        : await listarContasReceber(cred, {
            dataDe,
            dataAte,
            emissaoMin,
            emissaoMax,
            debug,
            maxPaginas: 120,
            enriquecerMF: Boolean(competencia),
            pagtoDe,
            pagtoAte,
          });

    const emitidoEm = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    // Resolve os nomes dos clientes (o ListarContasReceber só traz o código).
    if (fonte !== "mf" && resultado.contas.length > 0) {
      await resolverClientes(cred, resultado.contas);
    }

    // APURAÇÃO ANCORADA NO FATURAMENTO: busca as NFs de venda (Pedido de Venda)
    // do mês e marca cada título com ehVenda = (NF do título ∈ NFs de venda).
    // Assim a apuração passa a considerar só o financeiro das vendas do mês —
    // títulos de outros meses, remessas e devoluções ficam de fora.
    let faturamentoOmie = 0;
    let nfsVenda = 0;
    if (competencia && fonte !== "mf" && dataDe) {
      try {
        const nf = await listarNotasFiscais(cred, { dataDe, dataAte });
        const norm = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
        const setVenda = new Set<string>();
        for (const it of nf.itens) {
          const n = norm(it.nf);
          if (n) setVenda.add(n);
          faturamentoOmie += it.totalMercadoria;
        }
        nfsVenda = setVenda.size;
        for (const c of resultado.contas) {
          c.ehVenda = setVenda.has(norm(c.notaFiscal));
        }
      } catch {
        // se a consulta de NF falhar, mantém os títulos sem marcação (apuração antiga)
      }
    }

    // Grava a competência na base (histórico) — não re-sincronizar o passado.
    if (competencia && fonte !== "mf" && resultado.contas.length > 0) {
      await salvarCompetencia(competencia, resultado.contas, emitidoEm);
      if (faturamentoOmie > 0) await setFaturamentoOmie(competencia, faturamentoOmie);
    }

    return NextResponse.json({
      ok: true,
      emitidoEm,
      totalRegistros: resultado.totalRegistros,
      totalPaginas: resultado.totalPaginas,
      filtroUsado: resultado.filtroUsado,
      paginasLidas: resultado.paginasLidas,
      competencias: resultado.competencias,
      truncado: resultado.truncado,
      enriquecidos: resultado.enriquecidos,
      paginasMF: resultado.paginasMF,
      truncadoMF: resultado.truncadoMF,
      faturamentoOmie,
      nfsVenda,
      contas: resultado.contas,
      ...(debug ? { amostraBruta: resultado.amostraBruta } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Omie.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
