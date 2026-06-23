"use client";

import { useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  FileSpreadsheet,
  Database,
  Printer,
  AlertTriangle,
  Pencil,
  Check,
  Cloud,
} from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";
import { montarDemonstrativo, rotuloMesAno } from "@/lib/rastreio/logic";
import { importarBD } from "@/lib/rastreio/import";
import { formatarMoeda, formatarPercent } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Visao } from "@/lib/rastreio/types";

function ValorEditavel({
  valor,
  onSalvar,
  classe = "",
}: {
  valor: number;
  onSalvar: (n: number) => void;
  classe?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  function abrir() {
    setTexto(valor ? valor.toString().replace(".", ",") : "");
    setEditando(true);
  }
  function salvar() {
    const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
    onSalvar(isNaN(n) ? 0 : n);
    setEditando(false);
  }

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
          className="w-32 rounded border border-brand-400 px-2 py-0.5 text-right text-sm focus:outline-none"
        />
        <button onClick={salvar} className="text-brand-600 hover:text-brand-800">
          <Check className="h-4 w-4" />
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={abrir}
      className={`group inline-flex items-center gap-1 ${classe}`}
      title="Clique para editar"
    >
      {formatarMoeda(valor)}
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

export default function RastreioFaturamentoPage() {
  const {
    contas,
    fonte,
    carregado,
    emitidoEm,
    competencias,
    competencia,
    setCompetencia,
    visao,
    setVisao,
    faturamento,
    setFaturamentoMes,
    vendasPF,
    setVendasPFMes,
    importarContas,
    voltarParaExemplo,
  } = useRastreio();

  const inputRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const pf = vendasPF[competencia] ?? 0;
  const dem = useMemo(
    () =>
      competencia
        ? montarDemonstrativo(contas, competencia, visao, faturamento, pf)
        : null,
    [contas, competencia, visao, faturamento, pf]
  );

  async function atualizarBD(arquivo: File) {
    setImportando(true);
    setAviso(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      const res = importarBD(buffer);
      if (res.contas.length === 0) {
        setAviso(res.avisos.join(" ") || "Nenhuma conta importada.");
      } else {
        importarContas(res.contas, res.emitidoEm);
        setAviso(
          `${res.contas.length} contas importadas com sucesso${
            res.emitidoEm ? ` (emitido em ${res.emitidoEm})` : ""
          }.`
        );
      }
    } catch {
      setAviso("Falha ao ler o arquivo. Use o relatório de Contas a Receber (.xlsx).");
    } finally {
      setImportando(false);
    }
  }

  async function sincronizarOmie() {
    setSincronizando(true);
    setAviso(null);
    try {
      const resp = await fetch(
        `/api/omie/contas-receber?competencia=${encodeURIComponent(competencia)}`
      );
      const dados = await resp.json();
      if (!dados.ok) {
        setAviso(dados.erro ?? "Não foi possível sincronizar com o Omie.");
      } else if (!dados.contas?.length) {
        setAviso("O Omie respondeu, mas nenhuma conta a receber foi retornada no período.");
      } else {
        importarContas(dados.contas, dados.emitidoEm ?? null);
        const comps = dados.competencias ?? [];
        const faixa = comps.length ? `${comps[0]} a ${comps[comps.length - 1]}` : "—";
        setAviso(
          `${dados.contas.length} contas sincronizadas do Omie · filtro: ${dados.filtroUsado} · ` +
            `páginas ${dados.paginasLidas}/${dados.totalPaginas} · competências: ${faixa}` +
            (dados.truncado ? " · (limite de páginas atingido — avise para ampliar)" : "")
        );
      }
    } catch {
      setAviso("Falha de conexão ao sincronizar com o Omie.");
    } finally {
      setSincronizando(false);
    }
  }

  if (!carregado) {
    return <div className="text-slate-500">Carregando…</div>;
  }

  const colLabel =
    visao === "Vencimento" ? "Mês de Vencimento" : "Mês Previsto de Recebimento";

  return (
    <div>
      <PageHeader
        titulo="Rastreio de Faturamento"
        subtitulo="Cruza o faturamento (competência) com o financeiro (contas a receber)"
        acoes={
          <div className="no-print flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) atualizarBD(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={sincronizarOmie}
              disabled={sincronizando}
              title="Sincroniza a competência selecionada a partir do Omie"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Cloud className={`h-4 w-4 ${sincronizando ? "animate-pulse" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar Omie"}
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={importando}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${importando ? "animate-spin" : ""}`} />
              Atualizar BD
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Barra de status / fonte */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            fonte === "bd" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {fonte === "bd" ? (
            <>
              <FileSpreadsheet className="h-3.5 w-3.5" /> BD importado
            </>
          ) : (
            <>
              <Database className="h-3.5 w-3.5" /> Dados de exemplo
            </>
          )}
        </span>
        {fonte === "bd" && (
          <button
            onClick={voltarParaExemplo}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            voltar aos dados de exemplo
          </button>
        )}
      </div>

      {aviso && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {aviso}
        </div>
      )}

      {/* Controles */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Competência</label>
          <select
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {competencias.map((c) => (
              <option key={c} value={c}>
                {rotuloMesAno(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Visão</label>
          <select
            value={visao}
            onChange={(e) => setVisao(e.target.value as Visao)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="Recebimento">Recebimento</option>
            <option value="Vencimento">Vencimento</option>
          </select>
        </div>
      </div>

      {dem && (
        <>
          {/* Título com faturamento do mês */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-xl font-bold text-brand-800">
              Faturamento {rotuloMesAno(competencia).replace(/^./, (s) => s.toUpperCase())}
            </h2>
            <span className="text-xl font-bold text-brand-800">R$</span>
            <ValorEditavel
              valor={dem.faturamentoMes}
              onSalvar={(n) => setFaturamentoMes(competencia, n)}
              classe="text-xl font-bold text-brand-800"
            />
          </div>

          {/* Cards de totais (cabeçalho do demonstrativo) */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { l: "Ainda Falta Receber", v: dem.totais.aindaFaltaReceber, c: "text-slate-900" },
              { l: "Já Recebido", v: dem.totais.jaRecebido, c: "text-emerald-600" },
              { l: "Descontos Concedidos", v: dem.totais.descontos, c: "text-rose-600" },
              { l: "Multa/Juros", v: dem.totais.multaJuros, c: "text-slate-900" },
              { l: "Atrasado", v: dem.totais.atrasado, c: "text-rose-600" },
            ].map((k) => (
              <div key={k.l} className="card card-pad">
                <div className="text-xs font-medium text-slate-500">{k.l}</div>
                <div className={`mt-1 text-lg font-bold tabular-nums ${k.c}`}>
                  {formatarMoeda(k.v)}
                </div>
              </div>
            ))}
          </div>

          {/* Tabela do demonstrativo */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-4 py-3 text-left font-medium">{colLabel}</th>
                    <th className="px-4 py-3 text-right font-medium">Ainda Falta Receber</th>
                    <th className="px-4 py-3 text-right font-medium">Já Recebido</th>
                    <th className="px-4 py-3 text-right font-medium">Descontos Concedidos</th>
                    <th className="px-4 py-3 text-right font-medium">Multa/Juros</th>
                    <th className="px-4 py-3 text-right font-medium">Atrasado</th>
                  </tr>
                </thead>
                <tbody>
                  {dem.linhas.map((l) => (
                    <tr
                      key={l.mes}
                      className={`border-b border-slate-100 tabular-nums ${
                        l.selecionado ? "bg-amber-50 font-semibold" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 text-left font-medium capitalize text-slate-700">
                        {l.rotulo}
                      </td>
                      <td className="px-4 py-2.5 text-right">{cell(l.aindaFaltaReceber)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">
                        {cell(l.jaRecebido)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{cell(l.descontos)}</td>
                      <td className="px-4 py-2.5 text-right">{cell(l.multaJuros)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{cell(l.atrasado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-50 font-bold tabular-nums text-brand-900">
                    <td className="px-4 py-3 text-left">Total</td>
                    <td className="px-4 py-3 text-right">{formatarMoeda(dem.totais.aindaFaltaReceber)}</td>
                    <td className="px-4 py-3 text-right">{formatarMoeda(dem.totais.jaRecebido)}</td>
                    <td className="px-4 py-3 text-right">{formatarMoeda(dem.totais.descontos)}</td>
                    <td className="px-4 py-3 text-right">{formatarMoeda(dem.totais.multaJuros)}</td>
                    <td className="px-4 py-3 text-right">{formatarMoeda(dem.totais.atrasado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {emitidoEm && (
              <div className="px-4 py-2 text-right text-xs text-rose-500">
                Atualizado em {emitidoEm}
              </div>
            )}
          </div>

          {/* Análise */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card card-pad">
              <h3 className="mb-4 text-base font-semibold italic text-rose-600">Análise</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">
                    Valor Total Rastreado{" "}
                    <span className="text-xs text-slate-400">(A receber + Recebido + Descontos)</span>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatarMoeda(dem.valorTotalRastreado)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">
                    Total de vendas PF{" "}
                    <span className="text-xs text-slate-400">(consumidor final)</span>
                  </dt>
                  <dd className="tabular-nums">
                    <ValorEditavel valor={pf} onSalvar={(n) => setVendasPFMes(competencia, n)} />
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <dt className="font-semibold text-slate-700">Total Rastreado + PF</dt>
                  <dd className="font-bold tabular-nums">{formatarMoeda(dem.totalComPF)}</dd>
                </div>
              </dl>

              <div className="mt-6 rounded-lg bg-brand-50 p-4">
                <div className="text-sm text-brand-800">
                  Percentual rastreado em relação ao faturamento do mês
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-brand-700">
                    {formatarPercent(dem.percentualRastreado)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, dem.percentualRastreado * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <h3 className="mb-2 text-base font-semibold text-slate-800">Como funciona</h3>
              <p className="text-sm text-slate-600">
                Para a competência selecionada (mês em que a venda foi faturada), o quadro distribui
                as parcelas pelo mês em que serão recebidas (visão <strong>Recebimento</strong>) ou
                vencem (visão <strong>Vencimento</strong>), mostrando quanto já foi recebido, quanto
                ainda falta, descontos, multas/juros e valores atrasados.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                <li>
                  • <strong>Atualizar BD:</strong> importe o relatório de Contas a Receber do Omie
                  (.xlsx).
                </li>
                <li>
                  • <strong>Faturamento do mês</strong> e <strong>Vendas PF</strong> são editáveis
                  (clique no valor).
                </li>
                <li>
                  • O objetivo é chegar a <strong>100%</strong> de rastreamento do faturamento.
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Exibe "-" para zero, como na planilha original.
function cell(v: number): string {
  return Math.abs(v) < 0.005 ? "-" : formatarMoeda(v);
}
