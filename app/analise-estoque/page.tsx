"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, PackageSearch, Play } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { EstoqueVendaChart, PontoEstoqueVenda } from "@/components/Charts";
import { formatarMoeda, rotuloMes } from "@/lib/format";

interface PosicaoResumo {
  competencia: string;
  dataPosicao: string;
  periodo: string | null;
  totalItens: number;
  totalCmc: number;
  geradoEm: string;
}

interface AnaliseMes {
  competencia: string;
  cmv: number;
  vendas: number;
  estoqueCusto: number;
  estoquePrecoVenda: number;
  qtdeEstoque: number;
  qtdeVendida: number;
  totalNFs: number;
  geradoEm: string;
}

interface Linha {
  competencia: string;
  estoqueCusto: number;
  cmv: number | null;
  vendas: number;
  giro: number | null; // Estoque (custo) ÷ CMV
  cobertura: number | null; // Qtde estoque ÷ Qtde vendida
  markup: number | null; // Vendas ÷ CMV
  processado: boolean;
}

export default function AnaliseEstoquePage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [posicoes, setPosicoes] = useState<PosicaoResumo[]>([]);
  const [analises, setAnalises] = useState<AnaliseMes[]>([]);
  const [faturamento, setFaturamento] = useState<Record<string, number>>({});
  const [vendasPF, setVendasPF] = useState<Record<string, number>>({});
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/estoque/analise");
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao carregar a análise.");
        return;
      }
      setPosicoes(data.posicoes ?? []);
      setAnalises(data.analises ?? []);
      setFaturamento(data.faturamento ?? {});
      setVendasPF(data.vendasPF ?? {});
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function processar(competencia: string) {
    setProcessando(competencia);
    setErro("");
    try {
      const res = await fetch(`/api/estoque/processar?competencia=${competencia}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao processar o mês.");
        return;
      }
      await carregar();
    } catch {
      setErro("Erro de conexão ao processar. Tente novamente.");
    } finally {
      setProcessando(null);
    }
  }

  const linhas = useMemo<Linha[]>(() => {
    const ordenadas = [...posicoes].sort((a, b) => a.competencia.localeCompare(b.competencia));
    const mapA = new Map(analises.map((a) => [a.competencia, a]));
    return ordenadas.map((p) => {
      const a = mapA.get(p.competencia);
      const estoqueCusto = a ? a.estoqueCusto : p.totalCmc;
      const vendas = a ? a.vendas : (faturamento[p.competencia] || 0) + (vendasPF[p.competencia] || 0);
      return {
        competencia: p.competencia,
        estoqueCusto,
        cmv: a ? a.cmv : null,
        vendas,
        // Giro = Estoque (custo) ÷ CMV.
        giro: a && a.cmv > 0 ? a.estoqueCusto / a.cmv : null,
        // Cobertura = Qtde em estoque ÷ Qtde vendida (volume m³).
        cobertura: a && a.qtdeVendida > 0 ? a.qtdeEstoque / a.qtdeVendida : null,
        // Markup = Vendas ÷ CMV.
        markup: a && a.cmv > 0 ? a.vendas / a.cmv : null,
        processado: Boolean(a),
      };
    });
  }, [posicoes, analises, faturamento, vendasPF]);

  const dadosGrafico = useMemo<PontoEstoqueVenda[]>(
    () =>
      linhas.map((l) => ({
        rotulo: rotuloMes(l.competencia),
        estoque: l.estoqueCusto,
        venda: l.vendas,
        markup: l.markup ?? 0,
      })),
    [linhas]
  );

  return (
    <div>
      <PageHeader
        titulo="Análise de Estoque × Venda"
        subtitulo="Giro, cobertura e markup da argila a partir das posições salvas"
        acoes={
          <button
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      {erro && <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{erro}</div>}

      {!carregando && posicoes.length === 0 && !erro && (
        <div className="card flex flex-col items-center gap-4 py-20 text-center">
          <PackageSearch className="h-12 w-12 text-brand-300" />
          <p className="max-w-md text-sm text-slate-400">
            Nenhuma posição de estoque salva ainda. Vá em{" "}
            <strong className="text-slate-600">Posição de Estoque</strong>, selecione um mês e clique
            em <strong className="text-slate-600">Executar</strong>. Cada execução grava a posição
            daquele mês aqui, formando a base da análise.
          </p>
        </div>
      )}

      {linhas.length > 0 && (
        <>
          <div className="card card-pad mb-6">
            <div className="mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-700">Estoque (a custo) × Venda por mês</h2>
            </div>
            <EstoqueVendaChart dados={dadosGrafico} />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Competência</th>
                    <th className="px-3 py-2.5 text-right font-medium">Estoque (custo)</th>
                    <th className="px-3 py-2.5 text-right font-medium">CMV</th>
                    <th className="px-3 py-2.5 text-right font-medium">Vendas</th>
                    <th className="px-3 py-2.5 text-right font-medium">Giro</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cobertura</th>
                    <th className="px-3 py-2.5 text-right font-medium">Markup</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.competencia} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{rotuloMes(l.competencia)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">{formatarMoeda(l.estoqueCusto)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{l.cmv != null ? formatarMoeda(l.cmv) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{l.vendas > 0 ? formatarMoeda(l.vendas) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-700">{l.giro != null ? `${l.giro.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{l.cobertura != null ? `${l.cobertura.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{l.markup != null ? `${l.markup.toFixed(2)}×` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => processar(l.competencia)}
                          disabled={processando !== null}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {processando === l.competencia ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          {l.processado ? "Reprocessar" : "Processar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 space-y-1 text-xs text-slate-400">
            <p><strong className="text-slate-500">Giro</strong> = Estoque (custo) ÷ CMV — meses de estoque que o custo vendido no mês representa.</p>
            <p><strong className="text-slate-500">Cobertura</strong> = Qtde em estoque ÷ Qtde vendida (em volume, m³) — meses de venda que o estoque cobre.</p>
            <p><strong className="text-slate-500">Markup</strong> = Vendas ÷ CMV.</p>
            <p>
              CMV, estoque e quantidades consideram só a <strong className="text-slate-500">argila</strong> (produto acabado + em processo),
              custeada a granel (matéria-prima) por volume. Clique em <strong className="text-slate-500">Processar</strong> para calcular o mês (busca as NFs no Omie).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
