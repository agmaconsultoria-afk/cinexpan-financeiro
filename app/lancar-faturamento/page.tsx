"use client";

import { useRef, useMemo, useState } from "react";
import { Plus, Save, Upload } from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";
import { rotuloMesAno } from "@/lib/rastreio/logic";
import { formatarMoeda } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";

// Campo de moeda: exibe em pt-BR (1.234,56) e fica editável ao focar.
function CampoMoeda({
  valor,
  onSalvar,
}: {
  valor: number;
  onSalvar: (n: number) => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);

  const formatado = valor
    ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";

  function salvar() {
    if (edit !== null) {
      const n = parseFloat(edit.replace(/\./g, "").replace(",", "."));
      onSalvar(isNaN(n) ? 0 : n);
    }
    setEdit(null);
  }

  return (
    <input
      value={edit ?? formatado}
      onFocus={(e) => {
        setEdit(valor ? String(valor).replace(".", ",") : "");
        const el = e.target;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="0,00"
      inputMode="decimal"
      className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
  );
}

export default function LancarFaturamentoPage() {
  const { faturamento, setFaturamentoMes, vendasPF, setVendasPFMes, faturamentoOmie, carregarDoBanco } = useRastreio();
  const [novoMes, setNovoMes] = useState(() => new Date().toISOString().slice(0, 7));
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function importarXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    setMsgImport(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      const res = await fetch("/api/rastreio/importar-faturamento", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        setMsgImport({ tipo: "ok", texto: `${data.importados} ${data.importados === 1 ? "mês importado" : "meses importados"} com sucesso.` });
        await carregarDoBanco();
      } else {
        setMsgImport({ tipo: "erro", texto: data.erro ?? "Erro ao importar." });
      }
    } catch {
      setMsgImport({ tipo: "erro", texto: "Erro de conexão. Tente novamente." });
    } finally {
      setImportando(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  // Lista de competências: anos de 2025/2026 pré-carregados + o que já existe.
  const meses = useMemo(() => {
    const set = new Set<string>([...Object.keys(faturamento), ...Object.keys(vendasPF)]);
    for (const ano of [2025, 2026]) {
      for (let m = 1; m <= 12; m++) set.add(`${ano}-${String(m).padStart(2, "0")}`);
    }
    return Array.from(set)
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort()
      .reverse(); // mais recentes no topo
  }, [faturamento, vendasPF]);

  function adicionarMes() {
    if (/^\d{4}-\d{2}$/.test(novoMes) && faturamento[novoMes] == null) {
      setFaturamentoMes(novoMes, 0);
    }
    setNovoMes("");
  }

  const totalFat = meses.reduce((a, m) => a + (faturamento[m] ?? 0), 0);
  const totalPF = meses.reduce((a, m) => a + (vendasPF[m] ?? 0), 0);
  const temOmie = meses.some((m) => faturamentoOmie[m] != null);

  return (
    <div>
      <PageHeader
        titulo="Lançar Faturamento"
        subtitulo="Faturamento do mês e Vendas PF por competência (base do % rastreado)"
        acoes={
          <div className="flex items-center gap-2">
            <input
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={importarXlsx}
            />
            <button
              onClick={() => inputArquivo.current?.click()}
              disabled={importando}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {importando ? "Importando..." : "Importar XLSX"}
            </button>
            <SeletorMes value={novoMes} onChange={setNovoMes} />
            <button
              onClick={adicionarMes}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Adicionar mês
            </button>
          </div>
        }
      />

      {msgImport && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            msgImport.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {msgImport.texto}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Save className="h-4 w-4 text-brand-600" />
          <span className="text-sm text-slate-600">
            As alterações são salvas automaticamente neste navegador.
          </span>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">Competência</th>
                <th className="px-3 py-3 text-right font-medium">Faturamento do mês (R$)</th>
                {temOmie && <th className="px-3 py-3 text-right font-medium">Faturamento Omie (R$)</th>}
                {temOmie && <th className="px-3 py-3 text-right font-medium">Diferença</th>}
                <th className="px-3 py-3 text-right font-medium">Vendas PF (R$)</th>
                <th className="w-full" />
              </tr>
            </thead>
            <tbody>
              {meses.length === 0 && (
                <tr>
                  <td colSpan={temOmie ? 6 : 4} className="px-5 py-8 text-center text-slate-400">
                    Nenhuma competência lançada. Use "Adicionar mês" para começar.
                  </td>
                </tr>
              )}
              {meses.map((m) => {
                const omie = faturamentoOmie[m];
                const manual = faturamento[m] ?? 0;
                const diff = omie != null ? omie - manual : null;
                const diffCor = diff == null ? "" : diff !== 0 && diff > 0 ? "text-emerald-600" : diff !== 0 ? "text-rose-600" : "text-slate-500";
                const diffLabel = diff == null ? "—" : diff === 0 ? "=" : (diff > 0 ? "+" : "") + formatarMoeda(diff);
                return (
                  <tr key={m} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-5 py-2 font-medium capitalize text-slate-700">
                      {rotuloMesAno(m)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CampoMoeda
                        valor={manual}
                        onSalvar={(n) => setFaturamentoMes(m, n)}
                      />
                    </td>
                    {temOmie && (
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">
                        {omie != null ? formatarMoeda(omie) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {temOmie && (
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-sm font-medium ${diffCor}`}>
                        <span className={diff == null ? "text-slate-300" : ""}>{diffLabel}</span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <CampoMoeda valor={vendasPF[m] ?? 0} onSalvar={(n) => setVendasPFMes(m, n)} />
                    </td>
                    <td className="w-full" />
                  </tr>
                );
              })}
            </tbody>
            {meses.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-50">
                <tr className="border-t border-slate-200 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(totalFat)}</td>
                  {temOmie && <td colSpan={2} />}
                  <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(totalPF)}</td>
                  <td className="w-full" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        O <strong>Faturamento do mês</strong> é o denominador do "% rastreado" no Rastreio de
        Faturamento. As <strong>Vendas PF</strong> (consumidor final) entram no total rastreado.
        Esses valores também podem ser editados direto na tela do Rastreio, clicando sobre eles.
      </p>
    </div>
  );
}
