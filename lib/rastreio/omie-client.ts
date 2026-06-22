/**
 * Cliente da API do Omie — SOMENTE SERVIDOR.
 *
 * Nunca importe este módulo em componentes client. As credenciais
 * (OMIE_APP_KEY / OMIE_APP_SECRET) ficam em variáveis de ambiente e só são
 * lidas dentro das rotas de API (server-side).
 *
 * Endpoint base: https://app.omie.com.br/api/v1
 * Recurso: financas/contareceber/  (método ListarContasReceber)
 */
import { ContaReceber } from "./types";

const OMIE_BASE = "https://app.omie.com.br/api/v1";

export interface OmieCredenciais {
  appKey: string;
  appSecret: string;
}

export function lerCredenciais(): OmieCredenciais | null {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) return null;
  return { appKey, appSecret };
}

interface OmieErro {
  faultstring?: string;
  faultcode?: string;
}

/** Executa uma chamada JSON-RPC genérica ao Omie. */
export async function callOmie<T = unknown>(
  cred: OmieCredenciais,
  recurso: string,
  call: string,
  param: Record<string, unknown>
): Promise<T> {
  const resp = await fetch(`${OMIE_BASE}/${recurso}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: cred.appKey,
      app_secret: cred.appSecret,
      param: [param],
    }),
    // o Omie costuma responder em poucos segundos; sem cache
    cache: "no-store",
  });

  const texto = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`Resposta inválida do Omie (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
  }

  const erro = json as OmieErro;
  if (erro.faultstring) {
    throw new Error(`Omie: ${erro.faultstring}`);
  }
  if (!resp.ok) {
    throw new Error(`Omie respondeu HTTP ${resp.status}`);
  }
  return json as T;
}

// ----- Mapeamento de status do título (API) -> rótulo de situação -----
// O rótulo gerado é compreendido por mapearSituacao()/derivarConta().
const STATUS_OMIE: Record<string, string> = {
  RECEBIDO: "Recebido",
  PAGO: "Recebido",
  LIQUIDADO: "Recebido",
  RECEBIDOPARCIAL: "Recebido Parcialmente",
  PAGTOPARCIAL: "Recebido Parcialmente",
  PARCIAL: "Recebido Parcialmente",
  ATRASADO: "Atrasado",
  VENCIDO: "Atrasado",
  AVENCER: "A vencer",
  ABERTO: "A vencer",
  VENCEHOJE: "Vence hoje",
  CANCELADO: "Cancelado",
};

export function mapearStatusOmie(status: string | undefined): string {
  if (!status) return "A vencer";
  const chave = status.toString().toUpperCase().replace(/[\s_]/g, "");
  return STATUS_OMIE[chave] ?? status;
}

// ----- Helpers de conversão -----
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null || v === "") return 0;
  const n = parseFloat(v.toString().replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** "dd/mm/aaaa" -> "aaaa-mm-dd" (ISO). */
function dataIso(v: unknown): string | null {
  if (!v) return null;
  const s = v.toString().trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

/** Lê o primeiro campo presente entre vários nomes candidatos. */
function pega(obj: Record<string, unknown>, ...nomes: string[]): unknown {
  for (const n of nomes) {
    if (obj[n] != null && obj[n] !== "") return obj[n];
  }
  return undefined;
}

/**
 * Converte um registro de conta a receber do Omie para o nosso ContaReceber.
 *
 * Observação: a listagem de títulos traz com segurança valor_documento, datas,
 * status e categoria. Os valores realizados (recebido/desconto/juros/aberto)
 * são lidos de forma defensiva (vários nomes candidatos) e, na ausência deles,
 * inferidos pelo status do título. A confirmação fina dos nomes dos campos é
 * feita com um registro real (endpoint de debug).
 */
export function omieParaContaReceber(raw: Record<string, unknown>): ContaReceber {
  const detalhes = (raw.detalhes as Record<string, unknown>) ?? raw;
  const r = { ...raw, ...detalhes };

  const valorConta = num(pega(r, "valor_documento", "nValorDocumento", "nValorTitulo"));
  const statusRaw = (pega(r, "status_titulo", "cStatus", "status") ?? "").toString();
  const situacao = mapearStatusOmie(statusRaw);
  const bucketRecebido = /receb|pago|liquid/i.test(situacao);
  const bucketCancelado = /cancel/i.test(situacao);

  // Valores realizados (se vierem na resposta)
  const valorRecebidoCampo = pega(r, "valor_pago", "valor_baixado", "nValPago", "valor_recebido");
  const valorAberto = pega(r, "valor_aberto", "nValAberto", "saldo");
  const desconto = num(pega(r, "valor_desconto", "desconto", "nDesconto"));
  const juros = num(pega(r, "valor_juros", "juros", "nJuros"));
  const multa = num(pega(r, "valor_multa", "multa", "nMulta"));

  let valorRecebido: number;
  let valorAReceber: number;
  if (valorRecebidoCampo != null || valorAberto != null) {
    valorRecebido = num(valorRecebidoCampo);
    valorAReceber = valorAberto != null ? num(valorAberto) : Math.max(0, valorConta - valorRecebido);
  } else if (bucketRecebido) {
    valorRecebido = valorConta;
    valorAReceber = 0;
  } else if (bucketCancelado) {
    valorRecebido = 0;
    valorAReceber = 0;
  } else {
    valorRecebido = 0;
    valorAReceber = valorConta;
  }

  return {
    situacao,
    numeroDoc: (pega(r, "numero_documento", "cNumDoc", "numero") ?? "").toString(),
    parcela: (pega(r, "numero_parcela", "cNumParcela", "parcela") ?? "").toString(),
    notaFiscal: (pega(r, "numero_documento_fiscal", "cNumDocFiscal", "nf") ?? "").toString(),
    cliente: (pega(r, "nome_cliente", "cliente_nome_fantasia", "cNomeCliente") ?? "").toString(),
    previsaoRecebimento: dataIso(pega(r, "data_previsao", "dDtPrevisao", "data_previsao_recebimento")),
    ultimoRecebimento: dataIso(pega(r, "data_recebimento", "dDtRecbto", "data_ultimo_recebimento")),
    valorConta,
    valorLiquido: num(pega(r, "valor_liquido", "nValLiquido")) || valorConta,
    desconto,
    jurosMulta: juros + multa,
    valorRecebido,
    valorAReceber,
    categoria: (pega(r, "categoria", "cCodCateg", "codigo_categoria") ?? "").toString(),
    operacao: (pega(r, "operacao", "cOperacao") ?? "").toString(),
    contaCorrente: (pega(r, "conta_corrente", "nCodCC", "id_conta_corrente") ?? "").toString(),
    vencimento: dataIso(pega(r, "data_vencimento", "dDtVenc")),
    dataEmissao: dataIso(pega(r, "data_emissao", "dDtEmissao", "data_registro", "dDtRegistro")),
    vendedor: (pega(r, "vendedor", "cNomeVendedor") ?? "").toString(),
    projeto: (pega(r, "projeto", "cNomeProjeto") ?? "").toString(),
  };
}

interface ListarResponse {
  pagina?: number;
  total_de_paginas?: number;
  total_de_registros?: number;
  registros?: number;
  conta_receber_cadastro?: Record<string, unknown>[];
}

export interface ResultadoSincOmie {
  contas: ContaReceber[];
  totalRegistros: number;
  totalPaginas: number;
  amostraBruta?: Record<string, unknown>;
}

/**
 * Busca rápida de UMA página pequena, devolvendo o primeiro registro BRUTO do
 * Omie e a lista de campos — para conferência do mapeamento (modo debug).
 */
export async function amostrarContasReceber(cred: OmieCredenciais): Promise<{
  totalRegistros: number;
  totalPaginas: number;
  campos: string[];
  amostraBruta?: Record<string, unknown>;
}> {
  const resp = await callOmie<ListarResponse>(cred, "financas/contareceber/", "ListarContasReceber", {
    pagina: 1,
    registros_por_pagina: 3,
    apenas_importado_api: "N",
  });
  const amostraBruta = (resp.conta_receber_cadastro ?? [])[0];
  return {
    totalRegistros: resp.total_de_registros ?? 0,
    totalPaginas: resp.total_de_paginas ?? 0,
    campos: amostraBruta ? Object.keys(amostraBruta) : [],
    amostraBruta,
  };
}

/**
 * Lista todas as contas a receber (paginando), opcionalmente filtrando por
 * intervalo de datas (dd/mm/aaaa). Se `debug` for true, inclui o primeiro
 * registro bruto retornado pelo Omie para conferência de mapeamento.
 */
export async function listarContasReceber(
  cred: OmieCredenciais,
  opcoes: { dataDe?: string; dataAte?: string; debug?: boolean; maxPaginas?: number } = {}
): Promise<ResultadoSincOmie> {
  const registrosPorPagina = 500;
  const maxPaginas = opcoes.maxPaginas ?? 50;
  const todas: Record<string, unknown>[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let totalRegistros = 0;
  let amostraBruta: Record<string, unknown> | undefined;

  do {
    const param: Record<string, unknown> = {
      pagina,
      registros_por_pagina: registrosPorPagina,
      apenas_importado_api: "N",
    };
    if (opcoes.dataDe) param.filtrar_por_data_de = opcoes.dataDe;
    if (opcoes.dataAte) param.filtrar_por_data_ate = opcoes.dataAte;

    const resp = await callOmie<ListarResponse>(
      cred,
      "financas/contareceber/",
      "ListarContasReceber",
      param
    );

    totalPaginas = resp.total_de_paginas ?? 1;
    totalRegistros = resp.total_de_registros ?? 0;
    const lote = resp.conta_receber_cadastro ?? [];
    if (pagina === 1 && lote.length > 0) amostraBruta = lote[0];
    todas.push(...lote);
    pagina++;
  } while (pagina <= totalPaginas && pagina <= maxPaginas);

  const contas = todas.map(omieParaContaReceber);
  return {
    contas,
    totalRegistros,
    totalPaginas,
    amostraBruta: opcoes.debug ? amostraBruta : undefined,
  };
}
