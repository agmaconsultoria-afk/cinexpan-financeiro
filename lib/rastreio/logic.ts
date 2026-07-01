import {
  ContaDerivada,
  ContaReceber,
  Demonstrativo,
  FaturamentoMensal,
  LinhaDemonstrativo,
  SituacaoBucket,
  Visao,
} from "./types";

// ----- Helpers de mês "YYYY-MM" -----

/** Mês (YYYY-MM) de uma data ISO. Equivale a EOMONTH(data,-1)+1 da planilha. */
export function mesDe(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

/** Soma `n` meses a uma chave "YYYY-MM". */
export function addMeses(chave: string, n: number): string {
  const [ano, mes] = chave.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NOMES_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-02" -> "fevereiro-26" (formato do frontend). */
export function rotuloMesExtenso(chave: string): string {
  if (!chave) return "";
  const [ano, mes] = chave.split("-");
  return `${NOMES_MESES[parseInt(mes, 10) - 1]}-${ano.slice(2)}`;
}

/** "2026-02" -> "fevereiro/2026". */
export function rotuloMesAno(chave: string): string {
  if (!chave) return "";
  const [ano, mes] = chave.split("-");
  return `${NOMES_MESES[parseInt(mes, 10) - 1]}/${ano}`;
}

// ----- Mapeamento de Situação (de->para "Lançar Faturamento" J2:K20) -----

const MAPA_SITUACAO: Record<string, SituacaoBucket> = {
  "a vencer (boleto gerado)": "A Receber",
  "a vencer": "A Receber",
  recebido: "Recebido",
  "vence hoje (boleto gerado)": "A Receber",
  "vence hoje": "A Receber",
  "recebido parcialmente": "Recebido",
  "atrasado (boleto gerado)": "Atrasado",
  cancelado: "Cancelado",
  "recebido (bloqueado)": "Recebido",
  "atrasado (bloqueado)": "Atrasado",
  atrasado: "Atrasado",
  "a vencer (bloqueado)": "A Receber",
  "recebido parcialmente (boleto gerado)": "Atrasado",
  "cancelado (bloqueado)": "Cancelado",
};

function normalizar(s: string): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Situação normalizada (bucket). Categorias de "Devoluções" são neutralizadas
 * (retornam "") como na planilha-mãe.
 */
export function mapearSituacao(situacaoRaw: string, categoria: string): SituacaoBucket {
  if (normalizar(categoria).startsWith("devolucoes")) return "";
  const chave = normalizar(situacaoRaw);
  return MAPA_SITUACAO[chave] ?? "";
}

// Situações cruas que zeram o Valor Faturado (na planilha o teste é com o valor cru).
const SITUACOES_SEM_FATURAMENTO = new Set([
  "a vencer (bloqueado)",
  "cancelado",
  "cancelado (bloqueado)",
]);

/**
 * Aplica as regras de colunas calculadas da tabela "financas".
 */
export function derivarConta(c: ContaReceber): ContaDerivada {
  const situacaoBucket = mapearSituacao(c.situacao, c.categoria);
  const sitNorm = normalizar(c.situacao);
  const catNorm = normalizar(c.categoria);

  // Valor Faturado (AI)
  let valorFaturado = c.valorConta;
  if (
    SITUACOES_SEM_FATURAMENTO.has(sitNorm) ||
    situacaoBucket === "" ||
    catNorm === "devolucoes de compra de mercadoria de revenda" ||
    normalizar(c.contaCorrente) === "adiantamento de cliente"
  ) {
    valorFaturado = 0;
  }

  // Atraso (AJ): valor da compra quando a situação é "Atrasado"
  const atraso = situacaoBucket === "Atrasado" ? c.valorConta : 0;

  // Desconto calculado (AK): zera descontos de linhas totalmente abatidas
  const descontoCalc =
    c.valorRecebido === 0 && c.valorAReceber === 0 && c.valorConta === c.desconto
      ? 0
      : c.desconto;

  // Valor Recebido calculado (AL): 0 quando não há faturamento
  const valorRecebidoCalc = valorFaturado === 0 ? 0 : c.valorRecebido;

  // Mês Recebimento (AM): último recebimento, ou previsão se não houver
  const mesRecebimento = mesDe(c.ultimoRecebimento || c.previsaoRecebimento);

  return {
    ...c,
    situacaoBucket,
    competencia: mesDe(c.dataEmissao),
    mesVencimento: mesDe(c.vencimento),
    mesRecebimento,
    valorFaturado,
    atraso,
    descontoCalc,
    valorRecebidoCalc,
  };
}

export function derivarTodas(contas: ContaReceber[]): ContaDerivada[] {
  return contas.map(derivarConta);
}

/** Lista de competências (meses) disponíveis nos dados, ordenada. */
export function competenciasDisponiveis(contas: ContaDerivada[]): string[] {
  const set = new Set<string>();
  for (const c of contas) if (c.competencia) set.add(c.competencia);
  return Array.from(set).sort();
}

/**
 * Monta o Demonstrativo Mensal para uma competência e visão.
 * Replica a aba "Demonstrativo Mensal": 3 meses antes da competência,
 * a competência, e 8 meses depois (12 linhas).
 */
export function montarDemonstrativo(
  contas: ContaDerivada[],
  competencia: string,
  visao: Visao,
  faturamento: FaturamentoMensal,
  vendasPF = 0,
  faturamentoOmieMap: FaturamentoMensal = {}
): Demonstrativo {
  const inicio = addMeses(competencia, -3);
  const meses = Array.from({ length: 12 }, (_, i) => addMeses(inicio, i));

  // Apuração ancorada no faturamento: só os títulos vinculados a NFs de venda do
  // mês (ehVenda). ehVenda === false = título de outro mês/remessa/devolução (fora).
  // undefined = competência ainda não re-apurada com a nova lógica → mantém (compat).
  const doMes = contas.filter((c) => c.competencia === competencia && c.ehVenda !== false);

  const linhas: LinhaDemonstrativo[] = meses.map((mes) => {
    const naLinha = doMes.filter((c) =>
      visao === "Vencimento" ? c.mesVencimento === mes : c.mesRecebimento === mes
    );

    const aindaFaltaReceber = naLinha.reduce(
      (a, c) => a + (visao === "Vencimento" ? c.valorFaturado : c.valorAReceber),
      0
    );
    const jaRecebido = naLinha.reduce((a, c) => a + c.valorRecebidoCalc, 0);
    const descontos = -naLinha.reduce((a, c) => a + c.descontoCalc, 0);
    const multaJuros = naLinha.reduce((a, c) => a + c.jurosMulta, 0);
    const atrasado = -naLinha.reduce((a, c) => a + c.atraso, 0);

    return {
      mes,
      rotulo: rotuloMesExtenso(mes),
      aindaFaltaReceber,
      jaRecebido,
      descontos,
      multaJuros,
      atrasado,
      selecionado: mes === competencia,
    };
  });

  const totais = linhas.reduce(
    (acc, l) => ({
      aindaFaltaReceber: acc.aindaFaltaReceber + l.aindaFaltaReceber,
      jaRecebido: acc.jaRecebido + l.jaRecebido,
      descontos: acc.descontos + l.descontos,
      multaJuros: acc.multaJuros + l.multaJuros,
      atrasado: acc.atrasado + l.atrasado,
    }),
    { aindaFaltaReceber: 0, jaRecebido: 0, descontos: 0, multaJuros: 0, atrasado: 0 }
  );

  // Valor Total Rastreado = valor faturado efetivamente rastreado da competência.
  // Calculado direto das contas (a receber + recebido + desconto), INDEPENDENTE da
  // visão. Na visão "Vencimento" a coluna "Falta Receber" mostra o valor cheio da
  // nota (que já embute o recebido); somar o "Já Recebido" de novo duplicaria o
  // total, por isso não usamos totais.aindaFaltaReceber aqui.
  const valorTotalRastreado = doMes.reduce(
    (a, c) => a + c.valorAReceber + c.valorRecebidoCalc + c.descontoCalc,
    0
  );
  const totalComPF = valorTotalRastreado + vendasPF;
  const faturamentoMes = faturamento[competencia] ?? 0;
  const faturamentoOmie = faturamentoOmieMap[competencia] ?? 0;
  // Faturamento do Mês = Faturamento Omie (NFs) + Vendas PF (consumidor final).
  // Se o Omie ainda não foi gravado, cai no faturamento manual como referência.
  const baseFaturamento = (faturamentoOmie > 0 ? faturamentoOmie : faturamentoMes) + vendasPF;
  // % Rastreado = (A receber + Recebido + Descontos) ÷ (Faturamento Omie + PF)
  const percentualRastreado = baseFaturamento > 0 ? valorTotalRastreado / baseFaturamento : 0;

  return {
    competencia,
    visao,
    linhas,
    totais,
    faturamentoMes,
    faturamentoOmie,
    vendasPF,
    baseFaturamento,
    valorTotalRastreado,
    totalComPF,
    percentualRastreado,
  };
}
