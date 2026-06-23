// Base de dados do Rastreio (SOMENTE SERVIDOR) — PostgreSQL.
//
// Persiste em PostgreSQL via `pg`. Cada sincronização grava a competência aqui,
// formando o histórico; o app lê daqui sem precisar re-sincronizar o passado.
//
// A conexão vem de DATABASE_URL (.env.local), ex.:
//   DATABASE_URL=postgresql://cinexpan:senha@localhost:5432/cinexpan_financeiro
//
// O schema é criado automaticamente na primeira chamada (ensureSchema). Se uma
// base de arquivo antiga (data/rastreio.json) existir e o banco estiver vazio,
// os dados são importados uma única vez (migração transparente do JSON).

import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { ContaReceber } from "./types";
import { FATURAMENTO_SEED, VENDAS_PF_SEED } from "./faturamento";

// ----- Pool de conexões (singleton, sobrevive ao hot-reload do Next) -----
const globalForPg = globalThis as unknown as { _cinexpanPgPool?: Pool };

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não configurada. Defina a conexão do PostgreSQL no arquivo .env.local."
    );
  }
  if (!globalForPg._cinexpanPgPool) {
    globalForPg._cinexpanPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPg._cinexpanPgPool;
}

// ----- Garantia de schema (executa uma vez por processo) -----
const globalForSchema = globalThis as unknown as { _cinexpanSchemaPronto?: Promise<void> };

function ensureSchema(): Promise<void> {
  if (!globalForSchema._cinexpanSchemaPronto) {
    globalForSchema._cinexpanSchemaPronto = criarSchema();
  }
  return globalForSchema._cinexpanSchemaPronto;
}

async function criarSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rastreio_competencias (
      competencia      TEXT PRIMARY KEY,
      emitido_em       TEXT,
      sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
      contas           JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE IF NOT EXISTS rastreio_faturamento (
      mes    TEXT PRIMARY KEY,
      valor  NUMERIC NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS rastreio_vendas_pf (
      mes    TEXT PRIMARY KEY,
      valor  NUMERIC NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS rastreio_clientes (
      codigo  TEXT PRIMARY KEY,
      nome    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rastreio_meta (
      chave  TEXT PRIMARY KEY,
      valor  TEXT
    );
  `);

  // Seeds de faturamento/vendas PF (uma vez; nunca sobrescreve edições).
  await semearMapa("rastreio_faturamento", FATURAMENTO_SEED);
  await semearMapa("rastreio_vendas_pf", VENDAS_PF_SEED);

  // Migração transparente do arquivo JSON antigo (se houver e o banco vazio).
  await importarJsonLegado();
}

async function semearMapa(tabela: string, mapa: Record<string, number>): Promise<void> {
  const pool = getPool();
  const entradas = Object.entries(mapa);
  if (entradas.length === 0) return;
  for (const [mes, valor] of entradas) {
    await pool.query(
      `INSERT INTO ${tabela} (mes, valor) VALUES ($1, $2) ON CONFLICT (mes) DO NOTHING`,
      [mes, valor]
    );
  }
}

/** Importa data/rastreio.json (formato antigo) se o banco ainda não tem competências. */
async function importarJsonLegado(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM rastreio_competencias"
  );
  if (Number(rows[0]?.n ?? 0) > 0) return; // já tem dados, não importa

  const arquivo = path.join(process.cwd(), "data", "rastreio.json");
  let txt: string;
  try {
    txt = fs.readFileSync(arquivo, "utf8");
  } catch {
    return; // sem arquivo antigo, nada a importar
  }

  try {
    const s = JSON.parse(txt) as {
      competencias?: Record<
        string,
        { contas: ContaReceber[]; emitidoEm: string | null; sincronizadoEm?: string }
      >;
      faturamento?: Record<string, number>;
      vendasPF?: Record<string, number>;
      clientes?: Record<string, string>;
      clientesAtualizadoEm?: string;
    };

    for (const [comp, v] of Object.entries(s.competencias ?? {})) {
      await pool.query(
        `INSERT INTO rastreio_competencias (competencia, emitido_em, sincronizado_em, contas)
         VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4::jsonb)
         ON CONFLICT (competencia) DO NOTHING`,
        [comp, v.emitidoEm ?? null, v.sincronizadoEm ?? null, JSON.stringify(v.contas ?? [])]
      );
    }
    for (const [mes, valor] of Object.entries(s.faturamento ?? {})) {
      await pool.query(
        `INSERT INTO rastreio_faturamento (mes, valor) VALUES ($1, $2)
         ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor`,
        [mes, valor]
      );
    }
    for (const [mes, valor] of Object.entries(s.vendasPF ?? {})) {
      await pool.query(
        `INSERT INTO rastreio_vendas_pf (mes, valor) VALUES ($1, $2)
         ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor`,
        [mes, valor]
      );
    }
    const clientes = s.clientes ?? {};
    if (Object.keys(clientes).length > 0) {
      await mergeClientesInterno(clientes, s.clientesAtualizadoEm);
    }
    // eslint-disable-next-line no-console
    console.log("[db] Histórico antigo (data/rastreio.json) importado para o PostgreSQL.");
  } catch {
    // Arquivo corrompido/incompatível: ignora e segue com banco vazio.
  }
}

// ----- Tipos expostos -----
export interface MetaCompetencia {
  competencia: string;
  total: number;
  sincronizadoEm: string;
}

export interface DadosArmazenados {
  contas: ContaReceber[];
  competenciasMeta: MetaCompetencia[];
  emitidoEm: string | null;
  faturamento: Record<string, number>;
  vendasPF: Record<string, number>;
}

// ----- API de dados -----

/** Grava (substitui) as contas de uma competência e registra o horário. */
export async function salvarCompetencia(
  competencia: string,
  contas: ContaReceber[],
  emitidoEm: string | null
): Promise<void> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO rastreio_competencias (competencia, emitido_em, sincronizado_em, contas)
     VALUES ($1, $2, now(), $3::jsonb)
     ON CONFLICT (competencia)
     DO UPDATE SET emitido_em = EXCLUDED.emitido_em,
                   sincronizado_em = EXCLUDED.sincronizado_em,
                   contas = EXCLUDED.contas`,
    [competencia, emitidoEm, JSON.stringify(contas)]
  );
}

/** Lê todo o histórico acumulado (todas as competências) + configuração. */
export async function lerTudo(): Promise<DadosArmazenados> {
  await ensureSchema();
  const pool = getPool();

  const comp = await pool.query<{
    competencia: string;
    emitido_em: string | null;
    sincronizado_em: Date;
    contas: ContaReceber[];
  }>(
    `SELECT competencia, emitido_em, sincronizado_em, contas
     FROM rastreio_competencias ORDER BY competencia ASC`
  );

  const contas = comp.rows.flatMap((r) => r.contas ?? []);
  const competenciasMeta: MetaCompetencia[] = comp.rows.map((r) => ({
    competencia: r.competencia,
    total: (r.contas ?? []).length,
    sincronizadoEm:
      r.sincronizado_em instanceof Date
        ? r.sincronizado_em.toISOString()
        : String(r.sincronizado_em),
  }));
  const emitidoEm = comp.rows.map((r) => r.emitido_em).filter(Boolean).slice(-1)[0] ?? null;

  const [fat, pf] = await Promise.all([
    lerMapa("rastreio_faturamento"),
    lerMapa("rastreio_vendas_pf"),
  ]);

  return { contas, competenciasMeta, emitidoEm, faturamento: fat, vendasPF: pf };
}

async function lerMapa(tabela: string): Promise<Record<string, number>> {
  const pool = getPool();
  const { rows } = await pool.query<{ mes: string; valor: string }>(
    `SELECT mes, valor FROM ${tabela}`
  );
  const mapa: Record<string, number> = {};
  for (const r of rows) mapa[r.mes] = Number(r.valor);
  return mapa;
}

export async function setFaturamento(mes: string, valor: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO rastreio_faturamento (mes, valor) VALUES ($1, $2)
     ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor`,
    [mes, valor]
  );
}

export async function setVendasPF(mes: string, valor: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO rastreio_vendas_pf (mes, valor) VALUES ($1, $2)
     ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor`,
    [mes, valor]
  );
}

/** Cache de nomes de clientes (código -> nome) + quando foi atualizado. */
export async function getClientes(): Promise<{
  map: Record<string, string>;
  atualizadoEm: string | null;
}> {
  await ensureSchema();
  const pool = getPool();
  const [cli, meta] = await Promise.all([
    pool.query<{ codigo: string; nome: string }>("SELECT codigo, nome FROM rastreio_clientes"),
    pool.query<{ valor: string | null }>(
      "SELECT valor FROM rastreio_meta WHERE chave = 'clientes_atualizado_em'"
    ),
  ]);
  const map: Record<string, string> = {};
  for (const r of cli.rows) map[r.codigo] = r.nome;
  return { map, atualizadoEm: meta.rows[0]?.valor ?? null };
}

async function mergeClientesInterno(
  novos: Record<string, string>,
  atualizadoEm?: string
): Promise<void> {
  const pool = getPool();
  const codigos = Object.keys(novos);
  if (codigos.length === 0) return;
  const nomes = codigos.map((c) => novos[c]);

  // Upsert em lote via unnest (rápido mesmo com milhares de clientes).
  await pool.query(
    `INSERT INTO rastreio_clientes (codigo, nome)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome`,
    [codigos, nomes]
  );
  await pool.query(
    `INSERT INTO rastreio_meta (chave, valor) VALUES ('clientes_atualizado_em', $1)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [atualizadoEm ?? new Date().toISOString()]
  );
}

export async function mergeClientes(novos: Record<string, string>): Promise<void> {
  await ensureSchema();
  await mergeClientesInterno(novos);
}

/** Reaplica os nomes de clientes do cache em todo o histórico já gravado. */
export async function reaplicarNomesClientes(): Promise<number> {
  await ensureSchema();
  const pool = getPool();
  const { map: cache } = await getClientes();

  const { rows } = await pool.query<{ competencia: string; contas: ContaReceber[] }>(
    "SELECT competencia, contas FROM rastreio_competencias"
  );

  let total = 0;
  for (const row of rows) {
    const contas = row.contas ?? [];
    let mudou = false;
    for (const c of contas) {
      const cod = c.clienteCodigo;
      if (cod && cache[cod] && c.cliente !== cache[cod]) {
        c.cliente = cache[cod];
        mudou = true;
        total++;
      }
    }
    if (mudou) {
      await pool.query(
        "UPDATE rastreio_competencias SET contas = $2::jsonb WHERE competencia = $1",
        [row.competencia, JSON.stringify(contas)]
      );
    }
  }
  return total;
}

/** Diagnóstico do cache de clientes vs. os códigos presentes nas contas. */
export async function diagnosticoClientes() {
  await ensureSchema();
  const pool = getPool();
  const { map: cache, atualizadoEm } = await getClientes();
  const totalCache = Object.keys(cache).length;

  const { rows } = await pool.query<{ contas: ContaReceber[] }>(
    "SELECT contas FROM rastreio_competencias"
  );

  let totalContas = 0;
  let comCodigo = 0;
  let resolviveis = 0;
  const exemplos: { clienteCodigo: string; clienteAtual: string; noCache: string | null }[] = [];

  for (const row of rows) {
    for (const c of row.contas ?? []) {
      totalContas++;
      if (c.clienteCodigo) {
        comCodigo++;
        if (cache[c.clienteCodigo]) resolviveis++;
        if (exemplos.length < 10) {
          exemplos.push({
            clienteCodigo: c.clienteCodigo,
            clienteAtual: c.cliente,
            noCache: cache[c.clienteCodigo] ?? null,
          });
        }
      }
    }
  }

  const amostraCache = Object.entries(cache)
    .slice(0, 5)
    .map(([codigo, nome]) => ({ codigo, nome }));

  return {
    totalCache,
    atualizadoEm,
    totalContas,
    comCodigo,
    resolviveis,
    exemplos,
    amostraCache,
  };
}
