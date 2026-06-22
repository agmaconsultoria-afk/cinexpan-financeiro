import * as XLSX from "xlsx";
import { Lancamento } from "./types";
import { LinhaDre, PontoFluxoCaixa } from "./types";

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exporta um relatório completo (lançamentos + fluxo + DRE) em .xlsx com 3 abas. */
export function exportarRelatorioExcel(
  lancamentos: Lancamento[],
  fluxo: PontoFluxoCaixa[],
  dre: LinhaDre[],
  nomeArquivo = "relatorio-financeiro"
) {
  const wb = XLSX.utils.book_new();

  const wsLanc = XLSX.utils.json_to_sheet(
    lancamentos.map((l) => ({
      Data: l.data,
      Descrição: l.descricao,
      Categoria: l.categoria,
      Grupo: l.grupo,
      Tipo: l.tipo === "receita" ? "Receita" : "Despesa",
      Valor: l.valor,
      "Centro de Custo": l.centroCusto ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsLanc, "Lançamentos");

  const wsFluxo = XLSX.utils.json_to_sheet(
    fluxo.map((p) => ({
      Mês: p.rotulo,
      Receitas: p.receitas,
      Despesas: p.despesas,
      Resultado: p.resultado,
      "Saldo Acumulado": p.saldoAcumulado,
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsFluxo, "Fluxo de Caixa");

  const wsDre = XLSX.utils.json_to_sheet(
    dre.map((l) => ({ Conta: l.rotulo, Valor: l.valor }))
  );
  XLSX.utils.book_append_sheet(wb, wsDre, "DRE");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  baixar(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${nomeArquivo}.xlsx`
  );
}

/** Exporta os lançamentos em CSV (separador ; compatível com Excel pt-BR). */
export function exportarLancamentosCsv(
  lancamentos: Lancamento[],
  nomeArquivo = "lancamentos"
) {
  const cab = ["Data", "Descrição", "Categoria", "Grupo", "Tipo", "Valor", "Centro de Custo"];
  const linhas = lancamentos.map((l) =>
    [
      l.data,
      l.descricao,
      l.categoria,
      l.grupo,
      l.tipo === "receita" ? "Receita" : "Despesa",
      l.valor.toFixed(2).replace(".", ","),
      l.centroCusto ?? "",
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(";")
  );
  const conteudo = "﻿" + [cab.join(";"), ...linhas].join("\r\n");
  baixar(new Blob([conteudo], { type: "text/csv;charset=utf-8" }), `${nomeArquivo}.csv`);
}
