import { NextResponse } from "next/server";
import { lerCredenciais, atualizarCacheClientes } from "@/lib/rastreio/omie-client";
import { reaplicarNomesClientes, diagnosticoClientes } from "@/lib/rastreio/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/rastreio/clientes — diagnóstico do cache de clientes. */
export async function GET() {
  const diag = await diagnosticoClientes();
  return NextResponse.json({ ok: true, ...diag });
}

/**
 * POST /api/rastreio/clientes — carrega o cadastro de clientes do Omie para o
 * cache e reaplica os nomes em todo o histórico já gravado.
 */
export async function POST() {
  const cred = lerCredenciais();
  if (!cred) {
    return NextResponse.json(
      { ok: false, erro: "Credenciais do Omie não configuradas (.env.local)." },
      { status: 400 }
    );
  }
  try {
    const { total } = await atualizarCacheClientes(cred);
    const atualizados = await reaplicarNomesClientes();
    return NextResponse.json({ ok: true, total, atualizados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar clientes.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
