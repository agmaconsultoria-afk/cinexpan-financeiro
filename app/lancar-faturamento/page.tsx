"use client";

import { useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";
import { rotuloMesAno } from "@/lib/rastreio/logic";
import { formatarMoeda } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";

// Campo de moeda editável (pt-BR) com salvamento ao sair/Enter.
function CampoMoeda({
  valor,
  onSalvar,
}: {
  valor: number;
  onSalvar: (n: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);

  const exibicao = texto ?? (valor ? valor.toString().replace(".", ",") : "");

  function salvar() {
    if (texto === null) return;
    const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
    onSalvar(isNaN(n) ? 0 : n);
    setTexto(null);
  }

  return (
    <input
      value={exibicao}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="0,00"
      inputMode="decimal"
      className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
  );
}

export default function LancarFaturamentoPage() {
  const { faturamento, setFaturamentoMes, vendasPF, setVendasPFMes } = useRastreio();
  const [novoMes, setNovoMes] = useState(() => new Date().toISOString().slice(0, 7));

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

  return (
    <div>
      <PageHeader
        titulo="Lançar Faturamento"
        subtitulo="Faturamento do mês e Vendas PF por competência (base do % rastreado)"
        acoes={
          <div className="flex items-center gap-2">
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

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Save className="h-4 w-4 text-brand-600" />
          <span className="text-sm text-slate-600">
            As alterações são salvas automaticamente neste navegador.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">Competência</th>
                <th className="px-5 py-3 text-right font-medium">Faturamento do mês (R$)</th>
                <th className="px-5 py-3 text-right font-medium">Vendas PF (R$)</th>
              </tr>
            </thead>
            <tbody>
              {meses.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                    Nenhuma competência lançada. Use “Adicionar mês” para começar.
                  </td>
                </tr>
              )}
              {meses.map((m) => (
                <tr key={m} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium capitalize text-slate-700">
                    {rotuloMesAno(m)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <CampoMoeda
                      valor={faturamento[m] ?? 0}
                      onSalvar={(n) => setFaturamentoMes(m, n)}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <CampoMoeda valor={vendasPF[m] ?? 0} onSalvar={(n) => setVendasPFMes(m, n)} />
                  </td>
                </tr>
              ))}
            </tbody>
            {meses.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatarMoeda(totalFat)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatarMoeda(totalPF)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        O <strong>Faturamento do mês</strong> é o denominador do “% rastreado” no Rastreio de
        Faturamento. As <strong>Vendas PF</strong> (consumidor final) entram no total rastreado.
        Esses valores também podem ser editados direto na tela do Rastreio, clicando sobre eles.
      </p>
    </div>
  );
}
