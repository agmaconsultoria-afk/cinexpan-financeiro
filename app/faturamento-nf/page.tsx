"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Receipt, FileX, CheckCircle2, History, Clock, Trash2 } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { formatarMoeda } from "@/lib/format";
import { rotuloMesAno } from "@/lib/rastreio/logic";
import { DollarSign, Hash, Save } from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";

interface HistoricoItem {
  id: number;
  mes: string;
  totalNFs: number;
  totalFaturado: number;
  processadoEm: string;
}

function formatarDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function FaturamentoNFPage() {
  const { setFaturamentoOmieMes } = useRastreio();

  const [competencia, setCompetencia] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [totalNFs, setTotalNFs] = useState<number | null>(null);
  const [totalMerc, setTotalMerc] = useState<number | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [gravado, setGravado] = useState(false);
  const [mesGravado, setMesGravado] = useState("");

  const [resumoPorNatOp, setResumoPorNatOp] = useState<Record<string, { nfs: number; total: number }> | null>(null);
  const [resumoPorOperacao, setResumoPorOperacao] = useState<Record<string, { nfs: number; total: number }> | null>(null);
  const [resumoPorCFOP, setResumoPorCFOP] = useState<Record<string, { nfs: number; total: number }> | null>(null);
  const [excluidas, setExcluidas] = useState<{ nf: string; dataEmissao: string; operacao: string; cfops: string; total: number }[] | null>(null);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [mostrarResumoOp, setMostrarResumoOp] = useState(false);
  const [mostrarCFOP, setMostrarCFOP] = useState(false);
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);

  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHistorico(true);
    try {
      const res = await fetch("/api/omie/historico");
      const data = await res.json();
      if (data.ok) setHistorico(data.historico ?? []);
    } catch {
      /* silencioso */
    } finally {
      setCarregandoHistorico(false);
    }
  }, []);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  async function limparHistorico() {
    if (!confirm("Limpar todo o histórico de processamentos?")) return;
    setLimpando(true);
    try {
      await fetch("/api/omie/historico", { method: "DELETE" });
      setHistorico([]);
    } catch {
      /* silencioso */
    } finally {
      setLimpando(false);
    }
  }

  async function buscar() {
    setCarregando(true);
    setErro("");
    setBuscou(false);
    setGravado(false);
    setResumoPorNatOp(null);
    setResumoPorOperacao(null);
    setResumoPorCFOP(null);
    setExcluidas(null);
    setMostrarResumo(false);
    setMostrarResumoOp(false);
    setMostrarCFOP(false);
    setMostrarExcluidas(false);
    try {
      const res = await fetch(`/api/omie/notas-fiscais?competencia=${competencia}`);
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao buscar notas fiscais.");
        return;
      }
      const itens: { totalMercadoria: number; nf: string }[] = data.itens ?? [];
      setTotalNFs(new Set(itens.map((i) => i.nf)).size);
      setTotalMerc(itens.reduce((s, i) => s + i.totalMercadoria, 0));
      setResumoPorNatOp(data.resumoPorNatOp ?? null);
      setResumoPorOperacao(data.resumoPorOperacao ?? null);
      setResumoPorCFOP(data.resumoPorCFOP ?? null);
      setExcluidas(data.excluidas ?? null);
      setBuscou(true);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function gravarNoFaturamento() {
    if (totalMerc === null || totalNFs === null) return;
    setGravando(true);
    setErro("");
    try {
      const [resFat, resHist] = await Promise.all([
        fetch("/api/rastreio/faturamento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mes: competencia, faturamentoOmie: totalMerc }),
        }),
        fetch("/api/omie/historico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mes: competencia, totalNFs, totalFaturado: totalMerc }),
        }),
      ]);
      const dataFat = await resFat.json();
      if (!dataFat.ok) {
        setErro(dataFat.erro ?? "Erro ao gravar.");
        return;
      }
      await resHist.json();
      setFaturamentoOmieMes(competencia, totalMerc);
      setMesGravado(competencia);
      setGravado(true);
      await carregarHistorico();
    } catch {
      setErro("Erro de conexão ao gravar.");
    } finally {
      setGravando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Faturamento por NF"
        subtitulo="Notas fiscais de saída emitidas no Omie"
        acoes={
          <div className="flex items-center gap-2">
            <SeletorMes value={competencia} onChange={(v) => { setCompetencia(v); setBuscou(false); setGravado(false); }} />
            <button
              onClick={buscar}
              disabled={carregando}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {carregando ? "Buscando..." : "Buscar do Omie"}
            </button>
          </div>
        }
      />

      {erro && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</div>
      )}

      {carregando && (
        <div className="card flex flex-col items-center gap-4 py-20 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-slate-400">Consultando o Omie…</p>
        </div>
      )}

      {!buscou && !carregando && (
        <div className="card flex flex-col items-center gap-4 py-20 text-center">
          <Receipt className="h-12 w-12 text-brand-300" />
          <p className="text-sm text-slate-400">
            Selecione o mês e clique em{" "}
            <strong className="text-slate-600">Buscar do Omie</strong> para ver o total de faturamento.
          </p>
        </div>
      )}

      {buscou && !carregando && (
        <>
          {totalNFs === 0 ? (
            <div className="card flex flex-col items-center gap-4 py-20 text-center">
              <FileX className="h-12 w-12 text-slate-300" />
              <p className="text-sm text-slate-400">Nenhuma nota fiscal encontrada para este período.</p>
            </div>
          ) : (
            <div className="mb-6 grid grid-cols-2 gap-4">
              <KpiCard
                titulo="NFs emitidas"
                valor={String(totalNFs ?? 0)}
                icone={Hash}
                cor="azul"
              />
              <KpiCard
                titulo="Total faturado"
                valor={formatarMoeda(totalMerc ?? 0)}
                icone={DollarSign}
                cor="verde"
              />
            </div>
          )}

          {resumoPorNatOp && Object.keys(resumoPorNatOp).length > 1 && (
            <div className="card mb-4 overflow-hidden">
              <button
                onClick={() => setMostrarResumo((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-600">Composição por natureza de operação</span>
                <span className="text-xs">{mostrarResumo ? "▲ ocultar" : "▼ ver"}</span>
              </button>
              {mostrarResumo && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-y border-slate-200 text-left text-slate-500">
                      <th className="px-5 py-2 font-medium">Natureza da operação</th>
                      <th className="px-3 py-2 text-right font-medium">Linhas</th>
                      <th className="px-3 py-2 text-right font-medium">Total (R$)</th>
                      <th className="w-full" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(resumoPorNatOp)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([nat, v]) => (
                        <tr key={nat} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2 text-slate-700">{nat || "(sem natureza)"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{v.nfs}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                            {formatarMoeda(v.total)}
                          </td>
                          <td className="w-full" />
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {resumoPorOperacao && Object.keys(resumoPorOperacao).length > 0 && (
            <div className="card mb-4 overflow-hidden">
              <button
                onClick={() => setMostrarResumoOp((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-600">Composição por operação</span>
                <span className="text-xs">{mostrarResumoOp ? "▲ ocultar" : "▼ ver"}</span>
              </button>
              {mostrarResumoOp && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-y border-slate-200 text-left text-slate-500">
                      <th className="px-5 py-2 font-medium">Operação</th>
                      <th className="px-3 py-2 text-right font-medium">Linhas</th>
                      <th className="px-3 py-2 text-right font-medium">Total (R$)</th>
                      <th className="w-full" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(resumoPorOperacao)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([op, v]) => (
                        <tr key={op} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2 text-slate-700">{op}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{v.nfs}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                            {formatarMoeda(v.total)}
                          </td>
                          <td className="w-full" />
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {resumoPorCFOP && Object.keys(resumoPorCFOP).length > 0 && (
            <div className="card mb-4 overflow-hidden">
              <button
                onClick={() => setMostrarCFOP((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-600">Composição por CFOP</span>
                <span className="text-xs">{mostrarCFOP ? "▲ ocultar" : "▼ ver"}</span>
              </button>
              {mostrarCFOP && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-y border-slate-200 text-left text-slate-500">
                      <th className="px-5 py-2 font-medium">CFOP</th>
                      <th className="px-3 py-2 text-right font-medium">Linhas</th>
                      <th className="px-3 py-2 text-right font-medium">Total (R$)</th>
                      <th className="w-full" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(resumoPorCFOP)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([cfop, v]) => (
                        <tr key={cfop} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2 text-slate-700">{cfop}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{v.nfs}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                            {formatarMoeda(v.total)}
                          </td>
                          <td className="w-full" />
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {excluidas && excluidas.length > 0 && (
            <div className="card mb-4 overflow-hidden">
              <button
                onClick={() => setMostrarExcluidas((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-600">
                  NFs excluídas do faturamento ({excluidas.length}) — sem pedido de venda
                </span>
                <span className="text-xs">{mostrarExcluidas ? "▲ ocultar" : "▼ ver"}</span>
              </button>
              {mostrarExcluidas && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-y border-slate-200 text-left text-slate-500">
                      <th className="px-5 py-2 font-medium">NF</th>
                      <th className="px-3 py-2 font-medium">Emissão</th>
                      <th className="px-3 py-2 font-medium">Operação</th>
                      <th className="px-3 py-2 font-medium">CFOPs</th>
                      <th className="px-3 py-2 text-right font-medium">Total (R$)</th>
                      <th className="w-full" />
                    </tr>
                  </thead>
                  <tbody>
                    {excluidas
                      .slice()
                      .sort((a, b) => b.total - a.total)
                      .map((e) => (
                        <tr key={e.nf} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2 text-slate-700">{e.nf.replace(/^0+/, "")}</td>
                          <td className="px-3 py-2 text-slate-500">{e.dataEmissao}</td>
                          <td className="px-3 py-2 text-slate-500">{e.operacao}</td>
                          <td className="px-3 py-2 text-slate-500">{e.cfops}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                            {formatarMoeda(e.total)}
                          </td>
                          <td className="w-full" />
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(totalNFs ?? 0) > 0 && (
            <div className="card mb-6 px-6 py-5">
              {gravado && mesGravado === competencia ? (
                <div className="flex items-center gap-3 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Gravado com sucesso!</p>
                    <p className="text-sm text-emerald-600">
                      {formatarMoeda(totalMerc ?? 0)} salvo como "Faturamento Omie" em Lançar Faturamento.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-800">Gravar no Faturamento</p>
                    <p className="text-sm text-slate-500">
                      Salva <strong>{formatarMoeda(totalMerc ?? 0)}</strong> como "Faturamento Omie" para comparar com o lançado manualmente.
                    </p>
                  </div>
                  <button
                    onClick={gravarNoFaturamento}
                    disabled={gravando}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {gravando ? "Gravando..." : "Gravar no Faturamento"}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Histórico de processamentos */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-slate-700">Histórico de processamentos</span>
          </div>
          {historico.length > 0 && (
            <button
              onClick={limparHistorico}
              disabled={limpando}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {limpando ? "Limpando..." : "Limpar histórico"}
            </button>
          )}
        </div>
        {carregandoHistorico ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        ) : historico.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Clock className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">Nenhum processamento registrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">Competência</th>
                  <th className="px-3 py-3 text-right font-medium">NFs</th>
                  <th className="px-3 py-3 text-right font-medium">Total faturado (R$)</th>
                  <th className="px-3 py-3 font-medium">Processado em</th>
                  <th className="w-full" />
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-5 py-2 font-medium capitalize text-slate-700">
                      {rotuloMesAno(h.mes)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">
                      {h.totalNFs}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatarMoeda(h.totalFaturado)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {formatarDataHora(h.processadoEm)}
                    </td>
                    <td className="w-full" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
