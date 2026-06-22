/* Validação cruzada: compara a derivação do módulo (lib/rastreio) contra os
 * valores que o próprio Excel calculou na aba "Importação" da planilha-mãe.
 * Uso: MAE=<caminho.xlsm> npx tsx scripts/validar-mae.ts
 */
import * as fs from "fs";
import * as XLSX from "xlsx";
import { ContaReceber } from "../lib/rastreio/types";
import { derivarConta, derivarTodas, montarDemonstrativo, mesDe } from "../lib/rastreio/logic";
import { FATURAMENTO_SEED } from "../lib/rastreio/faturamento";

const MAE = process.env.MAE;
if (!MAE) {
  console.error("Defina MAE=<caminho do .xlsm>");
  process.exit(1);
}

const wb = XLSX.readFile(MAE, { cellDates: false });
const ws = wb.Sheets["Importação"];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

const norm = (s: unknown) =>
  (s == null ? "" : s.toString()).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const head = (rows[0] as unknown[]).map(norm);
const col = (nome: string) => head.indexOf(norm(nome));

// Índices das colunas de entrada
const I = {
  situacao: 0, // primeira "Situação"
  valorCompra: col("valor da compra"),
  valorLiquido: col("valor liquido"),
  descontos: col("descontos"),
  jurosMulta: col("juros e multa"),
  valorRecebido: head.indexOf("valor recebido"), // primeira ocorrência (raw)
  valorAReceber: col("valor a receber"),
  categoria: col("categoria"),
  contaCorrente: col("conta corrente"),
  vencimento: col("vencimento"),
  dataEmissao: col("data de emissao"),
  previsao: col("previsao de recebimento"),
  ultimoReceb: col("ultimo recebimento"),
};
// Índices das colunas DERIVADAS pelo Excel (ground truth)
const E = {
  competencia: col("competencia"),
  mesVencimento: col("mes vencimento"),
  valorFaturado: col("valor faturado"),
  atraso: col("atraso"),
  desconto: col("deesconto"),
  valorRecebido: head.lastIndexOf("valor recebido"), // "Valor Recebido " (calc) — última
  mesRecebimento: col("mes recebimento"),
};

function serialParaYM(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}` : "";
  }
  return mesDe(v.toString());
}
function serialParaISO(v: unknown): string | null {
  if (v == null || v === "" || v === "-") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  return null;
}
const n = (v: unknown) => (typeof v === "number" ? v : parseFloat((v ?? "0").toString().replace(",", ".")) || 0);

const contas: ContaReceber[] = [];
const esperado: { competencia: string; mesVenc: string; mesReceb: string; valorFaturado: number; atraso: number; desconto: number; valorRecebido: number }[] = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r] as unknown[];
  const situacao = (row[I.situacao] ?? "").toString().trim();
  const valorCompra = n(row[I.valorCompra]);
  if (!situacao && valorCompra === 0) continue;

  contas.push({
    situacao,
    numeroDoc: "",
    parcela: "",
    notaFiscal: "",
    cliente: "",
    previsaoRecebimento: serialParaISO(row[I.previsao]),
    ultimoRecebimento: serialParaISO(row[I.ultimoReceb]),
    valorConta: valorCompra,
    valorLiquido: n(row[I.valorLiquido]),
    desconto: n(row[I.descontos]),
    jurosMulta: n(row[I.jurosMulta]),
    valorRecebido: n(row[I.valorRecebido]),
    valorAReceber: n(row[I.valorAReceber]),
    categoria: (row[I.categoria] ?? "").toString(),
    operacao: "",
    contaCorrente: (row[I.contaCorrente] ?? "").toString(),
    vencimento: serialParaISO(row[I.vencimento]),
    dataEmissao: serialParaISO(row[I.dataEmissao]),
    vendedor: "",
    projeto: "",
  });
  esperado.push({
    competencia: serialParaYM(row[E.competencia]),
    mesVenc: serialParaYM(row[E.mesVencimento]),
    mesReceb: serialParaYM(row[E.mesRecebimento]),
    valorFaturado: n(row[E.valorFaturado]),
    atraso: n(row[E.atraso]),
    desconto: n(row[E.desconto]),
    valorRecebido: n(row[E.valorRecebido]),
  });
}

console.log(`Linhas de dados: ${contas.length}`);

// ---- Validação linha a linha ----
let erros = 0;
const aprox = (a: number, b: number) => Math.abs(a - b) < 0.01;
const exemplosErro: string[] = [];

contas.forEach((c, i) => {
  const d = derivarConta(c);
  const e = esperado[i];
  const checks: [string, boolean][] = [
    ["competencia", d.competencia === e.competencia],
    ["mesVencimento", d.mesVencimento === e.mesVenc],
    ["mesRecebimento", d.mesRecebimento === e.mesReceb],
    ["valorFaturado", aprox(d.valorFaturado, e.valorFaturado)],
    ["atraso", aprox(d.atraso, e.atraso)],
    ["desconto", aprox(d.descontoCalc, e.desconto)],
    ["valorRecebido", aprox(d.valorRecebidoCalc, e.valorRecebido)],
  ];
  const falhas = checks.filter(([, ok]) => !ok);
  if (falhas.length) {
    erros++;
    if (exemplosErro.length < 12) {
      exemplosErro.push(
        `  linha ${i + 2} [${c.situacao}|${c.categoria}] -> ${falhas
          .map(([campo]) => {
            const meu = (d as any)[campo === "desconto" ? "descontoCalc" : campo === "valorRecebido" ? "valorRecebidoCalc" : campo === "mesVencimento" ? "mesVencimento" : campo === "mesRecebimento" ? "mesRecebimento" : campo];
            const esp = campo === "mesVencimento" ? e.mesVenc : campo === "mesRecebimento" ? e.mesReceb : (e as any)[campo];
            return `${campo}: meu=${meu} excel=${esp}`;
          })
          .join("; ")}`
      );
    }
  }
});

console.log(`\n== Validação linha a linha ==`);
console.log(`Linhas conferidas: ${contas.length}`);
console.log(`Linhas com divergência: ${erros}`);
if (exemplosErro.length) {
  console.log("Exemplos:");
  exemplosErro.forEach((e) => console.log(e));
}

// ---- Validação dos agregados por competência (ground truth via colunas do Excel) ----
const derivadas = derivarTodas(contas);
const competencias = Array.from(new Set(esperado.map((e) => e.competencia).filter(Boolean))).sort();

function ymAdd(ym: string, k: number) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

console.log(`\n== Agregados por competência (Recebimento) — meu vs Excel ==`);
console.log("Compet.  | FaltaReceber (meu / excel) | Recebido (meu / excel) | OK?");
let aggErros = 0;
for (const comp of competencias) {
  const dem = montarDemonstrativo(derivadas, comp, "Recebimento", FATURAMENTO_SEED, 0);
  // ground truth com colunas do Excel
  const meses = Array.from({ length: 12 }, (_, i) => ymAdd(ymAdd(comp, -3), i));
  let gtFalta = 0, gtReceb = 0;
  esperado.forEach((e, i) => {
    if (e.competencia !== comp) return;
    if (!meses.includes(e.mesReceb)) return;
    gtFalta += contas[i].valorAReceber;
    gtReceb += e.valorRecebido;
  });
  const okFalta = aprox(dem.totais.aindaFaltaReceber, gtFalta);
  const okReceb = aprox(dem.totais.jaRecebido, gtReceb);
  if (!okFalta || !okReceb) aggErros++;
  const f = (x: number) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log(
    `${comp} | ${f(dem.totais.aindaFaltaReceber)} / ${f(gtFalta)} | ${f(dem.totais.jaRecebido)} / ${f(gtReceb)} | ${okFalta && okReceb ? "OK" : "DIVERGE"}`
  );
}

console.log(`\n=== RESUMO ===`);
console.log(`Linhas divergentes: ${erros} de ${contas.length}`);
console.log(`Competências divergentes (agregado): ${aggErros} de ${competencias.length}`);
console.log(erros === 0 && aggErros === 0 ? "✅ TUDO BATE COM A PLANILHA-MÃE" : "⚠️ Há divergências (ver acima)");
