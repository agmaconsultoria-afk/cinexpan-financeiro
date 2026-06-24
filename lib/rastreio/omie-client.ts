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
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ContaReceber } from "./types";
import { mesDe } from "./logic";
import { getClientes, mergeClientes } from "./db";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fetchOmieWin(url: string, bodyObj: object): { status: number; text: string } {
  const id = Date.now().toString(36);
  const bodyFilePath = join(tmpdir(), `omie-b-${id}.json`);
  const scriptFilePath = join(tmpdir(), `omie-s-${id}.ps1`);
  const bodyFilePs = bodyFilePath.replace(/\\/g, "/");
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$ErrorActionPreference = 'Stop'",
    `$body = [System.IO.File]::ReadAllText('${bodyFilePs}', [System.Text.Encoding]::UTF8)`,
    `$resp = Invoke-WebRequest -Uri '${url}' -Method POST -Body $body -ContentType 'application/json; charset=utf-8' -UseBasicParsing`,
    "Write-Output $resp.StatusCode",
    "Write-Output $resp.Content",
  ].join("\r\n");
  try {
    writeFileSync(bodyFilePath, JSON.stringify(bodyObj), "utf8");
    writeFileSync(scriptFilePath, script, "utf8");
    const out = execSync(
      `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${scriptFilePath}"`,
      { encoding: "utf8", timeout: 90000 }
    );
    const nl = out.indexOf("\n");
    if (nl < 0) throw new Error(`Resposta inesperada do PowerShell: ${out.slice(0, 100)}`);
    const status = parseInt(out.slice(0, nl).trim(), 10) || 200;
    const text = out.slice(nl + 1).trim();
    return { status, text };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Omie (PS): ${msg.slice(0, 400)}`);
  } finally {
    try { unlinkSync(bodyFilePath); } catch {} // eslint-disable-line no-empty
    try { unlinkSync(scriptFilePath); } catch {} // eslint-disable-line no-empty
  }
}

/**
 * Executa uma chamada JSON-RPC genérica ao Omie.
 * Trata o bloqueio "Consumo redundante" (proteção anti-duplicação do Omie):
 * espera o tempo indicado e tenta novamente automaticamente.
 */
export async function callOmie<T = unknown>(
  cred: OmieCredenciais,
  recurso: string,
  call: string,
  param: Record<string, unknown>,
  tentativasRestantes = 2
): Promise<T> {
  const url = `${OMIE_BASE}/${recurso}`;
  const bodyObj = { call, app_key: cred.appKey, app_secret: cred.appSecret, param: [param] };
  let status: number;
  let texto: string;
  if (process.platform === "win32") {
    const r = fetchOmieWin(url, bodyObj);
    status = r.status;
    texto = r.text;
  } else {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
      cache: "no-store",
    });
    status = resp.status;
    texto = await resp.text();
  }

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`Resposta inválida do Omie (HTTP ${status}): ${texto.slice(0, 200)}`);
  }

  const erro = json as OmieErro;
  if (erro.faultstring) {
    const fs = erro.faultstring;
    // Bloqueio temporário por consumo redundante/excessivo -> aguarda e repete.
    if (/redundante|consumo/i.test(fs) && tentativasRestantes > 0) {
      const m = fs.match(/(\d+)\s*segundo/i);
      const espera = Math.min((m ? parseInt(m[1], 10) : 20) + 2, 70);
      await sleep(espera * 1000);
      return callOmie<T>(cred, recurso, call, param, tentativasRestantes - 1);
    }
    throw new Error(`Omie: ${fs}`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Omie respondeu HTTP ${status}`);
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
    codigoOmie: (pega(r, "codigo_lancamento_omie", "nCodTitulo") ?? "").toString(),
    clienteCodigo: (pega(r, "codigo_cliente_fornecedor", "nCodCliente") ?? "").toString(),
    clienteDoc: (pega(r, "cpf_cnpj_cliente", "cCPFCNPJCliente") ?? "").toString(),
  };
}

// ===================== Movimentos Financeiros (financas/mf) =====================
// Fonte dos valores realizados: pago, aberto, desconto, juros, multa.

/** Converte um movimento financeiro do Omie (detalhes + resumo) em ContaReceber. */
export function omieMovimentoParaContaReceber(mov: Record<string, unknown>): ContaReceber {
  const d = (mov.detalhes as Record<string, unknown>) ?? {};
  const r = (mov.resumo as Record<string, unknown>) ?? {};
  const valorConta = num(d.nValorTitulo);
  const situacao = mapearStatusOmie((d.cStatus as string) ?? "");

  return {
    situacao,
    numeroDoc: (d.cNumTitulo ?? "").toString(),
    parcela: (d.cNumParcela ?? "").toString(),
    notaFiscal: (d.cNumDocFiscal ?? "").toString(),
    cliente: (d.cCPFCNPJCliente ?? "").toString(),
    previsaoRecebimento: dataIso(d.dDtPrevisao),
    ultimoRecebimento: dataIso(d.dDtPagamento),
    valorConta,
    valorLiquido: num(r.nValLiquido) || valorConta,
    desconto: num(r.nDesconto),
    jurosMulta: num(r.nJuros) + num(r.nMulta),
    valorRecebido: num(r.nValPago),
    valorAReceber: num(r.nValAberto),
    categoria: (d.cCodCateg ?? "").toString(),
    operacao: (d.cOperacao ?? "").toString(),
    contaCorrente: (d.nCodCC ?? "").toString(),
    vencimento: dataIso(d.dDtVenc),
    dataEmissao: dataIso(d.dDtEmissao),
    vendedor: "",
    projeto: "",
  };
}

function ehReceita(mov: Record<string, unknown>): boolean {
  const d = (mov.detalhes as Record<string, unknown>) ?? {};
  const nat = (d.cNatureza ?? "").toString().toUpperCase();
  const grupo = (d.cGrupo ?? "").toString().toUpperCase();
  return nat === "R" || grupo.includes("RECEBER");
}

/** Mapa código de categoria -> descrição (melhor esforço). */
async function mapaCategorias(cred: OmieCredenciais): Promise<Record<string, string>> {
  try {
    const resp = await callOmie<{ categoria_cadastro?: Record<string, unknown>[] }>(
      cred,
      "geral/categorias/",
      "ListarCategorias",
      { pagina: 1, registros_por_pagina: 500 }
    );
    const mapa: Record<string, string> = {};
    for (const c of resp.categoria_cadastro ?? []) {
      const cod = (c.codigo ?? c.codigo_categoria ?? "").toString();
      const desc = (c.descricao ?? "").toString();
      if (cod) mapa[cod] = desc;
    }
    return mapa;
  } catch {
    return {};
  }
}

/**
 * Cruza os títulos (de ListarContasReceber) com as baixas dos Movimentos
 * Financeiros para preencher os valores realizados (recebido líquido, desconto,
 * juros, multa, valor em aberto, data do recebimento). Casa por código do
 * lançamento (nCodTitulo) e, como fallback, por NF + parcela.
 *
 * `pagtoDe`/`pagtoAte` em dd/mm/aaaa (filtro dDtPagtoDe — único aceito pelo MF).
 */
async function enriquecerComMF(
  cred: OmieCredenciais,
  contas: ContaReceber[],
  pagtoDe: string,
  pagtoAte: string | undefined,
  maxPaginas = 60
): Promise<{ enriquecidos: number; paginasMF: number; truncadoMF: boolean }> {
  const porCodigo = new Map<string, ContaReceber>();
  const porDocParc = new Map<string, ContaReceber>();
  for (const c of contas) {
    if (c.codigoOmie) porCodigo.set(c.codigoOmie, c);
    if (c.notaFiscal && c.parcela) porDocParc.set(`${c.notaFiscal}|${c.parcela}`, c);
  }

  // Títulos que têm baixa a buscar (recebidos/parciais). Quando todos forem
  // casados, paramos — não há motivo de varrer o resto dos pagamentos.
  const alvoTotal = contas.filter((c) => /receb|pago|liquid/i.test(c.situacao)).length;

  const casados = new Set<ContaReceber>();
  let pagina = 1;
  let totalPaginas = 1;
  let truncadoMF = false;
  let semNovos = 0;

  do {
    const param: Record<string, unknown> = {
      nPagina: pagina,
      nRegPorPagina: 500,
      dDtPagtoDe: pagtoDe,
    };
    if (pagtoAte) param.dDtPagtoAte = pagtoAte;

    const resp = await callOmie<{
      nTotPaginas?: number;
      movimentos?: Record<string, unknown>[];
    }>(cred, "financas/mf/", "ListarMovimentos", param);

    totalPaginas = resp.nTotPaginas ?? 1;
    let novosNaPagina = 0;
    for (const mov of resp.movimentos ?? []) {
      if (!ehReceita(mov)) continue;
      const d = (mov.detalhes as Record<string, unknown>) ?? {};
      const r = (mov.resumo as Record<string, unknown>) ?? {};
      const cod = (d.nCodTitulo ?? "").toString();
      const dk = `${(d.cNumDocFiscal ?? "").toString()}|${(d.cNumParcela ?? "").toString()}`;
      const alvo = porCodigo.get(cod) ?? porDocParc.get(dk);
      if (!alvo) continue;

      const pago = num(r.nValPago);
      alvo.valorRecebido = pago;
      alvo.desconto = num(r.nDesconto);
      alvo.jurosMulta = num(r.nJuros) + num(r.nMulta);
      alvo.valorAReceber =
        r.nValAberto != null ? num(r.nValAberto) : Math.max(0, alvo.valorConta - pago);
      const ur = dataIso(d.dDtPagamento);
      if (ur) alvo.ultimoRecebimento = ur;
      if (!alvo.clienteDoc && d.cCPFCNPJCliente) {
        alvo.clienteDoc = (d.cCPFCNPJCliente as string).toString();
      }
      if (!casados.has(alvo)) {
        casados.add(alvo);
        novosNaPagina++;
      }
    }

    // Parada antecipada: já casou todos os títulos recebidos.
    if (alvoTotal > 0 && casados.size >= alvoTotal) break;
    // Ou várias páginas seguidas sem casar nada novo (passou da janela útil).
    semNovos = novosNaPagina === 0 ? semNovos + 1 : 0;
    if (semNovos >= 8 && casados.size > 0) break;

    if (pagina >= maxPaginas && pagina < totalPaginas) {
      truncadoMF = true;
      break;
    }
    pagina++;
    if (pagina <= totalPaginas) await sleep(120);
  } while (pagina <= totalPaginas);

  return { enriquecidos: casados.size, paginasMF: pagina > totalPaginas ? totalPaginas : pagina, truncadoMF };
}

/** Mapa código de cliente -> nome (nome fantasia ou razão social). */
async function mapaClientes(
  cred: OmieCredenciais,
  maxPaginas = 200
): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  let pagina = 1;
  let total = 1;
  do {
    const resp = await callOmie<{
      total_de_paginas?: number;
      clientes_cadastro?: Record<string, unknown>[];
    }>(cred, "geral/clientes/", "ListarClientes", {
      pagina,
      registros_por_pagina: 500,
      apenas_importado_api: "N",
    });
    total = resp.total_de_paginas ?? 1;
    for (const cl of resp.clientes_cadastro ?? []) {
      const cod = (cl.codigo_cliente_omie ?? "").toString();
      const nome = (cl.nome_fantasia || cl.razao_social || "").toString().trim();
      if (cod && nome) mapa[cod] = nome;
    }
    pagina++;
    if (pagina <= total && pagina <= maxPaginas) await sleep(150);
  } while (pagina <= total && pagina <= maxPaginas);
  return mapa;
}

/**
 * Resolve os nomes dos clientes nas contas usando APENAS o cache da base
 * (rápido, não chama o Omie). Sem nome no cache → fallback CNPJ ou #código.
 * A carga do cadastro de clientes é feita à parte por atualizarCacheClientes().
 */
export async function resolverClientes(
  _cred: OmieCredenciais,
  contas: ContaReceber[]
): Promise<number> {
  const { map: cache } = await getClientes();
  let resolvidos = 0;
  for (const c of contas) {
    if (c.cliente) {
      resolvidos++;
      continue;
    }
    const nome = c.clienteCodigo ? cache[c.clienteCodigo] : undefined;
    if (nome) {
      c.cliente = nome;
      resolvidos++;
    } else if (c.clienteDoc) {
      c.cliente = c.clienteDoc;
    } else if (c.clienteCodigo) {
      c.cliente = `#${c.clienteCodigo}`;
    }
  }
  return resolvidos;
}

/**
 * Carga (uma vez) do cadastro de clientes do Omie para o cache. Pode demorar
 * em bases grandes; roda sob demanda (botão "Atualizar clientes").
 */
export async function atualizarCacheClientes(
  cred: OmieCredenciais
): Promise<{ total: number }> {
  const mapa = await mapaClientes(cred, 600);
  if (Object.keys(mapa).length > 0) await mergeClientes(mapa);
  return { total: Object.keys(mapa).length };
}

// Nomes candidatos para o filtro de data do mfListarRequest (descobertos em
// runtime, pois variam e a doc é fechada). Ordem = preferência (mais próximo
// da emissão/competência primeiro).
const CANDIDATOS_FILTRO_DATA: [string, string][] = [
  ["dDtRegistroDe", "dDtRegistroAte"],
  ["dDtEmissaoDe", "dDtEmissaoAte"],
  ["dDtPrevistaDe", "dDtPrevistaAte"],
  ["dDtPrevisaoDe", "dDtPrevisaoAte"],
  ["dDtPagtoDe", "dDtPagtoAte"],
];

function tagInvalida(msg: string): boolean {
  return /n[aã]o faz parte da estrutura/i.test(msg);
}

/**
 * Descobre qual par de tags de data o mfListarRequest aceita, testando os
 * candidatos. Retorna o objeto de filtro pronto (ou {} se nenhum servir).
 */
async function descobrirFiltroData(
  cred: OmieCredenciais,
  dataDe?: string,
  dataAte?: string
): Promise<Record<string, string>> {
  if (!dataDe) return {};
  for (const [de, ate] of CANDIDATOS_FILTRO_DATA) {
    const param: Record<string, unknown> = { nPagina: 1, nRegPorPagina: 1, [de]: dataDe };
    if (dataAte) param[ate] = dataAte;
    try {
      await callOmie(cred, "financas/mf/", "ListarMovimentos", param);
      const filtro: Record<string, string> = { [de]: dataDe };
      if (dataAte) filtro[ate] = dataAte;
      return filtro;
    } catch (e) {
      if (e instanceof Error && tagInvalida(e.message)) continue; // tag inválida → próximo
      throw e; // erro real (credencial, rede, etc.)
    }
  }
  return {};
}

/**
 * Lista os Movimentos Financeiros de RECEITA (contas a receber), paginando.
 * Esta é a fonte usada na sincronização real, pois traz os valores realizados
 * (recebido/aberto/desconto/juros/multa). O filtro de data é descoberto em
 * runtime e a trava final por competência (data de emissão) é aplicada aqui.
 */
export async function listarMovimentosReceber(
  cred: OmieCredenciais,
  opcoes: { dataDe?: string; dataAte?: string; debug?: boolean; maxPaginas?: number } = {}
): Promise<ResultadoSincOmie> {
  const nRegPorPagina = 500;
  const maxPaginas = opcoes.maxPaginas ?? 40; // limite de segurança (nunca trava)
  const emissaoMin = brParaIso(opcoes.dataDe);

  // Descobre o filtro de data válido para este endpoint (best effort).
  const filtroData = await descobrirFiltroData(cred, opcoes.dataDe, opcoes.dataAte);
  const filtroUsado = Object.keys(filtroData)[0] ?? "nenhum";

  const categorias = await mapaCategorias(cred);
  const contas: ContaReceber[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let totalRegistros = 0;
  let amostraBruta: Record<string, unknown> | undefined;
  let truncado = false;
  let paginasSemQualificar = 0;

  do {
    const param: Record<string, unknown> = {
      nPagina: pagina,
      nRegPorPagina,
      cOrdenarPor: "CODIGO",
      cOrdemDecrescente: "S", // mais recentes primeiro
      ...filtroData,
    };

    const resp = await callOmie<{
      nTotPaginas?: number;
      nTotRegistros?: number;
      movimentos?: Record<string, unknown>[];
    }>(cred, "financas/mf/", "ListarMovimentos", param);

    totalPaginas = resp.nTotPaginas ?? 1;
    totalRegistros = resp.nTotRegistros ?? 0;
    const lote = resp.movimentos ?? [];
    if (pagina === 1 && lote.length > 0) amostraBruta = lote[0];

    let qualificaramNaPagina = 0;
    for (const mov of lote) {
      if (!ehReceita(mov)) continue;
      const conta = omieMovimentoParaContaReceber(mov);
      if (categorias[conta.categoria]) conta.categoria = categorias[conta.categoria];
      if (emissaoMin && conta.dataEmissao && conta.dataEmissao < emissaoMin) continue;
      contas.push(conta);
      qualificaramNaPagina++;
    }

    // Parada antecipada: ordenado por código desc, ao passar do corte de 2025
    // (página inteira sem títulos qualificados), encerra. Exige já termos
    // coletado algo, para não parar logo na 1ª página.
    if (emissaoMin && qualificaramNaPagina === 0 && contas.length > 0) {
      paginasSemQualificar++;
      if (paginasSemQualificar >= 2) break;
    } else {
      paginasSemQualificar = 0;
    }

    if (pagina >= maxPaginas && pagina < totalPaginas) {
      truncado = true;
      break;
    }

    pagina++;
    if (pagina <= totalPaginas) await sleep(200);
  } while (pagina <= totalPaginas);

  const competencias = Array.from(
    new Set(contas.map((c) => mesDe(c.dataEmissao)).filter(Boolean))
  ).sort();

  return {
    contas,
    totalRegistros,
    totalPaginas,
    amostraBruta: opcoes.debug ? amostraBruta : undefined,
    filtroUsado,
    paginasLidas: pagina > totalPaginas ? totalPaginas : pagina,
    competencias,
    truncado,
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
  // Diagnóstico da sincronização
  filtroUsado?: string;
  paginasLidas?: number;
  competencias?: string[];
  truncado?: boolean;
  // Diagnóstico do cruzamento com Movimentos Financeiros
  enriquecidos?: number;
  paginasMF?: number;
  truncadoMF?: boolean;
}

/**
 * Amostra crua do endpoint de Movimentos Financeiros (financas/mf).
 * É aqui que ficam os valores realizados: pago, aberto, desconto, juros, multa.
 */
export async function amostrarMovimentos(cred: OmieCredenciais): Promise<{
  totalRegistros: number;
  totalPaginas: number;
  camposDetalhes: string[];
  camposResumo: string[];
  amostraBruta?: Record<string, unknown>;
}> {
  const resp = await callOmie<Record<string, unknown>>(cred, "financas/mf/", "ListarMovimentos", {
    nPagina: 1,
    nRegPorPagina: 3,
  });
  const movimentos = (resp.movimentos as Record<string, unknown>[]) ?? [];
  const primeiro = movimentos[0];
  const detalhes = (primeiro?.detalhes as Record<string, unknown>) ?? {};
  const resumo = (primeiro?.resumo as Record<string, unknown>) ?? {};
  return {
    totalRegistros: (resp.nTotRegistros as number) ?? 0,
    totalPaginas: (resp.nTotPaginas as number) ?? 0,
    camposDetalhes: Object.keys(detalhes),
    camposResumo: Object.keys(resumo),
    amostraBruta: primeiro,
  };
}

/**
 * Amostra rápida de UMA página pequena de Contas a Receber, devolvendo o
 * primeiro registro BRUTO do Omie e a lista de campos — modo debug.
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
/** "01/01/2025" -> "2025-01-01" (para comparação de competência). */
function brParaIso(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export async function listarContasReceber(
  cred: OmieCredenciais,
  opcoes: {
    dataDe?: string;
    dataAte?: string;
    emissaoMin?: string; // ISO YYYY-MM-DD (trava de competência inicial)
    emissaoMax?: string; // ISO YYYY-MM-DD (trava de competência final)
    debug?: boolean;
    maxPaginas?: number;
    // Cruzamento com Movimentos Financeiros (desconto/juros/recebido líquido)
    enriquecerMF?: boolean;
    pagtoDe?: string; // dd/mm/aaaa
    pagtoAte?: string; // dd/mm/aaaa
  } = {}
): Promise<ResultadoSincOmie> {
  const registrosPorPagina = 500;
  const maxPaginas = opcoes.maxPaginas ?? 60;
  const todas: Record<string, unknown>[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let totalRegistros = 0;
  let truncado = false;
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
    if (pagina >= maxPaginas && pagina < totalPaginas) {
      truncado = true;
      break;
    }
    pagina++;
    if (pagina <= totalPaginas) await sleep(200);
  } while (pagina <= totalPaginas);

  // Trava por competência (data de emissão): no intervalo [emissaoMin, emissaoMax].
  const emissaoMin = opcoes.emissaoMin ?? brParaIso(opcoes.dataDe);
  const emissaoMax = opcoes.emissaoMax;
  const categorias = await mapaCategorias(cred);
  let contas = todas.map((raw) => {
    const conta = omieParaContaReceber(raw);
    if (categorias[conta.categoria]) conta.categoria = categorias[conta.categoria];
    return conta;
  });
  contas = contas.filter((c) => {
    if (!c.dataEmissao) return true;
    if (emissaoMin && c.dataEmissao < emissaoMin) return false;
    if (emissaoMax && c.dataEmissao > emissaoMax) return false;
    return true;
  });

  // Cruzamento opcional com Movimentos Financeiros (valores realizados).
  let enriquecimento: { enriquecidos: number; paginasMF: number; truncadoMF: boolean } | undefined;
  if (opcoes.enriquecerMF && opcoes.pagtoDe && contas.length > 0) {
    enriquecimento = await enriquecerComMF(cred, contas, opcoes.pagtoDe, opcoes.pagtoAte);
  }

  const competencias = Array.from(
    new Set(contas.map((c) => mesDe(c.dataEmissao)).filter(Boolean))
  ).sort();

  return {
    contas,
    totalRegistros,
    totalPaginas,
    amostraBruta: opcoes.debug ? amostraBruta : undefined,
    filtroUsado: opcoes.dataDe ? "filtrar_por_data_de" : "nenhum",
    paginasLidas: pagina > totalPaginas ? totalPaginas : pagina,
    competencias,
    truncado,
    enriquecidos: enriquecimento?.enriquecidos,
    paginasMF: enriquecimento?.paginasMF,
    truncadoMF: enriquecimento?.truncadoMF,
  };
}
