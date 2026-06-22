"use client";

import { useMemo } from "react";
import { FileSpreadsheet, FileDown, Printer } from "lucide-react";
import { useLancamentosFiltrados } from "@/lib/use-filtrado";
import { useDados } from "@/lib/data-context";
import {
  calcularKpis,
  fluxoCaixaMensal,
  montarDre,
  totaisPorCategoria,
} from "@/lib/aggregations";
import { exportarLancamentosCsv, exportarRelatorioExcel } from "@/lib/export";
import { formatarMoeda, formatarPercent, rotuloMes } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default function RelatoriosPage() {
  const { periodoInicio, periodoFim } = useDados();
  const lancamentos = useLancamentosFiltrados();

  const kpis = useMemo(() => calcularKpis(lancamentos), [lancamentos]);
  const fluxo = useMemo(() => fluxoCaixaMensal(lancamentos), [lancamentos]);
  const dre = useMemo(() => montarDre(lancamentos), [lancamentos]);
  const categorias = useMemo(() => totaisPorCategoria(lancamentos), [lancamentos]);

  const periodoLabel = `${rotuloMes(periodoInicio || "")} a ${rotuloMes(periodoFim || "")}`;

  return (
    <div>
      <PageHeader
        titulo="Relatórios"
        subtitulo="Exportação e relatório consolidado para a diretoria"
        acoes={
          <div className="no-print flex flex-wrap gap-2">
            <button
              onClick={() => exportarRelatorioExcel(lancamentos, fluxo, dre)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button
              onClick={() => exportarLancamentosCsv(lancamentos)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </button>
          </div>
        }
      />

      <div className="card card-pad print-full">
        <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Relatório Financeiro Consolidado</h2>
            <p className="text-sm text-slate-500">Cinexpan · Período: {periodoLabel}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            Emitido em {new Date().toLocaleDateString("pt-BR")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { l: "Receita Total", v: formatarMoeda(kpis.receitaTotal) },
            { l: "Despesa Total", v: formatarMoeda(kpis.despesaTotal) },
            { l: "Resultado", v: formatarMoeda(kpis.resultado) },
            { l: "Margem", v: formatarPercent(kpis.margem) },
          ].map((item) => (
            <div key={item.l} className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500">{item.l}</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{item.v}</div>
            </div>
          ))}
        </div>

        <h3 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          DRE Resumido
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {dre.map((l) => (
              <tr key={l.chave} className="border-b border-slate-100">
                <td
                  className={`py-2 ${
                    l.tipo === "total" || l.tipo === "subtotal" ? "font-semibold" : ""
                  }`}
                >
                  {l.rotulo}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    l.tipo === "total" || l.tipo === "subtotal" ? "font-semibold" : ""
                  }`}
                >
                  {formatarMoeda(l.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Evolução Mensal
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 font-medium">Mês</th>
              <th className="py-2 text-right font-medium">Receitas</th>
              <th className="py-2 text-right font-medium">Despesas</th>
              <th className="py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {fluxo.map((p) => (
              <tr key={p.mes} className="border-b border-slate-100">
                <td className="py-2">{p.rotulo}</td>
                <td className="py-2 text-right tabular-nums">{formatarMoeda(p.receitas)}</td>
                <td className="py-2 text-right tabular-nums">{formatarMoeda(p.despesas)}</td>
                <td className="py-2 text-right tabular-nums">{formatarMoeda(p.resultado)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Totais por Categoria
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {categorias.map((c) => (
              <tr key={c.categoria} className="border-b border-slate-100">
                <td className="py-2">{c.categoria}</td>
                <td className="py-2 text-right text-slate-400">
                  {c.tipo === "receita" ? "Receita" : "Despesa"}
                </td>
                <td className="py-2 text-right tabular-nums">{formatarMoeda(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
