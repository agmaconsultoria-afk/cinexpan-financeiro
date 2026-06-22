import { NextRequest, NextResponse } from "next/server";
import { lerCredenciais, listarContasReceber } from "@/lib/rastreio/omie-client";

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
  const dataDe = searchParams.get("de") ?? undefined;
  const dataAte = searchParams.get("ate") ?? undefined;
  const debug = searchParams.get("debug") === "1";

  try {
    const resultado = await listarContasReceber(cred, { dataDe, dataAte, debug });
    return NextResponse.json({
      ok: true,
      emitidoEm: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
      totalRegistros: resultado.totalRegistros,
      totalPaginas: resultado.totalPaginas,
      contas: resultado.contas,
      ...(debug ? { amostraBruta: resultado.amostraBruta } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Omie.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
