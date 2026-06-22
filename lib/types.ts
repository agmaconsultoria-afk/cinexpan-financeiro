// Tipos de domínio do portal financeiro

export type TipoLancamento = "receita" | "despesa";

/**
 * Um lançamento financeiro individual (linha da planilha / ERP).
 */
export interface Lancamento {
  id: string;
  data: string; // ISO date (YYYY-MM-DD)
  descricao: string;
  categoria: string;
  grupo: string; // grupo do DRE (ex: "Receita Bruta", "Custos", "Despesas Operacionais")
  tipo: TipoLancamento;
  valor: number; // sempre positivo; o tipo define o sinal
  centroCusto?: string;
  origem?: "planilha" | "omie" | "manual" | "exemplo";
}

export interface ResumoKpi {
  receitaTotal: number;
  despesaTotal: number;
  resultado: number;
  margem: number; // resultado / receita
  saldoCaixa: number;
}

export interface PontoFluxoCaixa {
  mes: string; // "2026-01"
  rotulo: string; // "Jan/26"
  receitas: number;
  despesas: number;
  resultado: number;
  saldoAcumulado: number;
}

export interface LinhaDre {
  chave: string;
  rotulo: string;
  valor: number;
  tipo: "subtotal" | "receita" | "deducao" | "total" | "detalhe";
  nivel: number;
}
