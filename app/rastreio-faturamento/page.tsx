"use client";

import { useCallback, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Database,
  Printer,
  AlertTriangle,
  Pencil,
  Check,
  Cloud,
  X,
} from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";
import { montarDemonstrativo, rotuloMesAno, rotuloMesExtenso } from "@/lib/rastreio/logic";
import { formatarMoeda, formatarPercent, formatarData } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { ContaDerivada, Visao } from "@/lib/rastreio/types";
import { useSessao } from "@/components/SessionProvider";
import { podeEditar } from "@/lib/auth/roles";

type Coluna = "falta" | "recebido" | "descontos" | "juros" | "atrasado";

const TITULO_COLUNA: Record<Coluna, string> = {
  falta: "Ainda Falta Receber",
  recebido: "Já Recebido",
  descontos: "Descontos Concedidos",
  juros: "Multa/Juros",
  atrasado: "Atrasado",
};

function ValorEditavel({
  valor,
  onSalvar,
  classe = "",
  somenteLeitura = false,
}: {
  valor: number;
  onSalvar: (n: number) => void;
  classe?: string;
  somenteLeitura?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  if (somenteLeitura) {
    return <span className={classe}>{formatarMoeda(valor)}</span>;
  }

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
    carregarDoBanco,
    voltarParaExemplo,
  } = useRastreio();

  const { usuario } = useSessao();
  const podeSincronizar = !usuario || podeEditar(usuario.perfil);

  const [aviso, setAviso] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  // Mês a sincronizar do Omie (independente do que já está carregado).
  const [mesOmie, setMesOmie] = useState(() => new Date().toISOString().slice(0, 7));
  // Drill-down: célula clicada (coluna + mês; mês null = total da competência).
  const [detalhe, setDetalhe] = useState<{ col: Coluna; mes: string | null } | null>(null);

  const pf = vendasPF[competencia] ?? 0;
  const dem = useMemo(
    () =>
      competencia
        ? montarDemonstrativo(contas, competencia, visao, faturamento, pf)
        : null,
    [contas, competencia, visao, faturamento, pf]
  );

  // Valor de uma conta para uma coluna (respeita a visão).
  const valorDe = useCallback(
    (c: ContaDerivada, col: Coluna): number => {
      switch (col) {
        case "falta":
          return visao === "Vencimento" ? c.valorFaturado : c.valorAReceber;
        case "recebido":
          return c.valorRecebidoCalc;
        case "descontos":
          return c.descontoCalc;
        case "juros":
          return c.jurosMulta;
        case "atrasado":
          return c.atraso;
      }
    },
    [visao]
  );

  // Lançamentos que compõem uma célula (coluna + mês; mês null = competência toda).
  const contasDaCelula = useCallback(
    (col: Coluna, mes: string | null): ContaDerivada[] =>
      contas.filter(
        (c) =>
          c.competencia === competencia &&
          (mes == null ||
            (visao === "Vencimento" ? c.mesVencimento : c.mesRecebimento) === mes) &&
          Math.abs(valorDe(c, col)) > 0.005
      ),
    [contas, competencia, visao, valorDe]
  );

  async function sincronizarOmie() {
    setSincronizando(true);
    setAviso(null);
    try {
      const resp = await fetch(
        `/api/omie/contas-receber?competencia=${encodeURIComponent(mesOmie)}`
      );
      const dados = await resp.json();
      if (!dados.ok) {
        setAviso(dados.erro ?? "Não foi possível sincronizar com o Omie.");
      } else if (!dados.contas?.length) {
        setAviso(
          "O Omie respondeu, mas nenhuma conta a receber foi retornada para esse mês."
        );
      } else {
        await carregarDoBanco(); // recarrega o histórico acumulado da base
        setCompetencia(mesOmie); // mostra a competência recém-sincronizada
        const enr =
          dados.enriquecidos != null
            ? ` · cruzados c/ MF: ${dados.enriquecidos}` +
              (dados.truncadoMF ? " (parcial — avise para ampliar)" : "")
            : "";
        setAviso(
          `${dados.contas.length} contas sincronizadas do Omie · ` +
            `páginas ${dados.paginasLidas}/${dados.totalPaginas}${enr}`
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

  // Célula clicável da tabela (abre o detalhe daquele mês + coluna).
  function celulaTd(valor: number, col: Coluna, mes: string, cor = "") {
    if (Math.abs(valor) < 0.005) {
      return <td className="px-4 py-2.5 text-right text-slate-300">-</td>;
    }
    return (
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={() => setDetalhe({ col, mes })}
          className={`rounded px-1 underline-offset-2 hover:bg-brand-50 hover:underline ${cor}`}
          title="Clique para ver os lançamentos"
        >
          {formatarMoeda(valor)}
        </button>
      </td>
    );
  }

  // Dados do detalhe (drill-down) em aberto.
  const detContas = detalhe ? contasDaCelula(detalhe.col, detalhe.mes) : [];
  const detTotal = detalhe
    ? detContas.reduce((a, c) => a + valorDe(c, detalhe.col), 0)
    : 0;

  return (
    <div>
      <PageHeader
        titulo="Rastreio de Faturamento"
        subtitulo="Cruza o faturamento (competência) com o financeiro (contas a receber)"
        acoes={
          <div className="no-print flex flex-wrap items-center gap-2">
            {podeSincronizar && <SeletorMes value={mesOmie} onChange={setMesOmie} />}
            {podeSincronizar && (
              <button
                onClick={sincronizarOmie}
                disabled={sincronizando}
                title="Sincroniza o mês selecionado ao lado, a partir do Omie"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Cloud className={`h-4 w-4 ${sincronizando ? "animate-pulse" : ""}`} />
                {sincronizando ? "Sincronizando…" : "Sincronizar Omie"}
              </button>
            )}
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
            fonte === "banco" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {fonte === "banco" ? (
            <>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Dados do Omie
            </>
          ) : (
            <>
              <Database className="h-3.5 w-3.5" /> Dados de exemplo
            </>
          )}
        </span>
        {fonte === "banco" && (
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
              somenteLeitura={!podeSincronizar}
            />
          </div>

          {/* Cards de totais (cabeçalho do demonstrativo) */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {([
              { col: "falta" as Coluna, v: dem.totais.aindaFaltaReceber, c: "text-slate-900" },
              { col: "recebido" as Coluna, v: dem.totais.jaRecebido, c: "text-emerald-600" },
              { col: "descontos" as Coluna, v: dem.totais.descontos, c: "text-rose-600" },
              { col: "juros" as Coluna, v: dem.totais.multaJuros, c: "text-slate-900" },
              { col: "atrasado" as Coluna, v: dem.totais.atrasado, c: "text-rose-600" },
            ]).map((k) => (
              <button
                key={k.col}
                onClick={() => setDetalhe({ col: k.col, mes: null })}
                className="card card-pad text-left transition-shadow hover:shadow-md"
                title="Clique para ver os lançamentos"
              >
                <div className="text-xs font-medium text-slate-500">{TITULO_COLUNA[k.col]}</div>
                <div className={`mt-1 text-lg font-bold tabular-nums ${k.c}`}>
                  {formatarMoeda(k.v)}
                </div>
              </button>
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
                      {celulaTd(l.aindaFaltaReceber, "falta", l.mes)}
                      {celulaTd(l.jaRecebido, "recebido", l.mes, "text-emerald-700")}
                      {celulaTd(l.descontos, "descontos", l.mes, "text-rose-600")}
                      {celulaTd(l.multaJuros, "juros", l.mes)}
                      {celulaTd(l.atrasado, "atrasado", l.mes, "text-rose-600")}
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
                    <ValorEditavel
                      valor={pf}
                      onSalvar={(n) => setVendasPFMes(competencia, n)}
                      somenteLeitura={!podeSincronizar}
                    />
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
                  • <strong>Sincronizar Omie:</strong> traz as contas a receber do mês escolhido.
                </li>
                <li>
                  • <strong>Clique em qualquer valor</strong> (cards ou tabela) para ver os
                  lançamentos que o compõem.
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

      {/* Modal de detalhe (drill-down dos lançamentos) */}
      {detalhe && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetalhe(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {TITULO_COLUNA[detalhe.col]} — {rotuloMesAno(competencia)}
                </h3>
                <p className="text-sm text-slate-500">
                  {detalhe.mes
                    ? `${colLabel}: ${rotuloMesExtenso(detalhe.mes)} · `
                    : "Todos os meses · "}
                  {detContas.length} lançamento(s) · Total {formatarMoeda(detTotal)}
                </p>
              </div>
              <button
                onClick={() => setDetalhe(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">NF</th>
                    <th className="px-4 py-2.5 font-medium">Parcela</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                    <th className="px-4 py-2.5 font-medium">Vencimento</th>
                    <th className="px-4 py-2.5 font-medium">Últ. Recebimento</th>
                    <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detContas.map((c, i) => (
                    <tr key={`${c.codigoOmie ?? i}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">{c.cliente || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{c.notaFiscal || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{c.parcela || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{c.situacao || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {c.vencimento ? formatarData(c.vencimento) : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 ${
                          c.ultimoRecebimento ? "font-medium text-emerald-700" : "text-slate-400"
                        }`}
                      >
                        {c.ultimoRecebimento ? formatarData(c.ultimoRecebimento) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatarMoeda(valorDe(c, detalhe.col))}
                      </td>
                    </tr>
                  ))}
                  {detContas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Nenhum lançamento.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50">
                  <tr className="border-t border-slate-200 font-semibold text-slate-800">
                    <td className="px-4 py-2.5" colSpan={6}>
                      Total ({detContas.length})
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatarMoeda(detTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
