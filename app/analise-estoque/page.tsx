"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { EstoqueVendaChart, PontoEstoqueVenda } from "@/components/Charts";
import { formatarMoeda, rotuloMes, formatarData } from "@/lib/format";

interface PosicaoResumo {
  competencia: string;
  dataPosicao: string;
  periodo: string | null;
  totalItens: number;
  totalCmc: number;
  geradoEm: string;
}

interface LinhaAnalise {
  competencia: string;
  dataPosicao: string;
  totalItens: number;
  estoqueFinal: number;
  estoqueMedio: number;
  venda: number;
  giro: number; // Venda ÷ Estoque médio (aprox.)
  coberturaDias: number; // dias de venda cobertos pelo estoque médio
  geradoEm: string;
}

export default function AnaliseEstoquePage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [posicoes, setPosicoes] = useState<PosicaoResumo[]>([]);
  const [faturamento, setFaturamento] = useState<Record<string, number>>({});
  const [vendasPF, setVendasPF] = useState<Record<string, number>>({});

  async function carregar() {
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
      setFaturamento(data.faturamento ?? {});
      setVendasPF(data.vendasPF ?? {});
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const linhas = useMemo<LinhaAnalise[]>(() => {
    const ordenadas = [...posicoes].sort((a, b) => a.competencia.localeCompare(b.competencia));
    return ordenadas.map((p, i) => {
      const anterior = ordenadas[i - 1];
      const estoqueFinal = p.totalCmc;
      const estoqueMedio = anterior ? (anterior.totalCmc + estoqueFinal) / 2 : estoqueFinal;
      const venda = (faturamento[p.competencia] || 0) + (vendasPF[p.competencia] || 0);
      const giro = estoqueMedio > 0 ? venda / estoqueMedio : 0;
      const coberturaDias = venda > 0 ? (estoqueMedio / venda) * 30 : 0;
      return {
        competencia: p.competencia,
        dataPosicao: p.dataPosicao,
        totalItens: p.totalItens,
        estoqueFinal,
        estoqueMedio,
        venda,
        giro,
        coberturaDias,
        geradoEm: p.geradoEm,
      };
    });
  }, [posicoes, faturamento, vendasPF]);

  const dadosGrafico = useMemo<PontoEstoqueVenda[]>(
    () =>
      linhas.map((l) => ({
        rotulo: rotuloMes(l.competencia),
        estoque: l.estoqueFinal,
        venda: l.venda,
        giro: l.giro,
      })),
    [linhas]
  );

  return (
    <div>
      <PageHeader
        titulo="Análise de Estoque × Venda"
        subtitulo="Giro de estoque e custo médio a partir das posições salvas"
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
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Competência</th>
                    <th className="px-3 py-2.5 font-medium">Posição</th>
                    <th className="px-3 py-2.5 text-right font-medium">Itens</th>
                    <th className="px-3 py-2.5 text-right font-medium">Estoque final (custo)</th>
                    <th className="px-3 py-2.5 text-right font-medium">Estoque médio</th>
                    <th className="px-3 py-2.5 text-right font-medium">Venda do mês</th>
                    <th className="px-3 py-2.5 text-right font-medium">Giro</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cobertura (dias)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.competencia} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{rotuloMes(l.competencia)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{l.dataPosicao}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.totalItens}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">{formatarMoeda(l.estoqueFinal)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{formatarMoeda(l.estoqueMedio)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{l.venda > 0 ? formatarMoeda(l.venda) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{l.venda > 0 ? `${l.giro.toFixed(2)}x` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.coberturaDias > 0 ? `${l.coberturaDias.toFixed(0)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 space-y-1 text-xs text-slate-400">
            <p>
              <strong className="text-slate-500">Estoque médio</strong> = (estoque do mês anterior + estoque do mês) ÷ 2,
              a partir das posições salvas.
            </p>
            <p>
              <strong className="text-slate-500">Giro</strong> = Venda do mês ÷ Estoque médio (aproximado: usa a venda/faturamento;
              o giro contábil preciso usa o CMV — custo da mercadoria vendida — que definiremos na próxima etapa).
            </p>
            <p>
              <strong className="text-slate-500">Cobertura (dias)</strong> = Estoque médio ÷ (Venda do mês ÷ 30):
              quantos dias de venda o estoque cobre.
            </p>
            <p>Atualizado a partir das posições gravadas em cada execução. Última carga: {formatarData(new Date().toISOString())}.</p>
          </div>
        </>
      )}
    </div>
  );
}
