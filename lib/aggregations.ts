import { Lancamento, LinhaDre, PontoFluxoCaixa, ResumoKpi } from "./types";
import { rotuloMes } from "./format";

export function chaveMes(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

/** Filtra lançamentos dentro de um intervalo (inclusivo) de meses "YYYY-MM". */
export function filtrarPorPeriodo(
  lancamentos: Lancamento[],
  inicio?: string,
  fim?: string
): Lancamento[] {
  return lancamentos.filter((l) => {
    const mes = chaveMes(l.data);
    if (inicio && mes < inicio) return false;
    if (fim && mes > fim) return false;
    return true;
  });
}

export function calcularKpis(lancamentos: Lancamento[]): ResumoKpi {
  let receitaTotal = 0;
  let despesaTotal = 0;
  for (const l of lancamentos) {
    if (l.tipo === "receita") receitaTotal += l.valor;
    else despesaTotal += l.valor;
  }
  const resultado = receitaTotal - despesaTotal;
  return {
    receitaTotal,
    despesaTotal,
    resultado,
    margem: receitaTotal > 0 ? resultado / receitaTotal : 0,
    saldoCaixa: resultado,
  };
}

/** Série mensal de fluxo de caixa com saldo acumulado. */
export function fluxoCaixaMensal(lancamentos: Lancamento[]): PontoFluxoCaixa[] {
  const mapa = new Map<string, { receitas: number; despesas: number }>();
  for (const l of lancamentos) {
    const mes = chaveMes(l.data);
    const atual = mapa.get(mes) ?? { receitas: 0, despesas: 0 };
    if (l.tipo === "receita") atual.receitas += l.valor;
    else atual.despesas += l.valor;
    mapa.set(mes, atual);
  }

  const meses = Array.from(mapa.keys()).sort();
  let acumulado = 0;
  return meses.map((mes) => {
    const { receitas, despesas } = mapa.get(mes)!;
    const resultado = receitas - despesas;
    acumulado += resultado;
    return {
      mes,
      rotulo: rotuloMes(mes),
      receitas,
      despesas,
      resultado,
      saldoAcumulado: acumulado,
    };
  });
}

/** Lista de meses presentes nos dados, ordenada. */
export function mesesDisponiveis(lancamentos: Lancamento[]): string[] {
  const set = new Set<string>();
  for (const l of lancamentos) set.add(chaveMes(l.data));
  return Array.from(set).sort();
}

export interface CategoriaTotal {
  categoria: string;
  grupo: string;
  tipo: "receita" | "despesa";
  valor: number;
}

export function totaisPorCategoria(lancamentos: Lancamento[]): CategoriaTotal[] {
  const mapa = new Map<string, CategoriaTotal>();
  for (const l of lancamentos) {
    const atual = mapa.get(l.categoria) ?? {
      categoria: l.categoria,
      grupo: l.grupo,
      tipo: l.tipo,
      valor: 0,
    };
    atual.valor += l.valor;
    mapa.set(l.categoria, atual);
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
}

// Ordem dos grupos no DRE
const ORDEM_GRUPOS = [
  "Receita Bruta",
  "Deduções",
  "Custos",
  "Despesas Operacionais",
  "Resultado Financeiro",
];

function somaGrupo(lancamentos: Lancamento[], grupo: string): number {
  return lancamentos
    .filter((l) => l.grupo === grupo)
    .reduce((acc, l) => acc + l.valor, 0);
}

/**
 * Monta a estrutura do DRE (Demonstração do Resultado do Exercício).
 */
export function montarDre(lancamentos: Lancamento[]): LinhaDre[] {
  const receitaBruta = somaGrupo(lancamentos, "Receita Bruta");
  const deducoes = somaGrupo(lancamentos, "Deduções");
  const receitaLiquida = receitaBruta - deducoes;
  const custos = somaGrupo(lancamentos, "Custos");
  const lucroBruto = receitaLiquida - custos;
  const despesasOp = somaGrupo(lancamentos, "Despesas Operacionais");
  const resultadoOp = lucroBruto - despesasOp;
  const financeiro = somaGrupo(lancamentos, "Resultado Financeiro");
  const resultadoLiquido = resultadoOp - financeiro;

  return [
    { chave: "rb", rotulo: "Receita Bruta", valor: receitaBruta, tipo: "receita", nivel: 0 },
    { chave: "ded", rotulo: "(-) Deduções e Impostos", valor: -deducoes, tipo: "deducao", nivel: 1 },
    { chave: "rl", rotulo: "= Receita Líquida", valor: receitaLiquida, tipo: "subtotal", nivel: 0 },
    { chave: "custos", rotulo: "(-) Custos", valor: -custos, tipo: "deducao", nivel: 1 },
    { chave: "lb", rotulo: "= Lucro Bruto", valor: lucroBruto, tipo: "subtotal", nivel: 0 },
    { chave: "despop", rotulo: "(-) Despesas Operacionais", valor: -despesasOp, tipo: "deducao", nivel: 1 },
    { chave: "ro", rotulo: "= Resultado Operacional", valor: resultadoOp, tipo: "subtotal", nivel: 0 },
    { chave: "fin", rotulo: "(-) Resultado Financeiro", valor: -financeiro, tipo: "deducao", nivel: 1 },
    { chave: "rliq", rotulo: "= Resultado Líquido", valor: resultadoLiquido, tipo: "total", nivel: 0 },
  ];
}
