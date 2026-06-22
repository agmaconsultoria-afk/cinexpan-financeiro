/* Gera um relatório de validação (markdown) a partir do BD real.
 * Uso: BD=<bd.xlsx> OUT=<saida.md> npx tsx scripts/gerar-relatorio.ts
 */
import * as fs from "fs";
import { importarBD } from "../lib/rastreio/import";
import { derivarTodas, montarDemonstrativo, competenciasDisponiveis, rotuloMesAno } from "../lib/rastreio/logic";
import { FATURAMENTO_SEED, VENDAS_PF_SEED } from "../lib/rastreio/faturamento";
import { Visao } from "../lib/rastreio/types";

const BD = process.env.BD!;
const OUT = process.env.OUT || "RELATORIO-VALIDACAO.md";

const buf = fs.readFileSync(BD);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const res = importarBD(ab);
const contas = derivarTodas(res.contas);
const comps = competenciasDisponiveis(contas);

const f = (x: number) =>
  Math.abs(x) < 0.005 ? "-" : x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => (x * 100).toFixed(2) + "%";

let md = `# Relatório de Validação — Rastreio de Faturamento\n\n`;
md += `- **Fonte:** ${BD.split("/").pop()}\n`;
md += `- **Emitido em (BD):** ${res.emitidoEm ?? "—"}\n`;
md += `- **Contas importadas:** ${res.contas.length} (ignoradas: ${res.ignoradas})\n`;
md += `- **Competências encontradas:** ${comps.map(rotuloMesAno).join(", ")}\n\n`;

for (const comp of comps) {
  for (const visao of ["Recebimento", "Vencimento"] as Visao[]) {
    const pf = VENDAS_PF_SEED[comp] ?? 0;
    const dem = montarDemonstrativo(contas, comp, visao, FATURAMENTO_SEED, pf);
    md += `## ${rotuloMesAno(comp).replace(/^./, (s) => s.toUpperCase())} — visão ${visao}\n\n`;
    md += `Faturamento do mês: **R$ ${f(dem.faturamentoMes)}**\n\n`;
    md += `| Mês | Ainda Falta Receber | Já Recebido | Descontos | Multa/Juros | Atrasado |\n`;
    md += `|---|--:|--:|--:|--:|--:|\n`;
    for (const l of dem.linhas) {
      const sel = l.selecionado ? "**" : "";
      md += `| ${sel}${l.rotulo}${sel} | ${f(l.aindaFaltaReceber)} | ${f(l.jaRecebido)} | ${f(l.descontos)} | ${f(l.multaJuros)} | ${f(l.atrasado)} |\n`;
    }
    md += `| **TOTAL** | **${f(dem.totais.aindaFaltaReceber)}** | **${f(dem.totais.jaRecebido)}** | **${f(dem.totais.descontos)}** | **${f(dem.totais.multaJuros)}** | **${f(dem.totais.atrasado)}** |\n\n`;
    md += `- Valor Total Rastreado: **R$ ${f(dem.valorTotalRastreado)}**`;
    if (pf) md += ` · Vendas PF: R$ ${f(pf)} · Total+PF: **R$ ${f(dem.totalComPF)}**`;
    md += `\n- **% Rastreado: ${pct(dem.percentualRastreado)}**\n\n`;
  }
}

fs.writeFileSync(OUT, md);
console.log("Relatório gerado em", OUT, "(", md.length, "bytes )");
