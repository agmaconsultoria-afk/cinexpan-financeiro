"use client";

import { useState } from "react";
import { Search, Receipt, FileX } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { formatarMoeda, formatarData } from "@/lib/format";
import { DollarSign, Package, Hash, Layers } from "lucide-react";

interface NotaFiscalItem {
  dataEmissao: string;
  nf: string;
  serie: string;
  clienteNome: string;
  clienteDoc: string;
  produto: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  totalMercadoria: number;
  operacao: string;
  situacao: string;
  tags: string;
  cfop: string;
}

function formatarQtd(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FaturamentoNFPage() {
  const [competencia, setCompetencia] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [itens, setItens] = useState<NotaFiscalItem[]>([]);
  const [totalNFs, setTotalNFs] = useState(0);
  const [truncado, setTruncado] = useState(false);
  const [buscou, setBuscou] = useState(false);

  async function buscar() {
    setCarregando(true);
    setErro("");
    setBuscou(false);
    try {
      const res = await fetch(`/api/omie/notas-fiscais?competencia=${competencia}`);
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao buscar notas fiscais.");
        return;
      }
      setItens(data.itens ?? []);
      setTotalNFs(data.totalNFs ?? 0);
      setTruncado(data.truncado ?? false);
      setBuscou(true);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const totalQtd = itens.reduce((s, i) => s + i.quantidade, 0);
  const totalMerc = itens.reduce((s, i) => s + i.totalMercadoria, 0);
  const nfsUnicas = new Set(itens.map((i) => i.nf)).size;

  return (
    <div>
      <PageHeader
        titulo="Faturamento por NF"
        subtitulo="Notas fiscais de saída emitidas no Omie"
        acoes={
          <div className="flex items-center gap-2">
            <SeletorMes value={competencia} onChange={setCompetencia} />
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

      {buscou && (
        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            titulo="NFs emitidas"
            valor={String(nfsUnicas)}
            icone={Hash}
            cor="azul"
            legenda={totalNFs > nfsUnicas ? `de ${totalNFs} encontradas` : undefined}
          />
          <KpiCard
            titulo="Itens"
            valor={String(itens.length)}
            icone={Layers}
            cor="roxo"
            legenda="linhas de produto"
          />
          <KpiCard
            titulo="Quantidade total"
            valor={formatarQtd(totalQtd)}
            icone={Package}
            cor="ambar"
          />
          <KpiCard
            titulo="Total de mercadoria"
            valor={formatarMoeda(totalMerc)}
            icone={DollarSign}
            cor="verde"
          />
        </div>
      )}

      {erro && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</div>
      )}

      {truncado && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          Resultado truncado — nem todas as páginas foram carregadas. Refine o período para ver todos os registros.
        </div>
      )}

      <div className="card overflow-hidden">
        {!buscou && !carregando && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <Receipt className="h-12 w-12 text-brand-300" />
            <p className="text-sm text-slate-400">
              Selecione o mês e clique em{" "}
              <strong className="text-slate-600">Buscar do Omie</strong> para carregar as notas fiscais.
            </p>
          </div>
        )}

        {carregando && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            <p className="text-sm text-slate-400">Consultando o Omie…</p>
          </div>
        )}

        {buscou && !carregando && itens.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <FileX className="h-12 w-12 text-slate-300" />
            <p className="text-sm text-slate-400">Nenhuma nota fiscal encontrada para este período.</p>
          </div>
        )}

        {buscou && !carregando && itens.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="whitespace-nowrap px-3 py-3">Data Emissão</th>
                  <th className="whitespace-nowrap px-3 py-3">NF</th>
                  <th className="whitespace-nowrap px-3 py-3">Cliente</th>
                  <th className="whitespace-nowrap px-3 py-3">Produto</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">Qtd</th>
                  <th className="whitespace-nowrap px-3 py-3">Unid</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">Vl. Unit.</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">Total Merc.</th>
                  <th className="whitespace-nowrap px-3 py-3">Operação</th>
                  <th className="whitespace-nowrap px-3 py-3">Situação</th>
                  <th className="whitespace-nowrap px-3 py-3">Tags</th>
                  <th className="whitespace-nowrap px-3 py-3">CFOP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">
                      {item.dataEmissao ? formatarData(item.dataEmissao) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-700">
                      {item.nf}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2.5 text-slate-700"
                      title={item.clienteNome}
                    >
                      {item.clienteNome || item.clienteDoc || "—"}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-3 py-2.5 text-slate-600"
                      title={item.produto}
                    >
                      {item.produto || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatarQtd(item.quantidade)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{item.unidade}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatarMoeda(item.valorUnitario)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                      {formatarMoeda(item.totalMercadoria)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                      {item.operacao || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.situacao === "Autorizado"
                            ? "bg-emerald-50 text-emerald-700"
                            : item.situacao === "Cancelado"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.situacao}
                      </span>
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2.5 text-slate-500"
                      title={item.tags}
                    >
                      {item.tags || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                      {item.cfop || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-sm">
                    Total — {itens.length} {itens.length === 1 ? "item" : "itens"} em{" "}
                    {nfsUnicas} {nfsUnicas === 1 ? "NF" : "NFs"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {formatarQtd(totalQtd)}
                  </td>
                  <td />
                  <td />
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {formatarMoeda(totalMerc)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
