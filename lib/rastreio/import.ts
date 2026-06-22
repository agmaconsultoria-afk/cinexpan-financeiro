import * as XLSX from "xlsx";
import { ContaReceber } from "./types";

export interface ResultadoImportacaoBD {
  contas: ContaReceber[];
  totalLinhas: number;
  ignoradas: number;
  emitidoEm: string | null; // "27/05/2026 13:27"
  avisos: string[];
}

type Campo = keyof typeof ALIAS;

// Aliases de cabeçalho (cobrem o export do Omie e a tabela "financas").
const ALIAS = {
  situacao: ["situação", "situacao"],
  numeroDoc: ["número do documento", "numero do documento"],
  parcela: ["parcela"],
  notaFiscal: ["nota fiscal / cupom fiscal", "nota fiscal/cupom fiscal", "nota fiscal"],
  cliente: ["cliente (nome fantasia)", "cliente nome fantasia", "cliente"],
  previsaoRecebimento: ["previsão de recebimento", "previsao de recebimento"],
  ultimoRecebimento: ["último recebimento", "ultimo recebimento"],
  valorConta: ["valor da conta", "valor da compra"],
  valorLiquido: ["valor líquido", "valor liquido"],
  desconto: ["desconto", "descontos"],
  jurosMulta: ["juros e multa", "juros/multa", "multa/juros"],
  valorRecebido: ["valor recebido"],
  valorAReceber: ["valor a receber"],
  categoria: ["categoria"],
  operacao: ["operação", "operacao"],
  vendedor: ["vendedor"],
  projeto: ["projeto"],
  contaCorrente: ["conta corrente"],
  vencimento: ["vencimento"],
  dataEmissao: ["data de emissão", "data de emissao"],
} as const;

function normalizar(s: unknown): string {
  return (s == null ? "" : s.toString())
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNumero(bruto: unknown): number {
  if (typeof bruto === "number") return bruto;
  if (bruto == null || bruto === "") return 0;
  let s = bruto.toString().trim();
  if (s === "-" || s === "") return 0;
  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function parseDataISO(bruto: unknown): string | null {
  if (bruto == null || bruto === "" || bruto === "-") return null;
  if (typeof bruto === "number") {
    const d = XLSX.SSF.parse_date_code(bruto);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = bruto.toString().trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

/** Localiza a linha de cabeçalho (o export do Omie tem 2 linhas de título antes). */
function acharCabecalho(linhas: unknown[][]): number {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const norm = (linhas[i] || []).map(normalizar);
    if (norm.includes("situacao") && norm.some((c) => c === "valor a receber")) {
      return i;
    }
  }
  return 0;
}

function acharEmitidoEm(linhas: unknown[][], ateLinha: number): string | null {
  for (let i = 0; i < ateLinha; i++) {
    for (const c of linhas[i] || []) {
      const m = (c ?? "").toString().match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/);
      if (m) return m[1];
    }
  }
  return null;
}

export function importarBD(buffer: ArrayBuffer): ResultadoImportacaoBD {
  const avisos: string[] = [];
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  // Prioriza a aba "financas"; senão usa a primeira.
  const nomeAba =
    wb.SheetNames.find((n) => normalizar(n) === "financas") ?? wb.SheetNames[0];
  const sheet = wb.Sheets[nomeAba];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
  });

  if (linhas.length < 2) {
    return {
      contas: [],
      totalLinhas: 0,
      ignoradas: 0,
      emitidoEm: null,
      avisos: ["Planilha vazia ou sem dados."],
    };
  }

  const idxCab = acharCabecalho(linhas);
  const emitidoEm = acharEmitidoEm(linhas, idxCab);
  const cabecalhos = (linhas[idxCab] || []).map(normalizar);

  // Mapeia campo -> índice de coluna
  const cols = {} as Record<Campo, number>;
  (Object.keys(ALIAS) as Campo[]).forEach((campo) => {
    const aliases = (ALIAS[campo] as readonly string[]).map(normalizar);
    const idx = cabecalhos.findIndex((c) => aliases.includes(c));
    cols[campo] = idx;
  });

  if (cols.valorConta < 0 || cols.situacao < 0) {
    avisos.push(
      "Cabeçalhos esperados não encontrados (ex.: Situação, Valor da Conta, Valor a Receber). Verifique se é o relatório de Contas a Receber."
    );
    return { contas: [], totalLinhas: 0, ignoradas: 0, emitidoEm, avisos };
  }

  const contas: ContaReceber[] = [];
  let ignoradas = 0;

  for (let i = idxCab + 1; i < linhas.length; i++) {
    const linha = linhas[i] || [];
    const txt = (campo: Campo): string =>
      cols[campo] >= 0 ? (linha[cols[campo]] ?? "").toString().trim() : "";
    const num = (campo: Campo): number =>
      cols[campo] >= 0 ? parseNumero(linha[cols[campo]]) : 0;
    const dt = (campo: Campo): string | null =>
      cols[campo] >= 0 ? parseDataISO(linha[cols[campo]]) : null;

    const situacao = txt("situacao");
    const valorConta = num("valorConta");
    // Linha sem situação e sem valor é descartada (linhas vazias/totais).
    if (!situacao && valorConta === 0) {
      ignoradas++;
      continue;
    }

    contas.push({
      situacao,
      numeroDoc: txt("numeroDoc"),
      parcela: txt("parcela"),
      notaFiscal: txt("notaFiscal"),
      cliente: txt("cliente"),
      previsaoRecebimento: dt("previsaoRecebimento"),
      ultimoRecebimento: dt("ultimoRecebimento"),
      valorConta,
      valorLiquido: num("valorLiquido"),
      desconto: num("desconto"),
      jurosMulta: num("jurosMulta"),
      valorRecebido: num("valorRecebido"),
      valorAReceber: num("valorAReceber"),
      categoria: txt("categoria"),
      operacao: txt("operacao"),
      contaCorrente: txt("contaCorrente"),
      vencimento: dt("vencimento"),
      dataEmissao: dt("dataEmissao"),
      vendedor: txt("vendedor"),
      projeto: txt("projeto"),
    });
  }

  if (contas.length === 0) avisos.push("Nenhuma conta a receber válida foi importada.");

  return { contas, totalLinhas: linhas.length - idxCab - 1, ignoradas, emitidoEm, avisos };
}
