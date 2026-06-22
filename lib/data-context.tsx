"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Lancamento } from "./types";
import { gerarDadosExemplo } from "./sample-data";
import { mesesDisponiveis } from "./aggregations";

const STORAGE_KEY = "cinexpan:lancamentos";
const STORAGE_FONTE = "cinexpan:fonte";

type Fonte = "exemplo" | "planilha";

interface DataContextValor {
  lancamentos: Lancamento[];
  fonte: Fonte;
  carregado: boolean;
  periodoInicio: string;
  periodoFim: string;
  setPeriodo: (inicio: string, fim: string) => void;
  meses: string[];
  importar: (novos: Lancamento[]) => void;
  limparParaExemplo: () => void;
}

const DataContext = createContext<DataContextValor | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [fonte, setFonte] = useState<Fonte>("exemplo");
  const [carregado, setCarregado] = useState(false);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  // Carrega do localStorage (ou usa dados de exemplo) ao montar.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      const fonteSalva = localStorage.getItem(STORAGE_FONTE) as Fonte | null;
      if (salvo && fonteSalva === "planilha") {
        const parsed = JSON.parse(salvo) as Lancamento[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLancamentos(parsed);
          setFonte("planilha");
          setCarregado(true);
          return;
        }
      }
    } catch {
      // ignora e cai no exemplo
    }
    setLancamentos(gerarDadosExemplo(12));
    setFonte("exemplo");
    setCarregado(true);
  }, []);

  // Ajusta o período selecionado quando os dados mudam.
  const meses = useMemo(() => mesesDisponiveis(lancamentos), [lancamentos]);
  useEffect(() => {
    if (meses.length > 0) {
      setPeriodoInicio(meses[0]);
      setPeriodoFim(meses[meses.length - 1]);
    }
  }, [meses]);

  const importar = useCallback((novos: Lancamento[]) => {
    setLancamentos(novos);
    setFonte("planilha");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novos));
      localStorage.setItem(STORAGE_FONTE, "planilha");
    } catch {
      // armazenamento indisponível — segue apenas em memória
    }
  }, []);

  const limparParaExemplo = useCallback(() => {
    setLancamentos(gerarDadosExemplo(12));
    setFonte("exemplo");
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_FONTE);
    } catch {
      // ignora
    }
  }, []);

  const setPeriodo = useCallback((inicio: string, fim: string) => {
    setPeriodoInicio(inicio);
    setPeriodoFim(fim);
  }, []);

  const valor: DataContextValor = {
    lancamentos,
    fonte,
    carregado,
    periodoInicio,
    periodoFim,
    setPeriodo,
    meses,
    importar,
    limparParaExemplo,
  };

  return <DataContext.Provider value={valor}>{children}</DataContext.Provider>;
}

export function useDados(): DataContextValor {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useDados deve ser usado dentro de <DataProvider>");
  return ctx;
}
