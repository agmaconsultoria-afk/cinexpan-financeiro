// Stub de integração com o ERP Omie.
//
// A API do Omie é baseada em JSON-RPC sobre HTTPS. Cada chamada envia
// `app_key`, `app_secret`, `call` (método) e `param`. Os endpoints relevantes
// para o financeiro incluem:
//   - ListarContasPagar   (Financas/contapagar)
//   - ListarContasReceber (Financas/contareceber)
//   - ListarMovimentos    (Financas/extrato)
//   - ListarCategorias    (Geral/categorias)
//
// Quando a integração for habilitada, este módulo deve:
//   1. Autenticar com app_key/app_secret (armazenados como variáveis de ambiente
//      no servidor — NUNCA no cliente).
//   2. Paginar os resultados (registros_por_pagina / pagina).
//   3. Mapear contas a pagar/receber para o tipo `Lancamento`.
//
// Mantemos as chamadas em rotas de API do Next (server-side) para proteger as
// credenciais.

import { Lancamento } from "./types";

export interface OmieConfig {
  appKey: string;
  appSecret: string;
}

export interface OmieResultado {
  ok: boolean;
  lancamentos: Lancamento[];
  mensagem: string;
}

const OMIE_BASE = "https://app.omie.com.br/api/v1";

interface OmieChamada {
  endpoint: string; // ex: "financas/contareceber/"
  call: string; // ex: "ListarContasReceber"
  param: Record<string, unknown>[];
}

/**
 * Executa uma chamada JSON-RPC genérica ao Omie.
 * (A ser usado dentro de rotas de API server-side.)
 */
export async function chamarOmie(
  config: OmieConfig,
  { endpoint, call, param }: OmieChamada
): Promise<unknown> {
  const resp = await fetch(`${OMIE_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: config.appKey,
      app_secret: config.appSecret,
      param,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Omie respondeu com status ${resp.status}`);
  }
  return resp.json();
}

/**
 * Placeholder: futura sincronização de contas a receber/pagar.
 * Hoje retorna vazio até a integração ser ativada com credenciais.
 */
export async function sincronizarOmie(_config: OmieConfig): Promise<OmieResultado> {
  return {
    ok: false,
    lancamentos: [],
    mensagem: "Integração Omie ainda não habilitada. Configure as credenciais para ativar.",
  };
}
