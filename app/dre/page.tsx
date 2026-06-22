"use client";

import { useMemo } from "react";
import { useLancamentosFiltrados } from "@/lib/use-filtrado";
import { useDados } from "@/lib/data-context";
import { montarDre, totaisPorCategoria } from "@/lib/aggregations";
import { formatarMoeda, formatarPercent, rotuloMes } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { LinhaDre } from "@/lib/types";

function classeLinha(linha: LinhaDre): string {
  switch (linha.tipo) {
    case "total":
      return "bg-brand-50 font-bold text-brand-900 text-base";
    case "subtotal":
      return "bg-slate-50 font-semibold text-slate-900";
    case "receita":
      return "font-medium text-slate-800";
    default:
      return "text-slate-600";
  }
}

export default function DrePage() {
  const { periodoInicio, periodoFim } = useDados();
  const lancamentos = useLancamentosFiltrados();

  const dre = useMemo(() => montarDre(lancamentos), [lancamentos]);
  const receitaBruta = dre.find((l) => l.chave === "rb")?.valor ?? 0;
  const categorias = useMemo(() => totaisPorCategoria(lancamentos), [lancamentos]);

  return (
    <div>
      <PageHeader
        titulo="DRE — Demonstração do Resultado"
        subtitulo={`Período: ${rotuloMes(periodoInicio || "")} a ${rotuloMes(
          periodoFim || ""
        )}`}
        acoes={
          <button
            onClick={() => window.print()}
            className="no-print rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Imprimir / PDF
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">Conta</th>
                <th className="px-5 py-3 text-right font-medium">Valor</th>
                <th className="px-5 py-3 text-right font-medium">% Rec. Bruta</th>
              </tr>
            </thead>
            <tbody>
              {dre.map((linha) => (
                <tr
                  key={linha.chave}
                  className={`border-b border-slate-100 last:border-0 ${classeLinha(linha)}`}
                >
                  <td
                    className="px-5 py-3"
                    style={{ paddingLeft: `${1.25 + linha.nivel * 1}rem` }}
                  >
                    {linha.rotulo}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatarMoeda(linha.valor)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    {receitaBruta > 0
                      ? formatarPercent(linha.valor / receitaBruta)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-800">Por categoria</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {categorias.map((c) => (
                <tr key={c.categoria} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2.5">
                    <span
                      className={`mr-2 inline-block h-2 w-2 rounded-full ${
                        c.tipo === "receita" ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className="text-slate-700">{c.categoria}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">
                    {formatarMoeda(c.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
