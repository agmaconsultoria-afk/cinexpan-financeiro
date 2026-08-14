"use client";

import { Fragment, useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";
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

// Agrupamento contábil (cópia fiel do relatório): Produto Acabado agrega os
// tipos SPED 04-Produto Acabado e 03-Produto em Processo; depois Embalagens
// (02) e Matéria Prima (01). A ordem dos tipos dentro de cada grupo define a
// ordem de exibição das linhas (04 antes de 03).
const GRUPOS: { label: string; tipos: string[] }[] = [
  { label: "Produto Acabado", tipos: ["04", "03"] },
  { label: "Embalagens", tipos: ["02"] },
  { label: "Matéria Prima", tipos: ["01"] },
];

function fmtQtd(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

interface GrupoEstoque {
  label: string;
  linhas: EstoqueItem[];
  totalQtd: number;
  totalCMC: number;
}

function agruparPorSped(itens: EstoqueItem[]): GrupoEstoque[] {
  return GRUPOS.map((g) => {
    const linhas = itens
      .filter((i) => g.tipos.includes((i.tipoSped || "").slice(0, 2)))
      .sort((a, b) => {
        const ta = g.tipos.indexOf((a.tipoSped || "").slice(0, 2));
        const tb = g.tipos.indexOf((b.tipoSped || "").slice(0, 2));
        if (ta !== tb) return ta - tb;
        return a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
      });
    return {
      label: g.label,
      linhas,
      totalQtd: linhas.reduce((s, i) => s + i.quantidade, 0),
      totalCMC: linhas.reduce((s, i) => s + i.cmcTotal, 0),
    };
  }).filter((g) => g.linhas.length > 0);
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
    const grupos = agruparPorSped(itens);
    // Linha de subtotal/total: rótulo alinhado sob "Unidade", com Quantidade
    // e CMC Total preenchidos (mesma posição do relatório impresso).
    const linhaTotal = (rotulo: string, qtd: number, cmc: number) =>
      ["", "", "", "", "", rotulo, qtd, "", cmc, ""];

    const linhas: (string | number)[][] = [];
    const linhasSubtotal = new Set<number>(); // índices (base sheet) das linhas de subtotal
    let r = 1; // linha 0 = cabeçalho
    for (const g of grupos) {
      for (const i of g.linhas) {
        linhas.push([
          i.codigo, i.descricao, i.ncm, i.tipoSped, i.familia, i.unidade,
          i.quantidade, i.cmcUnitario, i.cmcTotal, i.periodo,
        ]);
        r++;
      }
      linhas.push(linhaTotal(`Total ${g.label}`, g.totalQtd, g.totalCMC));
      linhasSubtotal.add(r);
      r++;
    }
    linhas.push([]);
    r++;
    const totalGeralQtd = grupos.reduce((s, g) => s + g.totalQtd, 0);
    const totalGeralCMC = grupos.reduce((s, g) => s + g.totalCMC, 0);
    linhas.push(linhaTotal("TOTAL ESTOQUE", totalGeralQtd, totalGeralCMC));
    const linhaTotalGeral = r;

    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas]);
    ws["!cols"] = [
      { wch: 16 }, { wch: 52 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
      { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    ];

    // --- Formatação (cópia fiel do relatório: amarelo no cabeçalho, subtotais
    // e total; grade fina em todas as células; números pt-BR). ---
    const AMARELO = "FFFF00";
    const AMARELO_CLARO = "FFF2B2";
    const borda = { style: "thin", color: { rgb: "BFBF00" } };
    const bordas = { top: borda, bottom: borda, left: borda, right: borda };
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let R = range.s.r; R <= range.e.r; R++) {
      const ehCabecalho = R === 0;
      const ehSubtotal = linhasSubtotal.has(R);
      const ehTotal = R === linhaTotalGeral;
      for (let C = range.s.c; C <= range.e.c; C++) {
        const ref = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[ref];
        if (!cell) continue;
        // Formato de número: Quantidade (col 6), CMC Unit (7), CMC Total (8).
        if (typeof cell.v === "number") {
          if (C === 6) cell.z = "#,##0.00";
          else if (C === 7 || C === 8) cell.z = "#,##0.00";
        }
        const fill = ehCabecalho || ehTotal
          ? AMARELO
          : ehSubtotal
          ? AMARELO_CLARO
          : undefined;
        cell.s = {
          ...(fill ? { fill: { fgColor: { rgb: fill } } } : {}),
          font: { bold: ehCabecalho || ehSubtotal || ehTotal, sz: 10 },
          alignment: { vertical: "center", horizontal: C >= 6 ? "right" : "left", wrapText: false },
          border: bordas,
        };
      }
    }
    ws["!rows"] = Array.from({ length: range.e.r + 1 }, () => ({ hpt: 15 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posição de Estoque");
    XLSX.writeFile(wb, `Estoque_${competencia}.xlsx`);
  }

  const grupos = itens ? agruparPorSped(itens) : [];
  const totalCMC = grupos.reduce((s, g) => s + g.totalCMC, 0);
  const totalQtd = grupos.reduce((s, g) => s + g.totalQtd, 0);

  return (
    <div>
      <PageHeader
        titulo="Posição de Estoque"
        subtitulo="Saldo e custo médio oficial do Omie (CMC) na data da posição — export para contabilidade"
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
            <p className="mb-4 text-xs text-slate-400">
              CMC = custo médio oficial do Omie na data da posição ({periodo}). Saldo negativo não entra no cálculo.
            </p>
            <div className="card overflow-hidden">
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="sticky top-0 z-10 bg-amber-100">
                    <tr className="border-b border-amber-200 text-left text-slate-700">
                      <th className="px-3 py-2.5 font-semibold">Código do Produto</th>
                      <th className="px-3 py-2.5 font-semibold">Descrição (completa)</th>
                      <th className="px-3 py-2.5 font-semibold">Código NCM</th>
                      <th className="px-3 py-2.5 font-semibold">Tipo do Produto (SPED)</th>
                      <th className="px-3 py-2.5 font-semibold">Família de Produto</th>
                      <th className="px-3 py-2.5 font-semibold">Unidade</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Quantidade</th>
                      <th className="px-3 py-2.5 text-right font-semibold">CMC Unitário</th>
                      <th className="px-3 py-2.5 text-right font-semibold">CMC Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <Fragment key={g.label}>
                        {g.linhas.map((i, idx) => (
                          <tr key={`${i.codigo}-${idx}`} className="border-b border-slate-100">
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
                        <tr className="border-y border-amber-200 bg-amber-50 font-semibold text-slate-800">
                          <td className="px-3 py-2 text-right" colSpan={6}>Total {g.label}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtQtd(g.totalQtd)}</td>
                          <td className="px-3 py-2" />
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatarMoeda(g.totalCMC)}</td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-amber-200">
                    <tr className="border-t-2 border-amber-300 font-bold text-slate-900">
                      <td className="px-3 py-2.5 text-right" colSpan={6}>TOTAL ESTOQUE</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmtQtd(totalQtd)}</td>
                      <td className="px-3 py-2.5" />
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatarMoeda(totalCMC)}</td>
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
