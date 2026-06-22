"use client";

import { Plug, ShieldCheck, RefreshCw, ListChecks, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui";

const ROADMAP = [
  {
    titulo: "1. Credenciais de API",
    desc: "Cadastro seguro de app_key e app_secret do Omie (armazenadas no servidor como variáveis de ambiente).",
    icone: Lock,
  },
  {
    titulo: "2. Contas a Receber e a Pagar",
    desc: "Importação automática via endpoints ListarContasReceber e ListarContasPagar, com paginação.",
    icone: ListChecks,
  },
  {
    titulo: "3. Sincronização periódica",
    desc: "Atualização agendada dos lançamentos, substituindo a importação manual de planilhas.",
    icone: RefreshCw,
  },
  {
    titulo: "4. Conciliação e categorias",
    desc: "Mapeamento das categorias do Omie para os grupos do DRE do portal.",
    icone: ShieldCheck,
  },
];

export default function IntegracaoOmiePage() {
  return (
    <div>
      <PageHeader
        titulo="Integração com ERP Omie"
        subtitulo="Conexão direta com o financeiro do Omie (em preparação)"
      />

      <div className="card card-pad mb-6 flex items-start gap-4 border-brand-200 bg-brand-50">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Plug className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-brand-900">
            Próxima fase: dados em tempo real do Omie
          </h2>
          <p className="mt-1 text-sm text-brand-800">
            Nesta primeira versão, o portal é alimentado pela planilha financeira. A integração com o
            ERP Omie substituirá a importação manual, trazendo contas a pagar/receber e movimentos
            diretamente da fonte. A estrutura técnica já está preparada no projeto.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROADMAP.map((item) => (
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

      <div className="card card-pad mt-6">
        <h3 className="text-sm font-semibold text-slate-800">Configuração de credenciais</h3>
        <p className="mt-1 text-sm text-slate-500">
          Disponível quando a integração for ativada. As credenciais ficam protegidas no servidor.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500">App Key</label>
            <input
              disabled
              placeholder="••••••••••••"
              className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">App Secret</label>
            <input
              disabled
              placeholder="••••••••••••"
              className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
            />
          </div>
        </div>
        <button
          disabled
          className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
        >
          <RefreshCw className="h-4 w-4" /> Sincronizar com Omie (em breve)
        </button>
      </div>
    </div>
  );
}
