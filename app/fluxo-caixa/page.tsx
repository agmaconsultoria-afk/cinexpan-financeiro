"use client";

import { useMemo } from "react";
import { useLancamentosFiltrados } from "@/lib/use-filtrado";
import { fluxoCaixaMensal } from "@/lib/aggregations";
import { formatarMoeda } from "@/lib/format";
import { PageHeader, ChartCard } from "@/components/ui";
import { ReceitaDespesaChart, SaldoAcumuladoChart } from "@/components/Charts";

export default function FluxoCaixaPage() {
  const lancamentos = useLancamentosFiltrados();
  const fluxo = useMemo(() => fluxoCaixaMensal(lancamentos), [lancamentos]);

  const totalReceitas = fluxo.reduce((a, p) => a + p.receitas, 0);
  const totalDespesas = fluxo.reduce((a, p) => a + p.despesas, 0);
  const totalResultado = totalReceitas - totalDespesas;

  return (
    <div>
      <PageHeader
        titulo="Fluxo de Caixa"
        subtitulo="Entradas, saídas e saldo acumulado por mês"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard titulo="Receitas x Despesas">
          <ReceitaDespesaChart dados={fluxo} />
        </ChartCard>
        <ChartCard titulo="Saldo Acumulado">
          <SaldoAcumuladoChart dados={fluxo} />
        </ChartCard>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Detalhamento mensal</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">Mês</th>
                <th className="px-5 py-3 text-right font-medium">Receitas</th>
                <th className="px-5 py-3 text-right font-medium">Despesas</th>
                <th className="px-5 py-3 text-right font-medium">Resultado</th>
                <th className="px-5 py-3 text-right font-medium">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {fluxo.map((p) => (
                <tr key={p.mes} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-700">{p.rotulo}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">
                    {formatarMoeda(p.receitas)}
                  </td>
                  <td className="px-5 py-3 text-right text-rose-600">
                    {formatarMoeda(p.despesas)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-medium ${
                      p.resultado >= 0 ? "text-slate-800" : "text-rose-600"
                    }`}
                  >
                    {formatarMoeda(p.resultado)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      p.saldoAcumulado >= 0 ? "text-brand-700" : "text-rose-600"
                    }`}
                  >
                    {formatarMoeda(p.saldoAcumulado)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-800">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right text-emerald-700">
                  {formatarMoeda(totalReceitas)}
                </td>
                <td className="px-5 py-3 text-right text-rose-700">
                  {formatarMoeda(totalDespesas)}
                </td>
                <td className="px-5 py-3 text-right" colSpan={2}>
                  {formatarMoeda(totalResultado)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
