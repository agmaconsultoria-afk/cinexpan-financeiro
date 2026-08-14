"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Boxes, Download, Search, FileX } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { formatarMoeda } from "@/lib/format";

interface EstoqueItem {
  codigo: string;
  descricao: string;
  ncm: string;
  tipoSped: string;
  familia: string;
  unidade: string;
  quantidade: number;
  cmcUnitario: number;
  cmcTotal: number;
  periodo: string;
}

const CABECALHO = [
  "Código do Produto",
  "Descrição (completa)",
  "Código NCM",
  "Tipo do Produto (SPED)",
  "Família de Produto",
  "Unidade",
  "Quantidade",
  "CMC Unitário",
  "CMC Total",
  "Período",
];

function fmtQtd(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

export default function PosicaoEstoquePage() {
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [itens, setItens] = useState<EstoqueItem[] | null>(null);
  const [periodo, setPeriodo] = useState("");
  const [procSegundos, setProcSegundos] = useState(0);

  // Cronômetro do processamento (status em percentual, estilo sincronismo).
  useEffect(() => {
    if (!carregando) {
      setProcSegundos(0);
      return;
    }
    const inicio = Date.now();
    const id = setInterval(() => setProcSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(id);
  }, [carregando]);

  async function executar() {
    setCarregando(true);
    setErro("");
    setItens(null);
    try {
      const res = await fetch(`/api/omie/estoque?competencia=${competencia}`);
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao consultar a posição de estoque.");
        return;
      }
      setItens(data.itens ?? []);
      setPeriodo(data.periodo ?? "");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  function exportar() {
    if (!itens) return;
    const linhas = itens.map((i) => [
      i.codigo, i.descricao, i.ncm, i.tipoSped, i.familia, i.unidade,
      i.quantidade, i.cmcUnitario, i.cmcTotal, i.periodo,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas]);
    ws["!cols"] = [
      { wch: 16 }, { wch: 52 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
      { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posição de Estoque");
    XLSX.writeFile(wb, `Estoque_${competencia}.xlsx`);
  }

  const totalCMC = itens?.reduce((s, i) => s + i.cmcTotal, 0) ?? 0;

  return (
    <div>
      <PageHeader
        titulo="Posição de Estoque"
        subtitulo="Saldo e custo médio (CMC) por produto na data — export para contabilidade"
        acoes={
          <div className="flex items-center gap-2">
            <SeletorMes value={competencia} onChange={(v) => { setCompetencia(v); setItens(null); }} />
            <button
              onClick={executar}
              disabled={carregando}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {carregando ? "Processando…" : "Executar"}
            </button>
            {itens && itens.length > 0 && (
              <button
                onClick={exportar}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> Exportar XLSX
              </button>
            )}
          </div>
        }
      />

      {erro && <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</div>}

      {carregando && (() => {
        const etapas = [
          "Consultando o cadastro de produtos no Omie…",
          "Consultando a posição de estoque na data…",
          "Cruzando dados e montando o relatório…",
        ];
        const limites = [0, 35, 70];
        const etapaAtual = limites.reduce((acc, t, i) => (procSegundos >= t ? i : acc), 0);
        const pct = Math.min(95, Math.round((procSegundos / 90) * 95));
        const mm = String(Math.floor(procSegundos / 60)).padStart(2, "0");
        const ss = String(procSegundos % 60).padStart(2, "0");
        return (
          <div className="card card-pad">
            <div className="flex items-start gap-3">
              <Boxes className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">Processando posição de estoque…</span>
                  <span className="text-sm tabular-nums text-slate-500">{mm}:{ss}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-2xl font-bold tabular-nums text-brand-700">{pct}%</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {etapas.map((txt, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {i < etapaAtual ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span>
                      ) : i === etapaAtual ? (
                        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200" />
                      )}
                      <span className={i <= etapaAtual ? "text-slate-700" : "text-slate-400"}>{txt}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Pode levar alguns minutos (o cadastro de produtos é grande). Não feche a página.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {!itens && !carregando && !erro && (
        <div className="card flex flex-col items-center gap-4 py-20 text-center">
          <Boxes className="h-12 w-12 text-brand-300" />
          <p className="text-sm text-slate-400">
            Selecione o mês e clique em <strong className="text-slate-600">Executar</strong> para
            gerar a posição de estoque (saldo no último dia do mês).
          </p>
        </div>
      )}

      {itens && !carregando && (
        itens.length === 0 ? (
          <div className="card flex flex-col items-center gap-4 py-20 text-center">
            <FileX className="h-12 w-12 text-slate-300" />
            <p className="text-sm text-slate-400">Nenhum produto com saldo nesse período.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <span>
                <strong>{itens.length}</strong> produtos · Período <strong>{periodo}</strong>
              </span>
              <span>
                CMC Total: <strong className="tabular-nums">{formatarMoeda(totalCMC)}</strong>
              </span>
            </div>
            <div className="card overflow-hidden">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2.5 font-medium">Código</th>
                      <th className="px-3 py-2.5 font-medium">Descrição</th>
                      <th className="px-3 py-2.5 font-medium">NCM</th>
                      <th className="px-3 py-2.5 font-medium">Tipo SPED</th>
                      <th className="px-3 py-2.5 font-medium">Família</th>
                      <th className="px-3 py-2.5 font-medium">Un.</th>
                      <th className="px-3 py-2.5 text-right font-medium">Quantidade</th>
                      <th className="px-3 py-2.5 text-right font-medium">CMC Unit.</th>
                      <th className="px-3 py-2.5 text-right font-medium">CMC Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i, idx) => (
                      <tr key={`${i.codigo}-${idx}`} className="border-b border-slate-100 last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{i.codigo}</td>
                        <td className="max-w-[340px] truncate px-3 py-1.5 text-slate-600" title={i.descricao}>{i.descricao}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{i.ncm}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{i.tipoSped}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{i.familia}</td>
                        <td className="px-3 py-1.5 text-slate-500">{i.unidade}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtQtd(i.quantidade)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-600">{i.cmcUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">{formatarMoeda(i.cmcTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-50">
                    <tr className="border-t border-slate-200 font-semibold text-slate-800">
                      <td className="px-3 py-2.5" colSpan={8}>Total ({itens.length})</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(totalCMC)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
