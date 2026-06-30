import { NextRequest, NextResponse } from "next/server";
import { lerCredenciais, listarNotasFiscais } from "@/lib/rastreio/omie-client";
import { exigirEdicao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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

  try {
    const resultado = await listarNotasFiscais(cred, { dataDe, dataAte });
    return NextResponse.json({
      ok: true,
      totalNFs: resultado.totalNFs,
      truncado: resultado.truncado,
      itens: resultado.itens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao consultar NFs.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
