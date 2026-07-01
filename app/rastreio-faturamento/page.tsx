"use client";

import { useCallback, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Printer,
  AlertTriangle,
  Pencil,
  Check,
  Cloud,
  X,
  Activity,
} from "lucide-react";
import { useRastreio } from "@/lib/rastreio/context";
import { montarDemonstrativo, rotuloMesAno, rotuloMesExtenso } from "@/lib/rastreio/logic";
import { formatarMoeda, formatarPercent, formatarData } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SeletorMes } from "@/components/SeletorMes";
import { ContaDerivada, Visao } from "@/lib/rastreio/types";
import { useSessao } from "@/components/SessionProvider";
import { podeEditar } from "@/lib/auth/roles";
import { RastreioRelatorioChart } from "@/components/Charts";

type Coluna = "falta" | "recebido" | "descontos" | "juros" | "atrasado";

interface DiagNF {
  nf: string;
  cliente: string;
  total: number;
  situacao?: string;
}
interface DiagResultado {
  totalFaturado: number;
  totalContas: number;
  qtdFaturadas: number;
  qtdContas: number;
  faturadaSemConta: DiagNF[];
  contaSemFaturada: DiagNF[];
  excluidas: { nf: string; dataEmissao: string; operacao: string; total: number }[];
}

function DiagLista({
  titulo,
  desc,
  itens,
}: {
  titulo: string;
  desc: string;
  itens: { nf: string; texto: string; total: number }[];
}) {
  const total = itens.reduce((a, g) => a + g.total, 0);
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-2.5">
        <div className="font-medium text-slate-700">
          {titulo} <span className="text-slate-400">({itens.length})</span>
        </div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      {itens.length === 0 ? (
        <div className="px-4 py-3 text-xs text-slate-400">Nenhuma divergência.</div>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <tbody>
              {itens.slice(0, 200).map((g, i) => (
                <tr key={`${g.nf}-${i}`} className="border-b border-slate-50 last:border-0">
                  <td className="whitespace-nowrap px-4 py-1.5 text-slate-600">{g.nf}</td>
                  <td className="max-w-[240px] truncate px-3 py-1.5 text-slate-500" title={g.texto}>
                    {g.texto || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-slate-700">
                    {formatarMoeda(g.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-800">
                <td className="px-4 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatarMoeda(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

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
    faturamentoOmie,
    vendasPF,
    setVendasPFMes,
    carregarDoBanco,
  } = useRastreio();

  const { usuario } = useSessao();
  const podeSincronizar = !usuario || podeEditar(usuario.perfil);

  const [aviso, setAviso] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  // Mês a sincronizar do Omie (independente do que já está carregado).
  const [mesOmie, setMesOmie] = useState(() => new Date().toISOString().slice(0, 7));
  // Drill-down: célula clicada (coluna + mês; mês null = total da competência).
  const [detalhe, setDetalhe] = useState<{ col: Coluna; mes: string | null } | null>(null);
  // Diagnóstico contas a receber x faturamento. O limite do gap (em pontos
  // percentuais) é configurável pelo usuário — o botão aparece quando o gap passa dele.
  const [diagCarregando, setDiagCarregando] = useState(false);
  const [diag, setDiag] = useState<DiagResultado | null>(null);
  const [diagErro, setDiagErro] = useState<string | null>(null);
  const [gapLimite, setGapLimite] = useState(5);
  // Relatório consolidado (todas as competências) — visão de impressão.
  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);

  // Mês atual no formato YYYY-MM — para ocultar "Ainda Falta Receber" em meses passados.
  const mesAtual = new Date().toISOString().slice(0, 7);

  const pf = vendasPF[competencia] ?? 0;
  const dem = useMemo(
    () =>
      competencia
        ? montarDemonstrativo(contas, competencia, visao, faturamento, pf, faturamentoOmie)
        : null,
    [contas, competencia, visao, faturamento, pf, faturamentoOmie]
  );

  // Relatório consolidado: uma linha por competência com todas as métricas.
  const relatorio = useMemo(
    () =>
      competencias.map((comp) => {
        const doMes = contas.filter((c) => c.competencia === comp);
        const aReceber = doMes.reduce((a, c) => a + c.valorAReceber, 0);
        const recebido = doMes.reduce((a, c) => a + c.valorRecebidoCalc, 0);
        const atrasado = doMes.reduce((a, c) => a + c.atraso, 0);
        const desconto = doMes.reduce((a, c) => a + c.descontoCalc, 0);
        const juros = doMes.reduce((a, c) => a + c.jurosMulta, 0);
        const rastreado = aReceber + recebido + desconto;
        const fatOmie = (faturamentoOmie[comp] ?? 0) > 0 ? faturamentoOmie[comp] : faturamento[comp] ?? 0;
        const pfMes = vendasPF[comp] ?? 0;
        const base = fatOmie + pfMes;
        const perc = base > 0 ? rastreado / base : 0;
        return { comp, fatOmie, pf: pfMes, base, aReceber, recebido, atrasado, desconto, juros, rastreado, perc };
      }),
    [competencias, contas, faturamentoOmie, faturamento, vendasPF]
  );

  const totaisRel = useMemo(
    () =>
      relatorio.reduce(
        (a, r) => ({
          fatOmie: a.fatOmie + r.fatOmie,
          pf: a.pf + r.pf,
          base: a.base + r.base,
          aReceber: a.aReceber + r.aReceber,
          recebido: a.recebido + r.recebido,
          atrasado: a.atrasado + r.atrasado,
          desconto: a.desconto + r.desconto,
          juros: a.juros + r.juros,
          rastreado: a.rastreado + r.rastreado,
        }),
        { fatOmie: 0, pf: 0, base: 0, aReceber: 0, recebido: 0, atrasado: 0, desconto: 0, juros: 0, rastreado: 0 }
      ),
    [relatorio]
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

  // Diagnóstico ONLINE: busca do Omie, em tempo real, as NFs de venda E as contas
  // a receber da competência — sem usar o cache local. Isso é essencial porque uma
  // NF vendida num mês pode ter sido cancelada/devolvida depois (em outro mês); só
  // consultando o Omio ao vivo essas mudanças aparecem. Cruza os dois lados e aponta
  // as divergências. A sincronização também atualiza a base local.
  async function executarDiagnostico() {
    setDiagCarregando(true);
    setDiag(null);
    setDiagErro(null);
    try {
      const [resNf, resCr] = await Promise.all([
        fetch(`/api/omie/notas-fiscais?competencia=${encodeURIComponent(competencia)}`),
        fetch(`/api/omie/contas-receber?competencia=${encodeURIComponent(competencia)}`),
      ]);
      const dataNf = await resNf.json();
      const dataCr = await resCr.json();
      if (!dataNf.ok) {
        setDiagErro(dataNf.erro ?? "Não foi possível carregar o faturamento do mês.");
        return;
      }
      if (!dataCr.ok) {
        setDiagErro(dataCr.erro ?? "Não foi possível carregar as contas a receber do mês.");
        return;
      }
      const norm = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
      // NFs de venda (faturamento) agregadas por número — já vêm frescas do Omie.
      const nfsFaturadas = new Map<string, DiagNF>();
      for (const it of (dataNf.itens ?? []) as { nf: string; clienteNome?: string; totalMercadoria?: number }[]) {
        const nf = norm(it.nf);
        if (!nf) continue;
        const g = nfsFaturadas.get(nf) ?? { nf, cliente: it.clienteNome ?? "", total: 0 };
        g.total += it.totalMercadoria ?? 0;
        nfsFaturadas.set(nf, g);
      }
      // Contas a receber ONLINE da competência (emissão no mês) agregadas por NF.
      const nfsContas = new Map<string, DiagNF>();
      for (const c of (dataCr.contas ?? []) as { notaFiscal?: string; cliente?: string; valorConta?: number; situacao?: string; dataEmissao?: string }[]) {
        const comp = (c.dataEmissao ?? "").slice(0, 7);
        if (comp && comp !== competencia) continue; // trava na competência (emissão)
        const nf = norm(c.notaFiscal);
        if (!nf) continue;
        const g = nfsContas.get(nf) ?? { nf, cliente: c.cliente ?? "", total: 0, situacao: c.situacao };
        g.total += c.valorConta ?? 0;
        nfsContas.set(nf, g);
      }
      const faturadaSemConta = [...nfsFaturadas.values()]
        .filter((g) => !nfsContas.has(g.nf))
        .sort((a, b) => b.total - a.total);
      const contaSemFaturada = [...nfsContas.values()]
        .filter((g) => !nfsFaturadas.has(g.nf))
        .sort((a, b) => b.total - a.total);
      setDiag({
        totalFaturado: [...nfsFaturadas.values()].reduce((a, g) => a + g.total, 0),
        totalContas: [...nfsContas.values()].reduce((a, g) => a + g.total, 0),
        qtdFaturadas: nfsFaturadas.size,
        qtdContas: nfsContas.size,
        faturadaSemConta,
        contaSemFaturada,
        excluidas: dataNf.excluidas ?? [],
      });
      // O sync de contas a receber gravou a competência atualizada na base —
      // recarrega para a tela refletir cancelamentos/devoluções recentes.
      await carregarDoBanco();
    } catch {
      setDiagErro("Falha de conexão ao executar o diagnóstico.");
    } finally {
      setDiagCarregando(false);
    }
  }

  if (!carregado) {
    return <div className="text-slate-500">Carregando…</div>;
  }

  // ---- Relatório consolidado (visão de impressão) ----
  if (mostrarRelatorio) {
    const periodo =
      relatorio.length > 0
        ? `${rotuloMesAno(relatorio[0].comp)} a ${rotuloMesAno(relatorio[relatorio.length - 1].comp)}`
        : "—";
    const neg = (v: number) => (v > 0.005 ? formatarMoeda(-v) : formatarMoeda(0));
    return (
      <div>
        <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
        <div className="no-print mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setMostrarRelatorio(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Voltar
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        </div>

        <div className="mb-4 card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-brand-800">
              Relatório de Rastreamento de Faturamento
            </h2>
            <p className="text-xs text-slate-500">
              Período: {periodo} · {relatorio.length} competências
            </p>
          </div>
          {relatorio.length > 0 && (
            <div className="px-3 py-4 sm:px-5">
              <RastreioRelatorioChart
                dados={relatorio.map((r) => ({
                  rotulo: `${r.comp.slice(5, 7)}/${r.comp.slice(2, 4)}`,
                  faturamento: r.base,
                  rastreado: r.rastreado,
                  percent: r.perc * 100,
                }))}
              />
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs tabular-nums sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2.5 text-left font-medium">Competência</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fat. Omie</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fat. PF</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fat. do Mês</th>
                  <th className="px-3 py-2.5 text-right font-medium">À Receber</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recebido</th>
                  <th className="px-3 py-2.5 text-right font-medium">Atrasado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Descontos</th>
                  <th className="px-3 py-2.5 text-right font-medium">Juros</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rastreado</th>
                  <th className="px-3 py-2.5 text-right font-medium">% Rastr.</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.map((r) => (
                  <tr key={r.comp} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 text-left font-medium capitalize text-slate-700">
                      {rotuloMesAno(r.comp)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatarMoeda(r.fatOmie)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatarMoeda(r.pf)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{formatarMoeda(r.base)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatarMoeda(r.aReceber)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatarMoeda(r.recebido)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{neg(r.atrasado)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{neg(r.desconto)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatarMoeda(r.juros)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{formatarMoeda(r.rastreado)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-brand-700">{formatarPercent(r.perc)}</td>
                  </tr>
                ))}
                {relatorio.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      Nenhuma competência com dados.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-brand-50 font-bold text-brand-900">
                  <td className="px-3 py-2.5 text-left">Total</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.fatOmie)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.pf)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.base)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.aReceber)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.recebido)}</td>
                  <td className="px-3 py-2.5 text-right">{neg(totaisRel.atrasado)}</td>
                  <td className="px-3 py-2.5 text-right">{neg(totaisRel.desconto)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.juros)}</td>
                  <td className="px-3 py-2.5 text-right">{formatarMoeda(totaisRel.rastreado)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {formatarPercent(totaisRel.base > 0 ? totaisRel.rastreado / totaisRel.base : 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-5 py-3 text-xs text-slate-400">
            À Receber + Recebido + Descontos = Rastreado · % = Rastreado ÷ Faturamento do Mês (Omie + PF)
          </div>
        </div>
      </div>
    );
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
              onClick={() => setMostrarRelatorio(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Relatório completo
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Selo de origem (somente Omie) */}
      {fonte === "banco" && (
        <div className="no-print mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Dados do Omie
          </span>
        </div>
      )}

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
          {/* Título com o Faturamento do Mês (Omie + PF) */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-xl font-bold text-brand-800">
              Faturamento {rotuloMesAno(competencia).replace(/^./, (s) => s.toUpperCase())}
            </h2>
            <span className="text-xl font-bold text-brand-800">
              {formatarMoeda(dem.baseFaturamento)}
            </span>
            <span className="text-xs font-medium text-slate-400">(Faturamento Omie + PF)</span>
          </div>

          {/* Cards de totais (cabeçalho do demonstrativo) */}
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {([
              { col: "falta" as Coluna, v: dem.linhas.filter((l) => l.mes >= mesAtual).reduce((s, l) => s + l.aindaFaltaReceber, 0), c: "text-slate-900" },
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
              <table className="w-full min-w-[560px] text-sm">
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
                      {/* Oculta "Ainda Falta Receber" em meses passados — saldo vencido já aparece em "Atrasado" */}
                      {l.mes < mesAtual
                        ? <td className="px-4 py-2.5 text-right text-slate-300">-</td>
                        : celulaTd(l.aindaFaltaReceber, "falta", l.mes)}
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
                    <td className="px-4 py-3 text-right">
                      {formatarMoeda(
                        dem.linhas
                          .filter((l) => l.mes >= mesAtual)
                          .reduce((s, l) => s + l.aindaFaltaReceber, 0)
                      )}
                    </td>
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
                    Faturamento Omie <span className="text-xs text-slate-400">(NFs de venda)</span>
                  </dt>
                  <dd className="tabular-nums text-slate-700">
                    {formatarMoeda(dem.faturamentoOmie)}
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
                  <dt className="font-semibold text-slate-700">
                    Faturamento do Mês{" "}
                    <span className="text-xs font-normal text-slate-400">(Omie + PF)</span>
                  </dt>
                  <dd className="font-bold tabular-nums">{formatarMoeda(dem.baseFaturamento)}</dd>
                </div>
              </dl>

              <div className="mt-6 rounded-lg bg-brand-50 p-4">
                <div className="text-sm text-brand-800">
                  Percentual rastreado{" "}
                  <span className="text-xs text-brand-500">(Rastreado ÷ Faturamento do Mês)</span>
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

              {/* Limite do gap configurável pelo usuário */}
              <div className="no-print mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <label htmlFor="gapLimite">Alertar quando o gap passar de</label>
                <input
                  id="gapLimite"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={gapLimite}
                  onChange={(e) => setGapLimite(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                />
                <span>pontos percentuais (p.p.)</span>
              </div>

              {/* Diagnóstico — aparece quando o gap passa do limite definido acima */}
              {dem.baseFaturamento > 0 && Math.abs(dem.percentualRastreado - 1) * 100 > gapLimite && (
                <div className="no-print mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      O rastreamento está a{" "}
                      <strong>{formatarPercent(Math.abs(dem.percentualRastreado - 1))}</strong> do
                      faturamento (gap acima de {gapLimite} p.p.). O diagnóstico consulta o Omie{" "}
                      <strong>em tempo real</strong> para achar vendas canceladas, devolvidas ou
                      remessas emitidas em outro mês (pode levar alguns segundos).
                    </span>
                  </div>
                  <button
                    onClick={executarDiagnostico}
                    disabled={diagCarregando}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    <Activity className={`h-4 w-4 ${diagCarregando ? "animate-pulse" : ""}`} />
                    {diagCarregando ? "Analisando…" : "Executar diagnóstico"}
                  </button>
                  {diagErro && <p className="mt-2 text-xs text-rose-600">{diagErro}</p>}
                </div>
              )}
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

          {/* Resultado do diagnóstico */}
          {diag && (
            <div className="mt-6 card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-800">
                    Diagnóstico — {rotuloMesAno(competencia)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Consulta em tempo real no Omie: NFs de venda × contas a receber da competência
                    (reflete cancelamentos/devoluções feitos depois).
                  </p>
                </div>
                <button
                  onClick={() => setDiag(null)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                {/* Resumo */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Faturamento (NFs de venda)</div>
                    <div className="text-lg font-bold tabular-nums text-slate-800">
                      {formatarMoeda(diag.totalFaturado)}
                    </div>
                    <div className="text-xs text-slate-400">{diag.qtdFaturadas} NFs</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Contas a receber</div>
                    <div className="text-lg font-bold tabular-nums text-slate-800">
                      {formatarMoeda(diag.totalContas)}
                    </div>
                    <div className="text-xs text-slate-400">{diag.qtdContas} NFs</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Diferença</div>
                    <div
                      className={`text-lg font-bold tabular-nums ${
                        Math.abs(diag.totalFaturado - diag.totalContas) < 0.005
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {formatarMoeda(diag.totalFaturado - diag.totalContas)}
                    </div>
                  </div>
                </div>

                <DiagLista
                  titulo="Vendas sem conta a receber neste mês"
                  desc="NFs de venda faturadas no mês que não têm conta a receber correspondente (venda à vista/PF ou financeiro lançado em outro mês)."
                  itens={diag.faturadaSemConta.map((g) => ({ nf: g.nf, texto: g.cliente, total: g.total }))}
                />
                <DiagLista
                  titulo="Contas a receber sem venda neste mês"
                  desc="Títulos cuja NF não aparece no faturamento do mês (NF emitida em outro mês, cancelada, devolvida ou remessa)."
                  itens={diag.contaSemFaturada.map((g) => ({
                    nf: g.nf,
                    texto: [g.cliente, g.situacao].filter(Boolean).join(" · "),
                    total: g.total,
                  }))}
                />
                <DiagLista
                  titulo="NFs fora do faturamento (Remessa / Devolução)"
                  desc="Notas do mês que o Omie não classifica como Pedido de Venda — já excluídas do faturamento."
                  itens={diag.excluidas.map((e) => ({
                    nf: e.nf.replace(/^0+/, ""),
                    texto: `${e.operacao} · ${e.dataEmissao}`,
                    total: e.total,
                  }))}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de detalhe — bottom sheet em mobile, centralizado em desktop */}
      {detalhe && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => setDetalhe(null)}
        >
          <div
            className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[85vh] sm:max-w-4xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alça visual mobile */}
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />

            <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
                  {TITULO_COLUNA[detalhe.col]} — {rotuloMesAno(competencia)}
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                  {detalhe.mes
                    ? `${colLabel}: ${rotuloMesExtenso(detalhe.mes)} · `
                    : "Todos os meses · "}
                  {detContas.length} lançamento(s) · Total {formatarMoeda(detTotal)}
                </p>
              </div>
              <button
                onClick={() => setDetalhe(null)}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">NF</th>
                    <th className="px-4 py-2.5 font-medium">Parcela</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                    <th className="px-4 py-2.5 font-medium">Vencimento</th>
                    <th className="px-4 py-2.5 font-medium">Últ. Receb.</th>
                    <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detContas.map((c, i) => (
                    <tr key={`${c.codigoOmie ?? i}`} className="border-t border-slate-100">
                      <td className="max-w-[160px] truncate px-4 py-2 text-slate-700" title={c.cliente || ""}>
                        {c.cliente || "—"}
                      </td>
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
