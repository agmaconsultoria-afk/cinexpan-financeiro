"use client";

import { useMemo } from "react";
import { useDados } from "./data-context";
import { filtrarPorPeriodo } from "./aggregations";
import { Lancamento } from "./types";

/** Retorna os lançamentos já filtrados pelo período selecionado na Topbar. */
export function useLancamentosFiltrados(): Lancamento[] {
  const { lancamentos, periodoInicio, periodoFim } = useDados();
  return useMemo(
    () => filtrarPorPeriodo(lancamentos, periodoInicio, periodoFim),
    [lancamentos, periodoInicio, periodoFim]
  );
}
