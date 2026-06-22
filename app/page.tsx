"use client";

import { useMemo } from "react";
import { DollarSign, TrendingDown, TrendingUp, Percent, Wallet } from "lucide-react";
import { useLancamentosFiltrados } from "@/lib/use-filtrado";
import { useDados } from "@/lib/data-context";
import {
  calcularKpis,
  fluxoCaixaMensal,
  totaisPorCategoria,
} from "@/lib/aggregations";
import { formatarMoeda, formatarPercent } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader, ChartCard } from "@/components/ui";
import {
  ReceitaDespesaChart,
  SaldoAcumuladoChart,
  CategoriasPieChart,
} from "@/components/Charts";

export default function DashboardPage() {
  const { carregado } = useDados();
  const lancamentos = useLancamentosFiltrados();

  const kpis = useMemo(() => calcularKpis(lancamentos), [lancamentos]);
  const fluxo = useMemo(() => fluxoCaixaMensal(lancamentos), [lancamentos]);
  const despesasPorCategoria = useMemo(
    () => totaisPorCategoria(lancamentos.filter((l) => l.tipo === "despesa")),
    [lancamentos]
  );

  if (!carregado) {
    return <div className="text-slate-500">Carregando dados financeiros…</div>;
  }

  return (
    <div>
      <PageHeader
        titulo="Dashboard Executivo"
        subtitulo="Visão consolidada dos indicadores financeiros para a diretoria"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Receita Total"
          valor={formatarMoeda(kpis.receitaTotal)}
          icone={DollarSign}
          cor="verde"
          legenda="no período selecionado"
        />
        <KpiCard
          titulo="Despesa Total"
          valor={formatarMoeda(kpis.despesaTotal)}
          icone={TrendingDown}
          cor="vermelho"
          legenda="no período selecionado"
        />
        <KpiCard
          titulo="Resultado"
          valor={formatarMoeda(kpis.resultado)}
          icone={kpis.resultado >= 0 ? TrendingUp : TrendingDown}
          cor={kpis.resultado >= 0 ? "azul" : "vermelho"}
          legenda="receitas - despesas"
        />
        <KpiCard
          titulo="Margem"
          valor={formatarPercent(kpis.margem)}
          icone={Percent}
          cor={kpis.margem >= 0 ? "roxo" : "vermelho"}
          legenda="resultado / receita"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard titulo="Receitas x Despesas x Resultado" className="lg:col-span-2">
          <ReceitaDespesaChart dados={fluxo} />
        </ChartCard>
        <ChartCard titulo="Composição de Despesas">
          <CategoriasPieChart dados={despesasPorCategoria} />
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <ChartCard titulo="Saldo de Caixa Acumulado">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <Wallet className="h-4 w-4" />
            Saldo ao final do período:{" "}
            <span
              className={`font-semibold ${
                kpis.saldoCaixa >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatarMoeda(kpis.saldoCaixa)}
            </span>
          </div>
          <SaldoAcumuladoChart dados={fluxo} />
        </ChartCard>
      </div>
    </div>
  );
}
