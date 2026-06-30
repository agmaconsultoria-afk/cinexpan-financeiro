"use client";

import { useEffect, useState } from "react";
import { DollarSign, Clock, CheckCircle, AlertCircle, BarChart2 } from "lucide-react";
import { mapearSituacao, mesDe, rotuloMesAno } from "@/lib/rastreio/logic";
import { ContaReceber } from "@/lib/rastreio/types";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader, ChartCard } from "@/components/ui";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DadosRastreio {
  contas: ContaReceber[];
  competenciasMeta: { competencia: string; total: number; sincronizadoEm: string }[];
  faturamento: Record<string, number>;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarMoedaTooltip(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashboardPage() {
  const [dados, setDados] = useState<DadosRastreio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semDados, setSemDados] = useState(false);

  useEffect(() => {
    fetch("/api/rastreio/dados")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.contas) && d.contas.length > 0) {
          setDados(d);
        } else {
          setSemDados(true);
        }
      })
      .catch(() => setSemDados(true))
      .finally(() => setCarregando(false));
  }, []);

  // Último mês com dados sincronizados
  const ultimaCompetencia = dados?.competenciasMeta
    .map((c) => c.competencia)
    .sort()
    .at(-1) ?? "";

  // Contas do último mês (filtradas por data de emissão)
  const contasUltimoMes = (dados?.contas ?? []).filter(
    (c) => mesDe(c.dataEmissao) === ultimaCompetencia
  );

  // KPIs do último mês
  const totalFaturado = contasUltimoMes.reduce((s, c) => s + (c.valorConta ?? 0), 0);
  const totalRecebido = contasUltimoMes.reduce((s, c) => s + (c.valorRecebido ?? 0), 0);
  const totalAReceber = contasUltimoMes.reduce((s, c) => s + (c.valorAReceber ?? 0), 0);
  const totalAtrasado = contasUltimoMes
    .filter((c) => mapearSituacao(c.situacao, c.categoria) === "Atrasado")
    .reduce((s, c) => s + (c.valorAReceber ?? 0), 0);

  // Gráfico mensal — agrupa todas as contas por competência
  const mesesOrdenados = [...(dados?.competenciasMeta ?? [])]
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .slice(-12); // últimos 12 meses

  const dadosGrafico = mesesOrdenados.map((m) => {
    const contasMes = (dados?.contas ?? []).filter(
      (c) => mesDe(c.dataEmissao) === m.competencia
    );
    return {
      rotulo: rotuloMesAno(m.competencia).replace("/20", "/"),
      faturado: contasMes.reduce((s, c) => s + (c.valorConta ?? 0), 0),
      recebido: contasMes.reduce((s, c) => s + (c.valorRecebido ?? 0), 0),
      aReceber: contasMes.reduce((s, c) => s + (c.valorAReceber ?? 0), 0),
    };
  });

  if (carregando) {
    return <div className="text-slate-500">Carregando dados financeiros…</div>;
  }

  if (semDados) {
    return (
      <div>
        <PageHeader
          titulo="Dashboard Executivo"
          subtitulo="Visão consolidada dos indicadores financeiros"
        />
        <div className="card flex flex-col items-center justify-center gap-4 py-20 text-center">
          <BarChart2 className="h-12 w-12 text-brand-300" />
          <h2 className="text-xl font-semibold text-slate-700">Nenhum dado sincronizado</h2>
          <p className="max-w-sm text-sm text-slate-400">
            Acesse <strong>Integração Omie</strong> para sincronizar os dados de contas a receber e
            visualizar os indicadores aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Dashboard Executivo"
        subtitulo={
          ultimaCompetencia
            ? `Último mês sincronizado: ${rotuloMesAno(ultimaCompetencia)}`
            : "Visão consolidada dos indicadores financeiros"
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Faturado"
          valor={formatarMoeda(totalFaturado)}
          icone={DollarSign}
          cor="azul"
          legenda={`${contasUltimoMes.length} títulos emitidos`}
        />
        <KpiCard
          titulo="Recebido"
          valor={formatarMoeda(totalRecebido)}
          icone={CheckCircle}
          cor="verde"
          legenda={
            totalFaturado > 0
              ? `${((totalRecebido / totalFaturado) * 100).toFixed(1)}% do faturado`
              : "do faturado"
          }
        />
        <KpiCard
          titulo="A Receber"
          valor={formatarMoeda(totalAReceber)}
          icone={Clock}
          cor="roxo"
          legenda="saldo pendente"
        />
        <KpiCard
          titulo="Atrasado"
          valor={formatarMoeda(totalAtrasado)}
          icone={AlertCircle}
          cor="vermelho"
          legenda="vencido e não pago"
        />
      </div>

      {dadosGrafico.length > 0 && (
        <div className="mt-6">
          <ChartCard titulo="Evolução Mensal — Faturado x Recebido x A Receber">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGrafico} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                      ? `${(v / 1_000).toFixed(0)}k`
                      : String(v)
                  }
                />
                <Tooltip
                  formatter={(v: number) => formatarMoedaTooltip(v)}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend />
                <Bar dataKey="faturado" name="Faturado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="aReceber" name="A Receber" fill="#a78bfa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
