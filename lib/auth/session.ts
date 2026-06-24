/**
 * Helpers de sessão para rotas de API e Server Components — SOMENTE SERVIDOR.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { usuarioPorToken, UsuarioSessao } from "./db";
import { Perfil, ehAdmin, podeEditar } from "./roles";

export const COOKIE_SESSAO = "cinexpan_sessao";
export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 dias (em segundos)

/** Usuário autenticado a partir do cookie (ou null). */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const token = cookies().get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  return usuarioPorToken(token);
}

/**
 * Garante sessão válida em rotas de API. Retorna o usuário OU um NextResponse
 * de erro — o chamador deve fazer: `if (r instanceof NextResponse) return r;`
 */
export async function exigirSessao(): Promise<UsuarioSessao | NextResponse> {
  const u = await usuarioAtual();
  if (!u) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }
  return u;
}

/** Garante sessão + perfil com permissão de escrita (Administrador/Gestor). */
export async function exigirEdicao(): Promise<UsuarioSessao | NextResponse> {
  const r = await exigirSessao();
  if (r instanceof NextResponse) return r;
  if (!podeEditar(r.perfil)) {
    return NextResponse.json(
      { ok: false, erro: "Seu perfil não tem permissão para esta ação." },
      { status: 403 }
    );
  }
  return r;
}

/** Garante sessão + perfil Administrador. */
export async function exigirAdmin(): Promise<UsuarioSessao | NextResponse> {
  const r = await exigirSessao();
  if (r instanceof NextResponse) return r;
  if (!ehAdmin(r.perfil)) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a administradores." },
      { status: 403 }
    );
  }
  return r;
}

export type { UsuarioSessao };
export type { Perfil };
