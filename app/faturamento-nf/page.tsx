"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Receipt, FileX, PencilLine } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { formatarMoeda } from "@/lib/format";
import { DollarSign, Hash } from "lucide-react";

export default function FaturamentoNFPage() {
  const router = useRouter();
  const [competencia, setCompetencia] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [totalNFs, setTotalNFs] = useState<number | null>(null);
  const [totalMerc, setTotalMerc] = useState<number | null>(null);
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
      const itens: { totalMercadoria: number; nf: string }[] = data.itens ?? [];
      setTotalNFs(new Set(itens.map((i) => i.nf)).size);
      setTotalMerc(itens.reduce((s, i) => s + i.totalMercadoria, 0));
      setBuscou(true);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

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

          <div className="card flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="font-medium text-slate-800">Lançar faturamento</p>
              <p className="text-sm text-slate-500">Registre manualmente os dados de faturamento no sistema.</p>
            </div>
            <button
              onClick={() => router.push("/lancar-faturamento")}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <PencilLine className="h-4 w-4" />
              Ir para Lançar Faturamento
            </button>
          </div>
        </>
      )}
    </div>
  );
}
