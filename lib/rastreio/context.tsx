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

type Fonte = "exemplo" | "banco";

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
  faturamentoOmie: FaturamentoMensal;
  setFaturamentoOmieMes: (mes: string, valor: number) => void;
  carregarDoBanco: () => Promise<void>;
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
  const [faturamentoOmie, setFaturamentoOmieState] = useState<FaturamentoMensal>({});

  // Carrega o histórico acumulado da base (servidor).
  const carregarDoBanco = useCallback(async () => {
    try {
      const resp = await fetch("/api/rastreio/dados", { cache: "no-store" });
      const dados = await resp.json();
      if (dados?.ok) {
        if (dados.faturamento) setFaturamento(dados.faturamento);
        if (dados.vendasPF) setVendasPF(dados.vendasPF);
        if (dados.faturamentoOmie) setFaturamentoOmieState(dados.faturamentoOmie);
        if (Array.isArray(dados.contas) && dados.contas.length > 0) {
          setContasRaw(dados.contas);
          setEmitidoEm(dados.emitidoEm ?? null);
          setFonte("banco");
          return;
        }
      }
    } catch {
      /* sem base disponível — cai no exemplo */
    }
    // Base vazia → dados de exemplo (até a primeira sincronização)
    setContasRaw(gerarContasExemplo());
    setFonte("exemplo");
  }, []);

  useEffect(() => {
    carregarDoBanco().finally(() => setCarregado(true));
  }, [carregarDoBanco]);

  const contas = useMemo(() => derivarTodas(contasRaw), [contasRaw]);
  const competencias = useMemo(() => competenciasDisponiveis(contas), [contas]);

  // Seleção padrão de competência: a mais recente com faturamento lançado, ou a última.
  useEffect(() => {
    if (competencias.length === 0) return;
    if (competencia && competencias.includes(competencia)) return;
    const comFat = competencias.filter((c) => (faturamento[c] ?? 0) > 0);
    setCompetencia(comFat.length ? comFat[comFat.length - 1] : competencias[competencias.length - 1]);
  }, [competencias, competencia, faturamento]);

  const voltarParaExemplo = useCallback(() => {
    setContasRaw(gerarContasExemplo());
    setFonte("exemplo");
    setEmitidoEm(null);
  }, []);

  // Grava faturamento/vendas PF: atualiza a tela e persiste na base do servidor.
  const setFaturamentoMes = useCallback((mes: string, valor: number) => {
    setFaturamento((prev) => ({ ...prev, [mes]: valor }));
    fetch("/api/rastreio/faturamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, faturamento: valor }),
    }).catch(() => {});
  }, []);

  const setVendasPFMes = useCallback((mes: string, valor: number) => {
    setVendasPF((prev) => ({ ...prev, [mes]: valor }));
    fetch("/api/rastreio/faturamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, vendasPF: valor }),
    }).catch(() => {});
  }, []);

  const setFaturamentoOmieMes = useCallback((mes: string, valor: number) => {
    setFaturamentoOmieState((prev) => ({ ...prev, [mes]: valor }));
    fetch("/api/rastreio/faturamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, faturamentoOmie: valor }),
    }).catch(() => {});
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
    faturamentoOmie,
    setFaturamentoOmieMes,
    carregarDoBanco,
    voltarParaExemplo,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRastreio(): RastreioContextValor {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRastreio deve ser usado dentro de <RastreioProvider>");
  return ctx;
}
