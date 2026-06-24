import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — dados do usuário autenticado (ou 401). */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, usuario });
}
