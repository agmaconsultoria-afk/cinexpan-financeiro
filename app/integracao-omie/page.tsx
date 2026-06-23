"use client";

import { useState } from "react";
import { Plug, ShieldCheck, RefreshCw, ListChecks, Lock, CheckCircle2, XCircle, Cloud } from "lucide-react";
import { PageHeader } from "@/components/ui";

export default function IntegracaoOmiePage() {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [clientesMsg, setClientesMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  async function atualizarClientes() {
    setCarregandoClientes(true);
    setClientesMsg(null);
    try {
      const resp = await fetch("/api/rastreio/clientes", { method: "POST" });
      const dados = await resp.json();
      if (dados.ok) {
        setClientesMsg({
          ok: true,
          msg: `Cadastro de clientes atualizado: ${dados.total} clientes · ${dados.atualizados} lançamentos com nome preenchido.`,
        });
      } else {
        setClientesMsg({ ok: false, msg: dados.erro ?? "Falha ao atualizar clientes." });
      }
    } catch {
      setClientesMsg({ ok: false, msg: "Falha de conexão com o servidor." });
    } finally {
      setCarregandoClientes(false);
    }
  }

  async function testarConexao() {
    setTestando(true);
    setResultado(null);
    try {
      const resp = await fetch("/api/omie/contas-receber?debug=1");
      const dados = await resp.json();
      if (dados.ok) {
        setResultado({
          ok: true,
          msg: `Conexão OK! ${dados.totalRegistros} registros disponíveis (${dados.totalPaginas} páginas). ${dados.contas?.length ?? 0} contas carregadas.`,
        });
      } else {
        setResultado({ ok: false, msg: dados.erro ?? "Falha desconhecida." });
      }
    } catch {
      setResultado({ ok: false, msg: "Falha de conexão com o servidor." });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Integração com ERP Omie"
        subtitulo="Sincronização das Contas a Receber diretamente do Omie"
      />

      <div className="card card-pad mb-6 flex items-start gap-4 border-brand-200 bg-brand-50">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Plug className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-brand-900">
            Conexão com a API do Omie (financas/contareceber)
          </h2>
          <p className="mt-1 text-sm text-brand-800">
            Com as credenciais configuradas, o portal consulta o endpoint{" "}
            <code className="text-xs">ListarContasReceber</code> e atualiza o Rastreio de Faturamento
            sem precisar do upload manual da planilha. As credenciais ficam protegidas no servidor.
          </p>
        </div>
      </div>

      {/* Passo a passo de configuração */}
      <div className="card card-pad mb-6">
        <h3 className="text-sm font-semibold text-slate-800">Como configurar as credenciais</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>
            No Omie, acesse <strong>Aplicativos &rarr; API</strong> e gere/obtenha o{" "}
            <strong>App Key</strong> e o <strong>App Secret</strong> do recurso de Finanças.
          </li>
          <li>
            Na pasta do projeto, crie um arquivo chamado <code className="text-xs">.env.local</code>{" "}
            (copie de <code className="text-xs">.env.example</code>) com:
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{`OMIE_APP_KEY=sua_app_key
OMIE_APP_SECRET=seu_app_secret`}
            </pre>
          </li>
          <li>
            Reinicie o servidor (<code className="text-xs">npm run dev</code>) para carregar as
            variáveis.
          </li>
          <li>
            Clique em <strong>Testar conexão</strong> abaixo. Funcionando, use{" "}
            <strong>Sincronizar Omie</strong> na tela de Rastreio.
          </li>
        </ol>

        <button
          onClick={testarConexao}
          disabled={testando}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <Cloud className={`h-4 w-4 ${testando ? "animate-pulse" : ""}`} />
          {testando ? "Testando…" : "Testar conexão"}
        </button>

        {resultado && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              resultado.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {resultado.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{resultado.msg}</span>
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-800">Cadastro de clientes</h4>
          <p className="mt-1 text-sm text-slate-500">
            O Rastreio traz o código do cliente; esta carga (feita uma vez) baixa o cadastro de
            clientes do Omie para exibir os <strong>nomes</strong> no detalhamento. Pode levar
            alguns minutos em bases grandes; depois fica em cache.
          </p>
          <button
            onClick={atualizarClientes}
            disabled={carregandoClientes}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${carregandoClientes ? "animate-spin" : ""}`} />
            {carregandoClientes ? "Atualizando clientes…" : "Atualizar cadastro de clientes"}
          </button>
          {clientesMsg && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
                clientesMsg.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {clientesMsg.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{clientesMsg.msg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Segurança / detalhes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            titulo: "Credenciais protegidas",
            desc: "App Key e App Secret ficam em variáveis de ambiente no servidor — nunca trafegam para o navegador.",
            icone: Lock,
          },
          {
            titulo: "Contas a Receber",
            desc: "Importação paginada via ListarContasReceber (até 500 registros por página).",
            icone: ListChecks,
          },
          {
            titulo: "Mesmo cálculo da planilha",
            desc: "Os dados sincronizados passam pelas mesmas regras validadas do Rastreio (competência, recebimento, atraso, etc.).",
            icone: ShieldCheck,
          },
          {
            titulo: "Atualização sob demanda",
            desc: "O botão Sincronizar Omie atualiza os dados quando você quiser; futuramente pode ser agendado.",
            icone: RefreshCw,
          },
        ].map((item) => (
          <div key={item.titulo} className="card card-pad">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <item.icone className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-800">{item.titulo}</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
