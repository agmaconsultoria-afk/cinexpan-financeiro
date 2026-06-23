// Módulo Rastreio de Faturamento
//
// Objetivo: cruzar o faturamento (vendas/competência) com o financeiro
// (contas a receber, em parcelas) para acompanhar, mês a mês, quanto de cada
// faturamento já foi recebido, ainda falta, foi descontado, está atrasado etc.
//
// Replica as regras da planilha-mãe "Rastreio do Faturamento" (aba
// "Demonstrativo Mensal" + tabela "financas" da aba "Importação").

export type SituacaoBucket = "A Receber" | "Recebido" | "Atrasado" | "Cancelado" | "";

export type Visao = "Recebimento" | "Vencimento";

/** Linha bruta de Contas a Receber (export do Omie / planilha BD). */
export interface ContaReceber {
  situacao: string;
  numeroDoc: string;
  parcela: string;
  notaFiscal: string;
  cliente: string;
  previsaoRecebimento: string | null; // ISO YYYY-MM-DD
  ultimoRecebimento: string | null;
  valorConta: number; // "Valor da Conta" / "Valor da Compra"
  valorLiquido: number;
  desconto: number;
  jurosMulta: number;
  valorRecebido: number;
  valorAReceber: number;
  categoria: string;
  operacao: string;
  contaCorrente: string;
  vencimento: string | null;
  dataEmissao: string | null;
  vendedor: string;
  projeto: string;
  codigoOmie?: string; // código do lançamento no Omie (para cruzar com Movimentos)
}

/** Conta a receber com as colunas calculadas da planilha-mãe. */
export interface ContaDerivada extends ContaReceber {
  situacaoBucket: SituacaoBucket;
  competencia: string; // "YYYY-MM" (mês da Data de Emissão)
  mesVencimento: string; // "YYYY-MM"
  mesRecebimento: string; // "YYYY-MM"
  valorFaturado: number;
  atraso: number;
  descontoCalc: number;
  valorRecebidoCalc: number;
}

/** Uma linha (mês) do Demonstrativo Mensal. */
export interface LinhaDemonstrativo {
  mes: string; // "YYYY-MM"
  rotulo: string; // "fevereiro-26"
  aindaFaltaReceber: number;
  jaRecebido: number;
  descontos: number; // negativo
  multaJuros: number;
  atrasado: number; // negativo
  selecionado: boolean;
}

export interface Demonstrativo {
  competencia: string; // "YYYY-MM"
  visao: Visao;
  linhas: LinhaDemonstrativo[];
  totais: {
    aindaFaltaReceber: number;
    jaRecebido: number;
    descontos: number;
    multaJuros: number;
    atrasado: number;
  };
  faturamentoMes: number;
  vendasPF: number;
  valorTotalRastreado: number;
  totalComPF: number;
  percentualRastreado: number;
}

/** Faturamento mensal lançado manualmente ("Lançar Faturamento"). */
export interface FaturamentoMensal {
  [chaveMes: string]: number; // "YYYY-MM" -> valor
}
