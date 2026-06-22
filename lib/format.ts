// Utilitários de formatação (pt-BR)

const moedaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const moedaCompactaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatarMoeda(valor: number): string {
  return moedaFormatter.format(valor || 0);
}

export function formatarMoedaCompacta(valor: number): string {
  return moedaCompactaFormatter.format(valor || 0);
}

export function formatarPercent(valor: number): string {
  return percentFormatter.format(valor || 0);
}

const meses = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** "2026-01" -> "Jan/26" */
export function rotuloMes(chaveMes: string): string {
  const [ano, mes] = chaveMes.split("-");
  const indice = parseInt(mes, 10) - 1;
  return `${meses[indice] ?? mes}/${ano.slice(2)}`;
}

/** Date ISO -> "22/06/2026" */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}
