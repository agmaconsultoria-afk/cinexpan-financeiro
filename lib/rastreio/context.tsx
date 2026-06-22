"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ContaDerivada, ContaReceber, FaturamentoMensal, Visao } from "./types";
import { derivarTodas, competenciasDisponiveis } from "./logic";
import { gerarContasExemplo } from "./sample";
import { FATURAMENTO_SEED, VENDAS_PF_SEED } from "./faturamento";

const KEY_CONTAS = "cinexpan:rastreio:contas";
const KEY_FONTE = "cinexpan:rastreio:fonte";
const KEY_FAT = "cinexpan:rastreio:faturamento";
const KEY_PF = "cinexpan:rastreio:vendaspf";
const KEY_EMITIDO = "cinexpan:rastreio:emitido";

type Fonte = "exemplo" | "bd";

interface RastreioContextValor {
  contas: ContaDerivada[];
  fonte: Fonte;
  carregado: boolean;
  emitidoEm: string | null;
  competencias: string[];
  competencia: string;
  setCompetencia: (c: string) => void;
  visao: Visao;
  setVisao: (v: Visao) => void;
  faturamento: FaturamentoMensal;
  setFaturamentoMes: (mes: string, valor: number) => void;
  vendasPF: FaturamentoMensal;
  setVendasPFMes: (mes: string, valor: number) => void;
  importarContas: (contas: ContaReceber[], emitidoEm: string | null) => void;
  voltarParaExemplo: () => void;
}

const Ctx = createContext<RastreioContextValor | null>(null);

export function RastreioProvider({ children }: { children: React.ReactNode }) {
  const [contasRaw, setContasRaw] = useState<ContaReceber[]>([]);
  const [fonte, setFonte] = useState<Fonte>("exemplo");
  const [carregado, setCarregado] = useState(false);
  const [emitidoEm, setEmitidoEm] = useState<string | null>(null);
  const [competencia, setCompetencia] = useState("");
  const [visao, setVisao] = useState<Visao>("Recebimento");
  const [faturamento, setFaturamento] = useState<FaturamentoMensal>(FATURAMENTO_SEED);
  const [vendasPF, setVendasPF] = useState<FaturamentoMensal>(VENDAS_PF_SEED);

  // Carregamento inicial
  useEffect(() => {
    try {
      const fat = localStorage.getItem(KEY_FAT);
      if (fat) setFaturamento(JSON.parse(fat));
      const pf = localStorage.getItem(KEY_PF);
      if (pf) setVendasPF(JSON.parse(pf));

      const fonteSalva = localStorage.getItem(KEY_FONTE) as Fonte | null;
      const contasSalvas = localStorage.getItem(KEY_CONTAS);
      if (fonteSalva === "bd" && contasSalvas) {
        const parsed = JSON.parse(contasSalvas) as ContaReceber[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContasRaw(parsed);
          setFonte("bd");
          setEmitidoEm(localStorage.getItem(KEY_EMITIDO));
          setCarregado(true);
          return;
        }
      }
    } catch {
      /* ignora */
    }
    setContasRaw(gerarContasExemplo());
    setFonte("exemplo");
    setCarregado(true);
  }, []);

  const contas = useMemo(() => derivarTodas(contasRaw), [contasRaw]);
  const competencias = useMemo(() => competenciasDisponiveis(contas), [contas]);

  // Seleção padrão de competência: a mais recente com faturamento lançado, ou a última.
  useEffect(() => {
    if (competencias.length === 0) return;
    if (competencia && competencias.includes(competencia)) return;
    const comFat = competencias.filter((c) => (faturamento[c] ?? 0) > 0);
    setCompetencia(comFat.length ? comFat[comFat.length - 1] : competencias[competencias.length - 1]);
  }, [competencias, competencia, faturamento]);

  const importarContas = useCallback((novas: ContaReceber[], emitido: string | null) => {
    setContasRaw(novas);
    setFonte("bd");
    setEmitidoEm(emitido);
    try {
      localStorage.setItem(KEY_CONTAS, JSON.stringify(novas));
      localStorage.setItem(KEY_FONTE, "bd");
      if (emitido) localStorage.setItem(KEY_EMITIDO, emitido);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const voltarParaExemplo = useCallback(() => {
    setContasRaw(gerarContasExemplo());
    setFonte("exemplo");
    setEmitidoEm(null);
    try {
      localStorage.removeItem(KEY_CONTAS);
      localStorage.removeItem(KEY_FONTE);
      localStorage.removeItem(KEY_EMITIDO);
    } catch {
      /* ignora */
    }
  }, []);

  const setFaturamentoMes = useCallback((mes: string, valor: number) => {
    setFaturamento((prev) => {
      const novo = { ...prev, [mes]: valor };
      try {
        localStorage.setItem(KEY_FAT, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  }, []);

  const setVendasPFMes = useCallback((mes: string, valor: number) => {
    setVendasPF((prev) => {
      const novo = { ...prev, [mes]: valor };
      try {
        localStorage.setItem(KEY_PF, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  }, []);

  const valor: RastreioContextValor = {
    contas,
    fonte,
    carregado,
    emitidoEm,
    competencias,
    competencia,
    setCompetencia,
    visao,
    setVisao,
    faturamento,
    setFaturamentoMes,
    vendasPF,
    setVendasPFMes,
    importarContas,
    voltarParaExemplo,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRastreio(): RastreioContextValor {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRastreio deve ser usado dentro de <RastreioProvider>");
  return ctx;
}
