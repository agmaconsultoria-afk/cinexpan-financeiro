import { FaturamentoMensal } from "./types";

/**
 * Faturamento mensal lançado manualmente (aba "Lançar Faturamento" da planilha).
 * Valores em R$ por competência (mês de emissão). Editável no portal e
 * persistido localmente; futuramente virá do Omie.
 */
export const FATURAMENTO_SEED: FaturamentoMensal = {
  "2025-07": 5967229.19,
  "2025-08": 5168897.1,
  "2025-09": 5456639.19,
  "2025-10": 6102671.39,
  "2025-11": 5723035.22,
  "2025-12": 4683371.9,
  "2026-01": 5308134.88,
  "2026-02": 4870430.35,
  "2026-03": 5834572.39,
  "2026-04": 5717120.27,
};

/** Vendas PF (consumidor final) por competência — complemento do rastreio. */
export const VENDAS_PF_SEED: FaturamentoMensal = {
  "2026-02": 99707.5,
};
