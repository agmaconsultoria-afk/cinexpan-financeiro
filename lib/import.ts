import * as XLSX from "xlsx";
import { Lancamento, TipoLancamento } from "./types";

export interface ResultadoImportacao {
  lancamentos: Lancamento[];
  totalLinhas: number;
  ignoradas: number;
  avisos: string[];
}

// Mapeamento flexível de nomes de colunas (a planilha do cliente pode variar).
const ALIAS_COLUNAS: Record<keyof MapeadoLinha, string[]> = {
  data: ["data", "dt", "data lançamento", "data lancamento", "vencimento", "competência", "competencia"],
  descricao: ["descrição", "descricao", "histórico", "historico", "lançamento", "lancamento", "memo"],
  categoria: ["categoria", "conta", "plano de contas", "classificação", "classificacao"],
  grupo: ["grupo", "grupo dre", "natureza", "tipo de conta"],
  tipo: ["tipo", "natureza", "receita/despesa", "d/c", "operação", "operacao"],
  valor: ["valor", "valor (r$)", "montante", "total", "vlr"],
  centroCusto: ["centro de custo", "centro custo", "cc", "unidade"],
};

interface MapeadoLinha {
  data: string;
  descricao: string;
  categoria: string;
  grupo: string;
  tipo: string;
  valor: string;
  centroCusto: string;
}

function normalizar(texto: string): string {
  return texto
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectarColunas(cabecalhos: string[]): Partial<Record<keyof MapeadoLinha, number>> {
  const mapa: Partial<Record<keyof MapeadoLinha, number>> = {};
  const norm = cabecalhos.map(normalizar);
  (Object.keys(ALIAS_COLUNAS) as (keyof MapeadoLinha)[]).forEach((campo) => {
    const aliases = ALIAS_COLUNAS[campo].map(normalizar);
    const idx = norm.findIndex((c) => aliases.includes(c));
    if (idx >= 0) mapa[campo] = idx;
  });
  return mapa;
}

function parseValor(bruto: unknown): number {
  if (typeof bruto === "number") return bruto;
  if (bruto == null) return NaN;
  let s = bruto.toString().trim();
  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  // formato pt-BR: 1.234,56
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const negativoParenteses = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return negativoParenteses ? -n : n;
}

function parseData(bruto: unknown): string | null {
  if (bruto == null || bruto === "") return null;
  // Número serial do Excel
  if (typeof bruto === "number") {
    const d = XLSX.SSF.parse_date_code(bruto);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = bruto.toString().trim();
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return null;
}

function inferirTipo(valorTipo: string, valor: number): TipoLancamento {
  const t = normalizar(valorTipo);
  if (["receita", "r", "credito", "credito", "c", "entrada", "receitas"].includes(t)) return "receita";
  if (["despesa", "d", "debito", "debito", "saida", "saída", "despesas", "custo"].includes(t))
    return "despesa";
  // fallback pelo sinal do valor
  return valor >= 0 ? "receita" : "despesa";
}

function inferirGrupo(grupo: string, tipo: TipoLancamento): string {
  if (grupo && grupo.trim()) return grupo.trim();
  return tipo === "receita" ? "Receita Bruta" : "Despesas Operacionais";
}

/**
 * Lê um arquivo XLSX/CSV (ArrayBuffer) e converte em lançamentos.
 */
export function importarPlanilha(buffer: ArrayBuffer, nomeArquivo: string): ResultadoImportacao {
  const avisos: string[] = [];
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const primeiraAba = wb.SheetNames[0];
  const sheet = wb.Sheets[primeiraAba];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });

  if (linhas.length < 2) {
    return { lancamentos: [], totalLinhas: 0, ignoradas: 0, avisos: ["Planilha vazia ou sem dados."] };
  }

  const cabecalhos = (linhas[0] as unknown[]).map((c) => (c == null ? "" : c.toString()));
  const cols = detectarColunas(cabecalhos);

  if (cols.valor == null) {
    avisos.push(
      'Coluna de "valor" não encontrada. Verifique os cabeçalhos da planilha (ex.: Data, Descrição, Categoria, Tipo, Valor).'
    );
    return { lancamentos: [], totalLinhas: linhas.length - 1, ignoradas: linhas.length - 1, avisos };
  }

  const lancamentos: Lancamento[] = [];
  let ignoradas = 0;

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i] as unknown[];
    const get = (campo: keyof MapeadoLinha): unknown =>
      cols[campo] != null ? linha[cols[campo]!] : undefined;

    const valor = parseValor(get("valor"));
    if (isNaN(valor)) {
      ignoradas++;
      continue;
    }
    const dataIso = parseData(get("data")) ?? new Date().toISOString().slice(0, 10);
    const tipo = inferirTipo((get("tipo") ?? "").toString(), valor);
    const categoria = (get("categoria") ?? "Sem categoria").toString().trim() || "Sem categoria";
    const grupo = inferirGrupo((get("grupo") ?? "").toString(), tipo);

    lancamentos.push({
      id: `imp-${nomeArquivo}-${i}`,
      data: dataIso,
      descricao: (get("descricao") ?? categoria).toString().trim(),
      categoria,
      grupo,
      tipo,
      valor: Math.abs(valor),
      centroCusto: (get("centroCusto") ?? "").toString().trim() || undefined,
      origem: "planilha",
    });
  }

  if (lancamentos.length === 0) {
    avisos.push("Nenhuma linha válida foi importada.");
  }

  return { lancamentos, totalLinhas: linhas.length - 1, ignoradas, avisos };
}

/** Gera um modelo de planilha (.xlsx) para o cliente preencher. */
export function gerarModeloPlanilha(): Blob {
  const cabecalho = ["Data", "Descrição", "Categoria", "Grupo", "Tipo", "Valor", "Centro de Custo"];
  const exemplo = [
    ["01/01/2026", "Vendas de ingressos", "Bilheteria", "Receita Bruta", "Receita", "320000", "Operação"],
    ["05/01/2026", "Salários e encargos", "Folha de Pagamento", "Despesas Operacionais", "Despesa", "132000", "Operação"],
    ["10/01/2026", "Aluguel do complexo", "Aluguel e Condomínio", "Despesas Operacionais", "Despesa", "58000", "Operação"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...exemplo]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
