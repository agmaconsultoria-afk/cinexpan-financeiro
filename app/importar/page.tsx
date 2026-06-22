"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { importarPlanilha, gerarModeloPlanilha, ResultadoImportacao } from "@/lib/import";
import { useDados } from "@/lib/data-context";
import { formatarMoeda, formatarData } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Lancamento } from "@/lib/types";

export default function ImportarPage() {
  const { importar, limparParaExemplo, fonte } = useDados();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [previa, setPrevia] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [arrastando, setArrastando] = useState(false);

  async function processar(arquivo: File) {
    setErro(null);
    setResultado(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      const res = importarPlanilha(buffer, arquivo.name.replace(/\.[^.]+$/, ""));
      setResultado(res);
      setPrevia(res.lancamentos.slice(0, 10));
      setNomeArquivo(arquivo.name);
    } catch (e) {
      setErro("Não foi possível ler o arquivo. Verifique se é um .xlsx, .xls ou .csv válido.");
    }
  }

  function confirmarImportacao() {
    if (resultado && resultado.lancamentos.length > 0) {
      importar(resultado.lancamentos);
    }
  }

  function baixarModelo() {
    const blob = gerarModeloPlanilha();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-cinexpan-financeiro.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        titulo="Importar Planilha"
        subtitulo="Carregue a planilha financeira (.xlsx, .xls ou .csv) para alimentar o portal"
        acoes={
          <button
            onClick={baixarModelo}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Baixar modelo
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processar(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
              arrastando
                ? "border-brand-500 bg-brand-50"
                : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50"
            }`}
          >
            <UploadCloud className="h-12 w-12 text-brand-500" />
            <p className="mt-4 text-base font-medium text-slate-700">
              Arraste a planilha aqui ou clique para selecionar
            </p>
            <p className="mt-1 text-sm text-slate-400">Formatos aceitos: .xlsx, .xls, .csv</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processar(f);
              }}
            />
          </div>

          {erro && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {resultado && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FileSpreadsheet className="h-4 w-4 text-brand-500" />
                  {nomeArquivo}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-lg font-bold text-slate-900">
                      {resultado.lancamentos.length}
                    </div>
                    <div className="text-xs text-slate-500">Lançamentos válidos</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-lg font-bold text-slate-900">{resultado.totalLinhas}</div>
                    <div className="text-xs text-slate-500">Linhas lidas</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-lg font-bold text-slate-900">{resultado.ignoradas}</div>
                    <div className="text-xs text-slate-500">Ignoradas</div>
                  </div>
                </div>

                {resultado.avisos.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {resultado.avisos.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {a}
                      </div>
                    ))}
                  </div>
                )}

                {resultado.lancamentos.length > 0 && (
                  <button
                    onClick={confirmarImportacao}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Confirmar e usar estes dados
                  </button>
                )}
              </div>

              {previa.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    Prévia (primeiras {previa.length} linhas)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left text-slate-500">
                          <th className="px-3 py-2 font-medium">Data</th>
                          <th className="px-3 py-2 font-medium">Descrição</th>
                          <th className="px-3 py-2 font-medium">Categoria</th>
                          <th className="px-3 py-2 font-medium">Tipo</th>
                          <th className="px-3 py-2 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previa.map((l) => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{formatarData(l.data)}</td>
                            <td className="px-3 py-2">{l.descricao}</td>
                            <td className="px-3 py-2">{l.categoria}</td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  l.tipo === "receita" ? "text-emerald-600" : "text-rose-600"
                                }
                              >
                                {l.tipo === "receita" ? "Receita" : "Despesa"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatarMoeda(l.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="text-sm font-semibold text-slate-800">Como preparar a planilha</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                A primeira linha deve conter os <strong>cabeçalhos</strong> das colunas.
              </li>
              <li>
                Colunas reconhecidas: <code className="text-xs">Data</code>,{" "}
                <code className="text-xs">Descrição</code>, <code className="text-xs">Categoria</code>,{" "}
                <code className="text-xs">Grupo</code>, <code className="text-xs">Tipo</code>,{" "}
                <code className="text-xs">Valor</code>, <code className="text-xs">Centro de Custo</code>.
              </li>
              <li>
                O <strong>Tipo</strong> aceita "Receita"/"Despesa" (ou crédito/débito). Sem ele, o
                sinal do valor define o tipo.
              </li>
              <li>Valores em R$ no formato pt-BR (1.234,56) são interpretados automaticamente.</li>
            </ul>
            <button
              onClick={baixarModelo}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Baixar planilha modelo
            </button>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-semibold text-slate-800">Fonte de dados atual</h3>
            <p className="mt-2 text-sm text-slate-600">
              {fonte === "planilha"
                ? "O portal está usando dados importados da sua planilha."
                : "O portal está exibindo dados de exemplo. Importe uma planilha para ver seus números reais."}
            </p>
            {fonte === "planilha" && (
              <button
                onClick={limparParaExemplo}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" /> Voltar aos dados de exemplo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
