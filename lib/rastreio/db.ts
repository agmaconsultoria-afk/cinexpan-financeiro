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
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
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
  // Migração: adiciona coluna faturamento_omie se ainda não existir
  await pool.query(`
    ALTER TABLE rastreio_faturamento ADD COLUMN IF NOT EXISTS faturamento_omie NUMERIC;
  `);
  // Histórico de processamentos Omie
  await pool.query(`
    CREATE TABLE IF NOT EXISTS omie_historico_processamento (
      id             SERIAL PRIMARY KEY,
      mes            TEXT NOT NULL,
      total_nfs      INTEGER NOT NULL DEFAULT 0,
      total_faturado NUMERIC NOT NULL DEFAULT 0,
      processado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Snapshot da posição de estoque por competência (base para análise
  // Estoque × Venda: giro de estoque, custo médio). Um snapshot por mês
  // (o último "Executar" substitui o anterior). Trava o custo histórico.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estoque_posicao (
      competencia   TEXT PRIMARY KEY,
      data_posicao  TEXT NOT NULL,
      periodo       TEXT,
      total_itens   INTEGER NOT NULL DEFAULT 0,
      total_cmc     NUMERIC NOT NULL DEFAULT 0,
      itens         JSONB NOT NULL DEFAULT '[]'::jsonb,
      gerado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Análise de venda do mês (giro a custo e a preço de venda): CMV, vendas e o
  // estoque avaliado a custo e a preço de venda, por competência.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estoque_analise (
      competencia          TEXT PRIMARY KEY,
      cmv                  NUMERIC NOT NULL DEFAULT 0,
      vendas               NUMERIC NOT NULL DEFAULT 0,
      estoque_custo        NUMERIC NOT NULL DEFAULT 0,
      estoque_preco_venda  NUMERIC NOT NULL DEFAULT 0,
      total_nfs            INTEGER NOT NULL DEFAULT 0,
      gerado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Quantidades em volume (m³) p/ a Cobertura = qtde estoque ÷ qtde vendida.
  await pool.query(`ALTER TABLE estoque_analise ADD COLUMN IF NOT EXISTS qtde_estoque NUMERIC NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE estoque_analise ADD COLUMN IF NOT EXISTS qtde_vendida NUMERIC NOT NULL DEFAULT 0;`);

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
  faturamentoOmie: Record<string, number>;
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

  const [fat, pf, fatOmie] = await Promise.all([
    lerMapa("rastreio_faturamento"),
    lerMapa("rastreio_vendas_pf"),
    lerMapaOmie(),
  ]);

  return { contas, competenciasMeta, emitidoEm, faturamento: fat, vendasPF: pf, faturamentoOmie: fatOmie };
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

async function lerMapaOmie(): Promise<Record<string, number>> {
  const pool = getPool();
  const { rows } = await pool.query<{ mes: string; faturamento_omie: string | null }>(
    `SELECT mes, faturamento_omie FROM rastreio_faturamento WHERE faturamento_omie IS NOT NULL`
  );
  const mapa: Record<string, number> = {};
  for (const r of rows) if (r.faturamento_omie !== null) mapa[r.mes] = Number(r.faturamento_omie);
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

export async function setFaturamentoOmie(mes: string, valor: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO rastreio_faturamento (mes, valor, faturamento_omie) VALUES ($1, 0, $2)
     ON CONFLICT (mes) DO UPDATE SET faturamento_omie = EXCLUDED.faturamento_omie`,
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

// ----- Histórico de processamentos Omie -----

export interface HistoricoProcessamento {
  id: number;
  mes: string;
  totalNFs: number;
  totalFaturado: number;
  processadoEm: string;
}

export async function gravarHistoricoOmie(
  mes: string,
  totalNFs: number,
  totalFaturado: number
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO omie_historico_processamento (mes, total_nfs, total_faturado)
     VALUES ($1, $2, $3)`,
    [mes, totalNFs, totalFaturado]
  );
}

export async function limparHistoricoOmie(): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM omie_historico_processamento");
}

// ----- Snapshot da Posição de Estoque (Estoque × Venda / giro / custo médio) -----

/** Item de estoque gravado no snapshot (mesma forma de PosicaoEstoqueItem). */
export interface EstoquePosicaoItem {
  codigo: string;
  descricao: string;
  ncm: string;
  tipoSped: string;
  familia: string;
  unidade: string;
  quantidade: number;
  cmcUnitario: number;
  cmcTotal: number;
}

export interface EstoquePosicaoResumo {
  competencia: string;
  dataPosicao: string;
  periodo: string | null;
  totalItens: number;
  totalCmc: number;
  geradoEm: string;
}

export interface EstoquePosicaoSnapshot extends EstoquePosicaoResumo {
  itens: EstoquePosicaoItem[];
}

/** Grava (substitui) o snapshot da posição de estoque de uma competência. */
export async function salvarPosicaoEstoque(
  competencia: string,
  dataPosicao: string,
  periodo: string | null,
  itens: EstoquePosicaoItem[]
): Promise<void> {
  await ensureSchema();
  const totalCmc = itens.reduce((s, i) => s + (Number(i.cmcTotal) || 0), 0);
  await getPool().query(
    `INSERT INTO estoque_posicao (competencia, data_posicao, periodo, total_itens, total_cmc, itens, gerado_em)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (competencia)
     DO UPDATE SET data_posicao = EXCLUDED.data_posicao,
                   periodo = EXCLUDED.periodo,
                   total_itens = EXCLUDED.total_itens,
                   total_cmc = EXCLUDED.total_cmc,
                   itens = EXCLUDED.itens,
                   gerado_em = now()`,
    [competencia, dataPosicao, periodo, itens.length, totalCmc, JSON.stringify(itens)]
  );
}

/** Lista os snapshots salvos (resumo, sem os itens) — mais recente por competência. */
export async function listarPosicoesEstoque(): Promise<EstoquePosicaoResumo[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    competencia: string;
    data_posicao: string;
    periodo: string | null;
    total_itens: number;
    total_cmc: string;
    gerado_em: Date;
  }>(
    `SELECT competencia, data_posicao, periodo, total_itens, total_cmc, gerado_em
     FROM estoque_posicao ORDER BY competencia ASC`
  );
  return rows.map((r) => ({
    competencia: r.competencia,
    dataPosicao: r.data_posicao,
    periodo: r.periodo,
    totalItens: Number(r.total_itens),
    totalCmc: Number(r.total_cmc),
    geradoEm: r.gerado_em instanceof Date ? r.gerado_em.toISOString() : String(r.gerado_em),
  }));
}

/** Lê o snapshot completo (com itens) de uma competência. */
export async function lerPosicaoEstoque(competencia: string): Promise<EstoquePosicaoSnapshot | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    competencia: string;
    data_posicao: string;
    periodo: string | null;
    total_itens: number;
    total_cmc: string;
    itens: EstoquePosicaoItem[];
    gerado_em: Date;
  }>(
    `SELECT competencia, data_posicao, periodo, total_itens, total_cmc, itens, gerado_em
     FROM estoque_posicao WHERE competencia = $1`,
    [competencia]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    competencia: r.competencia,
    dataPosicao: r.data_posicao,
    periodo: r.periodo,
    totalItens: Number(r.total_itens),
    totalCmc: Number(r.total_cmc),
    geradoEm: r.gerado_em instanceof Date ? r.gerado_em.toISOString() : String(r.gerado_em),
    itens: r.itens ?? [],
  };
}

// ----- Análise de venda do mês (giro a custo / a preço de venda) -----

export interface AnaliseEstoqueMes {
  competencia: string;
  cmv: number;
  vendas: number;
  estoqueCusto: number;
  estoquePrecoVenda: number;
  qtdeEstoque: number; // volume (m³) de argila em estoque
  qtdeVendida: number; // volume (m³) de argila vendida no mês
  totalNFs: number;
  geradoEm: string;
}

export async function salvarAnaliseEstoque(a: Omit<AnaliseEstoqueMes, "geradoEm">): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO estoque_analise
       (competencia, cmv, vendas, estoque_custo, estoque_preco_venda, qtde_estoque, qtde_vendida, total_nfs, gerado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (competencia)
     DO UPDATE SET cmv = EXCLUDED.cmv,
                   vendas = EXCLUDED.vendas,
                   estoque_custo = EXCLUDED.estoque_custo,
                   estoque_preco_venda = EXCLUDED.estoque_preco_venda,
                   qtde_estoque = EXCLUDED.qtde_estoque,
                   qtde_vendida = EXCLUDED.qtde_vendida,
                   total_nfs = EXCLUDED.total_nfs,
                   gerado_em = now()`,
    [a.competencia, a.cmv, a.vendas, a.estoqueCusto, a.estoquePrecoVenda, a.qtdeEstoque, a.qtdeVendida, a.totalNFs]
  );
}

export async function listarAnalisesEstoque(): Promise<AnaliseEstoqueMes[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    competencia: string;
    cmv: string;
    vendas: string;
    estoque_custo: string;
    estoque_preco_venda: string;
    qtde_estoque: string;
    qtde_vendida: string;
    total_nfs: number;
    gerado_em: Date;
  }>(
    `SELECT competencia, cmv, vendas, estoque_custo, estoque_preco_venda, qtde_estoque, qtde_vendida, total_nfs, gerado_em
     FROM estoque_analise ORDER BY competencia ASC`
  );
  return rows.map((r) => ({
    competencia: r.competencia,
    cmv: Number(r.cmv),
    vendas: Number(r.vendas),
    estoqueCusto: Number(r.estoque_custo),
    estoquePrecoVenda: Number(r.estoque_preco_venda),
    qtdeEstoque: Number(r.qtde_estoque),
    qtdeVendida: Number(r.qtde_vendida),
    totalNFs: Number(r.total_nfs),
    geradoEm: r.gerado_em instanceof Date ? r.gerado_em.toISOString() : String(r.gerado_em),
  }));
}

export async function lerHistoricoOmie(limite = 50): Promise<HistoricoProcessamento[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{
    id: number;
    mes: string;
    total_nfs: number;
    total_faturado: string;
    processado_em: Date;
  }>(
    `SELECT id, mes, total_nfs, total_faturado, processado_em
     FROM omie_historico_processamento
     ORDER BY processado_em DESC
     LIMIT $1`,
    [limite]
  );
  return rows.map((r) => ({
    id: r.id,
    mes: r.mes,
    totalNFs: Number(r.total_nfs),
    totalFaturado: Number(r.total_faturado),
    processadoEm: r.processado_em instanceof Date ? r.processado_em.toISOString() : String(r.processado_em),
  }));
}
