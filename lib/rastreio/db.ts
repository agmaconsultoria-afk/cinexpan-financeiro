// Base de dados local do Rastreio (SOMENTE SERVIDOR).
//
// Persiste em arquivo JSON (data/rastreio.json) — zero dependências, funciona
// de imediato. Cada sincronização grava a competência aqui, formando o
// histórico; o app lê daqui sem precisar re-sincronizar o passado.
//
// Em produção/multiusuário, este módulo pode ser trocado por Postgres/SQLite
// mantendo a mesma interface (salvarCompetencia / lerTudo / setFaturamento…).

import fs from "fs";
import path from "path";
import { ContaReceber } from "./types";
import { FATURAMENTO_SEED, VENDAS_PF_SEED } from "./faturamento";

const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "rastreio.json");

interface CompetenciaArmazenada {
  contas: ContaReceber[];
  emitidoEm: string | null;
  sincronizadoEm: string; // ISO
}

interface Store {
  competencias: Record<string, CompetenciaArmazenada>;
  faturamento: Record<string, number>;
  vendasPF: Record<string, number>;
  clientes?: Record<string, string>; // código do cliente -> nome
  clientesAtualizadoEm?: string; // ISO
}

function storeVazio(): Store {
  return {
    competencias: {},
    faturamento: { ...FATURAMENTO_SEED },
    vendasPF: { ...VENDAS_PF_SEED },
  };
}

function ler(): Store {
  try {
    const txt = fs.readFileSync(FILE, "utf8");
    const s = JSON.parse(txt) as Partial<Store>;
    return {
      competencias: s.competencias ?? {},
      faturamento: s.faturamento ?? { ...FATURAMENTO_SEED },
      vendasPF: s.vendasPF ?? { ...VENDAS_PF_SEED },
      clientes: s.clientes ?? {},
      clientesAtualizadoEm: s.clientesAtualizadoEm,
    };
  } catch {
    return storeVazio();
  }
}

function escrever(s: Store): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s));
}

/** Grava (substitui) as contas de uma competência e registra o horário. */
export function salvarCompetencia(
  competencia: string,
  contas: ContaReceber[],
  emitidoEm: string | null
): void {
  const s = ler();
  s.competencias[competencia] = {
    contas,
    emitidoEm,
    sincronizadoEm: new Date().toISOString(),
  };
  escrever(s);
}

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

/** Lê todo o histórico acumulado (todas as competências) + configuração. */
export function lerTudo(): DadosArmazenados {
  const s = ler();
  const entradas = Object.entries(s.competencias).sort(([a], [b]) => a.localeCompare(b));
  const contas = entradas.flatMap(([, v]) => v.contas);
  const competenciasMeta = entradas.map(([k, v]) => ({
    competencia: k,
    total: v.contas.length,
    sincronizadoEm: v.sincronizadoEm,
  }));
  // emitidoEm mais recente entre as competências
  const emitidoEm =
    entradas
      .map(([, v]) => v.emitidoEm)
      .filter(Boolean)
      .slice(-1)[0] ?? null;
  return { contas, competenciasMeta, emitidoEm, faturamento: s.faturamento, vendasPF: s.vendasPF };
}

export function setFaturamento(mes: string, valor: number): void {
  const s = ler();
  s.faturamento[mes] = valor;
  escrever(s);
}

export function setVendasPF(mes: string, valor: number): void {
  const s = ler();
  s.vendasPF[mes] = valor;
  escrever(s);
}

/** Cache de nomes de clientes (código -> nome) + quando foi atualizado. */
export function getClientes(): { map: Record<string, string>; atualizadoEm: string | null } {
  const s = ler();
  return { map: s.clientes ?? {}, atualizadoEm: s.clientesAtualizadoEm ?? null };
}

export function mergeClientes(novos: Record<string, string>): void {
  const s = ler();
  s.clientes = { ...(s.clientes ?? {}), ...novos };
  s.clientesAtualizadoEm = new Date().toISOString();
  escrever(s);
}

/** Reaplica os nomes de clientes do cache em todo o histórico já gravado. */
export function reaplicarNomesClientes(): number {
  const s = ler();
  const cache = s.clientes ?? {};
  let n = 0;
  for (const comp of Object.values(s.competencias)) {
    for (const c of comp.contas) {
      const cod = c.clienteCodigo;
      if (cod && cache[cod] && c.cliente !== cache[cod]) {
        c.cliente = cache[cod];
        n++;
      }
    }
  }
  if (n > 0) escrever(s);
  return n;
}

/** Diagnóstico do cache de clientes vs. os códigos presentes nas contas. */
export function diagnosticoClientes() {
  const s = ler();
  const cache = s.clientes ?? {};
  const totalCache = Object.keys(cache).length;

  let totalContas = 0;
  let comCodigo = 0;
  let resolviveis = 0;
  const exemplos: { clienteCodigo: string; clienteAtual: string; noCache: string | null }[] = [];

  for (const comp of Object.values(s.competencias)) {
    for (const c of comp.contas) {
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

  // Amostra de chaves do cache (para comparar o formato dos códigos)
  const amostraCache = Object.entries(cache)
    .slice(0, 5)
    .map(([codigo, nome]) => ({ codigo, nome }));

  return {
    totalCache,
    atualizadoEm: s.clientesAtualizadoEm ?? null,
    totalContas,
    comCodigo,
    resolviveis,
    exemplos,
    amostraCache,
  };
}
