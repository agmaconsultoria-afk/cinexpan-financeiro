"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { PontoFluxoCaixa } from "@/lib/types";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";
import { CategoriaTotal } from "@/lib/aggregations";

const CORES_GRAFICO = [
  "#a85a2f",
  "#cd8a55",
  "#7a4527",
  "#d9a06a",
  "#8a4628",
  "#c2703a",
  "#b87a45",
  "#e0b487",
  "#6f3925",
  "#a3835f",
];

function tooltipMoeda(value: number) {
  return formatarMoeda(value);
}

/** Receitas x Despesas (barras) com linha de resultado. */
export function ReceitaDespesaChart({ dados }: { dados: PontoFluxoCaixa[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tickFormatter={(v) => formatarMoedaCompacta(v)}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={70}
        />
        <Tooltip formatter={(v: number) => tooltipMoeda(v)} />
        <Legend />
        <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="resultado"
          name="Resultado"
          stroke="#a85a2f"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Saldo de caixa acumulado (área). */
export function SaldoAcumuladoChart({ dados }: { dados: PontoFluxoCaixa[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a85a2f" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#a85a2f" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tickFormatter={(v) => formatarMoedaCompacta(v)}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={70}
        />
        <Tooltip formatter={(v: number) => tooltipMoeda(v)} />
        <Area
          type="monotone"
          dataKey="saldoAcumulado"
          name="Saldo acumulado"
          stroke="#a85a2f"
          strokeWidth={2.5}
          fill="url(#grad-saldo)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Relatório de rastreamento: Faturamento x Rastreado (barras) + % (linha). */
export interface PontoRastreio {
  rotulo: string;
  faturamento: number;
  rastreado: number;
  percent: number; // 0-100
}

export function RastreioRelatorioChart({ dados }: { dados: PontoRastreio[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => formatarMoedaCompacta(v)}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={70}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={48}
        />
        <Tooltip
          formatter={(v: number, name: string) =>
            name === "% Rastreado" ? `${v.toFixed(1)}%` : formatarMoeda(v)
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="faturamento" name="Faturamento do Mês" fill="#cd8a55" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="rastreado" name="Rastreado" fill="#a85a2f" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="percent"
          name="% Rastreado"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Estoque (a custo) x Venda por mês (barras) + markup (linha). */
export interface PontoEstoqueVenda {
  rotulo: string;
  estoque: number;
  venda: number;
  markup: number;
}

export function EstoqueVendaChart({ dados }: { dados: PontoEstoqueVenda[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => formatarMoedaCompacta(v)}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={70}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `${v.toFixed(1)}×`}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          width={48}
        />
        <Tooltip
          formatter={(v: number, name: string) =>
            name === "Markup" ? `${v.toFixed(2)}×` : formatarMoeda(v)
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="estoque" name="Estoque (a custo)" fill="#cd8a55" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="venda" name="Venda" fill="#a85a2f" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="markup"
          name="Markup"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Distribuição de despesas por categoria (pizza). */
export function CategoriasPieChart({ dados }: { dados: CategoriaTotal[] }) {
  const top = dados.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={top}
          dataKey="valor"
          nameKey="categoria"
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={55}
          paddingAngle={2}
        >
          {top.map((_, i) => (
            <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => tooltipMoeda(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Ranking de categorias (barras horizontais). */
export function CategoriasBarChart({ dados }: { dados: CategoriaTotal[] }) {
  const top = dados.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 42)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis
          type="number"
          tickFormatter={(v) => formatarMoedaCompacta(v)}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
        />
        <YAxis
          type="category"
          dataKey="categoria"
          width={150}
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
        />
        <Tooltip formatter={(v: number) => tooltipMoeda(v)} />
        <Bar dataKey="valor" name="Total" radius={[0, 4, 4, 0]}>
          {top.map((_, i) => (
            <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
