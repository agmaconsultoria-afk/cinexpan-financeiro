/**
 * Persistência de usuários e sessões (SOMENTE SERVIDOR) — PostgreSQL.
 *
 * Reutiliza a mesma DATABASE_URL do módulo de Rastreio. Cria o schema na
 * primeira chamada e semeia um administrador inicial se não houver nenhum.
 */
import { Pool } from "pg";
import { hashSenha, verificarSenha, novoToken } from "./crypto";
import { Perfil, ehPerfilValido } from "./roles";

// Administrador inicial (criado uma única vez se a tabela estiver vazia).
// Troque a senha pelo portal após o primeiro acesso.
const ADMIN_EMAIL_SEED = "admin@cinexpan.com.br";
const ADMIN_SENHA_SEED = "Cinexpan@2026";
const ADMIN_NOME_SEED = "Administrador";

const SESSAO_DIAS = 7; // validade da sessão

// ----- Pool (singleton, sobrevive ao hot-reload) -----
const globalForPg = globalThis as unknown as { _cinexpanAuthPool?: Pool };

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não configurada. Defina a conexão do PostgreSQL no arquivo .env.local."
    );
  }
  if (!globalForPg._cinexpanAuthPool) {
    globalForPg._cinexpanAuthPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPg._cinexpanAuthPool;
}

// ----- Schema (executa uma vez por processo) -----
const globalForSchema = globalThis as unknown as { _cinexpanAuthSchema?: Promise<void> };

function ensureSchema(): Promise<void> {
  if (!globalForSchema._cinexpanAuthSchema) {
    globalForSchema._cinexpanAuthSchema = criarSchema();
  }
  return globalForSchema._cinexpanAuthSchema;
}

async function criarSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_usuarios (
      id            SERIAL PRIMARY KEY,
      nome          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      senha_hash    TEXT NOT NULL,
      perfil        TEXT NOT NULL DEFAULT 'Operador',
      ativo         BOOLEAN NOT NULL DEFAULT true,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultimo_acesso TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS auth_sessoes (
      token       TEXT PRIMARY KEY,
      usuario_id  INTEGER NOT NULL REFERENCES auth_usuarios(id) ON DELETE CASCADE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira_em   TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessoes_usuario ON auth_sessoes (usuario_id);
  `);

  // Semeia o admin inicial se ainda não houver nenhum usuário.
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM auth_usuarios"
  );
  if (Number(rows[0]?.n ?? 0) === 0) {
    await pool.query(
      `INSERT INTO auth_usuarios (nome, email, senha_hash, perfil, ativo)
       VALUES ($1, $2, $3, 'Administrador', true)`,
      [ADMIN_NOME_SEED, ADMIN_EMAIL_SEED, hashSenha(ADMIN_SENHA_SEED)]
    );
    // eslint-disable-next-line no-console
    console.log(
      `[auth] Administrador inicial criado: ${ADMIN_EMAIL_SEED} / ${ADMIN_SENHA_SEED} (troque a senha após o primeiro acesso).`
    );
  }
}

// ----- Tipos -----
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
}

function normalizarPerfil(v: string): Perfil {
  return ehPerfilValido(v) ? v : "Operador";
}

// ----- Autenticação -----

/** Valida email + senha. Retorna o usuário (sessão) ou null. */
export async function autenticar(
  email: string,
  senha: string
): Promise<UsuarioSessao | null> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    nome: string;
    email: string;
    senha_hash: string;
    perfil: string;
    ativo: boolean;
  }>(
    "SELECT id, nome, email, senha_hash, perfil, ativo FROM auth_usuarios WHERE lower(email) = lower($1)",
    [email.trim()]
  );
  const u = rows[0];
  if (!u || !u.ativo) return null;
  if (!verificarSenha(senha, u.senha_hash)) return null;
  await pool.query("UPDATE auth_usuarios SET ultimo_acesso = now() WHERE id = $1", [u.id]);
  return { id: u.id, nome: u.nome, email: u.email, perfil: normalizarPerfil(u.perfil) };
}

// ----- Sessões -----

/** Cria uma sessão e devolve o token. */
export async function criarSessao(usuarioId: number): Promise<string> {
  await ensureSchema();
  const pool = getPool();
  const token = novoToken();
  await pool.query(
    `INSERT INTO auth_sessoes (token, usuario_id, expira_em)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, usuarioId, String(SESSAO_DIAS)]
  );
  return token;
}

/** Resolve o usuário a partir do token de sessão (valida expiração). */
export async function usuarioPorToken(token: string): Promise<UsuarioSessao | null> {
  if (!token) return null;
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    nome: string;
    email: string;
    perfil: string;
    ativo: boolean;
  }>(
    `SELECT u.id, u.nome, u.email, u.perfil, u.ativo
     FROM auth_sessoes s
     JOIN auth_usuarios u ON u.id = s.usuario_id
     WHERE s.token = $1 AND s.expira_em > now()`,
    [token]
  );
  const u = rows[0];
  if (!u || !u.ativo) return null;
  return { id: u.id, nome: u.nome, email: u.email, perfil: normalizarPerfil(u.perfil) };
}

/** Remove uma sessão (logout). */
export async function removerSessao(token: string): Promise<void> {
  if (!token) return;
  await ensureSchema();
  await getPool().query("DELETE FROM auth_sessoes WHERE token = $1", [token]);
}

// ----- CRUD de usuários (admin) -----

export async function listarUsuarios(): Promise<Usuario[]> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    nome: string;
    email: string;
    perfil: string;
    ativo: boolean;
    criado_em: Date;
    ultimo_acesso: Date | null;
  }>(
    `SELECT id, nome, email, perfil, ativo, criado_em, ultimo_acesso
     FROM auth_usuarios ORDER BY nome ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: normalizarPerfil(r.perfil),
    ativo: r.ativo,
    criadoEm: r.criado_em instanceof Date ? r.criado_em.toISOString() : String(r.criado_em),
    ultimoAcesso:
      r.ultimo_acesso instanceof Date
        ? r.ultimo_acesso.toISOString()
        : r.ultimo_acesso
        ? String(r.ultimo_acesso)
        : null,
  }));
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}): Promise<Usuario> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query<{ id: number; criado_em: Date }>(
    `INSERT INTO auth_usuarios (nome, email, senha_hash, perfil, ativo)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, criado_em`,
    [dados.nome.trim(), dados.email.trim(), hashSenha(dados.senha), dados.perfil]
  );
  return {
    id: rows[0].id,
    nome: dados.nome.trim(),
    email: dados.email.trim(),
    perfil: dados.perfil,
    ativo: true,
    criadoEm: rows[0].criado_em.toISOString(),
    ultimoAcesso: null,
  };
}

export async function atualizarUsuario(
  id: number,
  dados: { nome?: string; email?: string; perfil?: Perfil; ativo?: boolean; senha?: string }
): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (dados.nome !== undefined) {
    sets.push(`nome = $${i++}`);
    vals.push(dados.nome.trim());
  }
  if (dados.email !== undefined) {
    sets.push(`email = $${i++}`);
    vals.push(dados.email.trim());
  }
  if (dados.perfil !== undefined) {
    sets.push(`perfil = $${i++}`);
    vals.push(dados.perfil);
  }
  if (dados.ativo !== undefined) {
    sets.push(`ativo = $${i++}`);
    vals.push(dados.ativo);
  }
  if (dados.senha) {
    sets.push(`senha_hash = $${i++}`);
    vals.push(hashSenha(dados.senha));
  }
  if (sets.length === 0) return;
  vals.push(id);
  await pool.query(`UPDATE auth_usuarios SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function removerUsuario(id: number): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM auth_usuarios WHERE id = $1", [id]);
}

/** Conta quantos administradores ATIVOS existem (para não remover o último). */
export async function totalAdminsAtivos(): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ n: string }>(
    "SELECT count(*)::text AS n FROM auth_usuarios WHERE perfil = 'Administrador' AND ativo = true"
  );
  return Number(rows[0]?.n ?? 0);
}
