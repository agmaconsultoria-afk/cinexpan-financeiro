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
    `$bodyText = [System.IO.File]::ReadAllText('${bodyFilePs}', [System.Text.Encoding]::UTF8)`,
    `$req = [System.Net.WebRequest]::Create('${url}')`,
    "$req.Method = 'POST'",
    "$req.ContentType = 'application/json'",
    "$bytes = [System.Text.Encoding]::UTF8.GetBytes($bodyText)",
    "$req.ContentLength = $bytes.Length",
    "$ws = $req.GetRequestStream()",
    "$ws.Write($bytes, 0, $bytes.Length)",
    "$ws.Close()",
    "try {",
    "  $resp = $req.GetResponse()",
    "  $code = [int]$resp.StatusCode",
    "  $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)",
    "  Write-Output $code",
    "  Write-Output $reader.ReadToEnd()",
    "} catch [System.Net.WebException] {",
    "  $wr = $_.Exception.Response",
    "  if ($wr -ne $null) {",
    "    $code = [int]$wr.StatusCode",
    "    $reader = New-Object System.IO.StreamReader($wr.GetResponseStream(), [System.Text.Encoding]::UTF8)",
    "    Write-Output $code",
    "    Write-Output $reader.ReadToEnd()",
    "  } else {",
    "    Write-Output 0",
    "    Write-Output $_.Exception.Message",
    "  }",
    "}",
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
  tentativasRestantes = 3
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
    // Resposta malformada (às vezes o Omie devolve HTML/erro parcial) — costuma ser
    // transitória, então espera e tenta de novo.
    if (tentativasRestantes > 0) {
      await sleep(2000);
      return callOmie<T>(cred, recurso, call, param, tentativasRestantes - 1);
    }
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
    // Erro transitório do servidor do Omie (resposta quebrada / indisponível) —
    // aguarda um pouco e tenta novamente.
    if (/broken response|application server|soap-error|serviço|servidor|timeout|indispon/i.test(fs) && tentativasRestantes > 0) {
      await sleep(2500);
      return callOmie<T>(cred, recurso, call, param, tentativasRestantes - 1);
    }
    // Trava de concorrência do Omie (mesmo método chamado ao mesmo tempo) —
    // aguarda um pouco (escalonado) e repete.
    if (/sendo executada|existe uma requisi/i.test(fs) && tentativasRestantes > 0) {
      await sleep(1500 + (3 - tentativasRestantes) * 1500);
      return callOmie<T>(cred, recurso, call, param, tentativasRestantes - 1);
    }
    throw new Error(`Omie: ${fs}`);
  }
  if (status < 200 || status >= 300) {
    // Inclui corpo da resposta para facilitar diagnóstico
    const detalhe = JSON.stringify(json).slice(0, 500);
    throw new Error(`Omie HTTP ${status} [${call}]: ${detalhe}`);
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

// ===================== Notas Fiscais de Saída (produtos/nf) =====================

export interface NotaFiscalItem {
  dataEmissao: string; // ISO YYYY-MM-DD or ""
  nf: string;
  serie: string;
  clienteNome: string;
  clienteDoc: string;
  produto: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  totalMercadoria: number;
  operacao: string;
  natOp: string;
  finNFe: string;
  situacao: string;
  tags: string;
  cfop: string;
  categoria?: string; // compl.cCodCateg (categoria financeira do Omie)
  nIdPedido?: number; // compl.nIdPedido (pedido de venda de origem, 0 se não houver)
  nIdReceb?: number; // compl.nIdReceb (recebimento de origem, ≠ 0 em entradas/devoluções)
  devolvido?: string; // pedido.cDevolvido (S = pedido devolvido)
  devParcial?: string; // pedido.cDevParcial (S = devolução parcial)
  vencimento?: string;
}

function mapearSituacaoNF(raw: string): string {
  const v = raw.toUpperCase().replace(/[\s_]/g, "");
  if (v === "S" || v === "AUTORIZADO" || v === "AUTORIZADA" || v === "NORMAL") return "Autorizado";
  if (v === "C" || v === "CANCELADO" || v === "CANCELADA") return "Cancelado";
  if (v === "E" || v === "DIGITACAO" || v === "EMDIGITACAO") return "Em digitação";
  if (v === "D" || v === "DEVOLUCAO") return "Devolução";
  return raw || "—";
}

export async function listarNotasFiscais(
  cred: OmieCredenciais,
  opcoes: { dataDe?: string; dataAte?: string; maxPaginas?: number } = {}
): Promise<{ itens: NotaFiscalItem[]; totalNFs: number; truncado: boolean; fonte: string; primeiroRegistroBruto?: unknown; primeiroCompl?: Record<string, unknown>; excluidas?: { nf: string; dataEmissao: string; operacao: string; cfops: string; total: number }[] }> {
  const maxPaginas = opcoes.maxPaginas ?? 60;
  const itens: NotaFiscalItem[] = [];
  const excluidas: { nf: string; dataEmissao: string; operacao: string; cfops: string; total: number }[] = [];
  let primeiroRegistroBruto: unknown;
  let primeiroCompl: Record<string, unknown> | undefined;
  let pagina = 1;
  let totalPaginas = 1;
  let totalNFs = 0;
  let truncado = false;

  // Estratégia 1: produtos/nfconsultar ListarNF (endpoint de consulta de NF)
  // Estratégia 2: produtos/nf ListarNFe (endpoint de emissão de NF)
  // Estratégia 3: pedido/pedido_venda_produto ListarPedidos (etapa 70 = faturado)
  // Estratégia 4: financas/contareceber (fallback — módulos NF/pedido não disponíveis)
  type Fonte = "nfconsultar" | "nf" | "pedido" | "financas";
  let fonte: Fonte = "nfconsultar";
  let fonteConfirmada = false;
  let paginasProcessadas = 0;

  const buildParamNF = (p: number): Record<string, unknown> => {
    // cDetalhesPedido: "S" faz o Omie devolver o objeto `pedido` (com opPedido =
    // a "Operação" que o relatório usa: Pedido de Venda / Remessa / Devolução).
    // Como isso deixa a resposta bem mais pesada, usamos 50 registros/página para
    // não estourar o limite do servidor do Omie (erro "Broken response (BG)").
    const pm: Record<string, unknown> = { pagina: p, registros_por_pagina: 50, cDetalhesPedido: "S" };
    if (opcoes.dataDe) pm.filtrar_por_data_de = opcoes.dataDe;
    if (opcoes.dataAte) pm.filtrar_por_data_ate = opcoes.dataAte;
    return pm;
  };

  const buildParamPedido = (p: number): Record<string, unknown> => {
    const pm: Record<string, unknown> = {
      pagina: p, registros_por_pagina: 50,
      apenas_importado_api: "N", filtrar_por_etapa: "70",
    };
    if (opcoes.dataDe) pm.filtrar_por_data_de = opcoes.dataDe;
    if (opcoes.dataAte) pm.filtrar_por_data_ate = opcoes.dataAte;
    return pm;
  };

  const buildParamCR = (p: number): Record<string, unknown> => {
    const pm: Record<string, unknown> = { pagina: p, registros_por_pagina: 50, apenas_importado_api: "N" };
    if (opcoes.dataDe) pm.filtrar_por_data_de = opcoes.dataDe;
    if (opcoes.dataAte) pm.filtrar_por_data_ate = opcoes.dataAte;
    return pm;
  };

  // Extrai lista e totais de uma resposta de NF (nfconsultar ou nf direto)
  function extrairNFResp(r: Record<string, unknown>): { lista: Record<string, unknown>[]; pags: number; total: number } {
    const lista = (r.nfCadastro ?? r.nfRetorno ?? r.listaNF ?? r.lista ?? []) as Record<string, unknown>[];
    return { lista, pags: (r.total_de_paginas as number) ?? 1, total: (r.total_de_registros as number) ?? 0 };
  }

  // nfconsultar ignora filtrar_por_data_de e retorna todas as NFs em ordem crescente de nNF.
  // Busca binária (O(log N) chamadas) encontra a primeira página do período e paginamos
  // para frente a partir daí — Jan/2026 a Jun/2026 são alcançados em ~11 + ~21 chamadas.
  if (opcoes.dataDe || opcoes.dataAte) {
    try {
      // Mesmo tamanho de página do fetch principal (50) para a indexação de
      // páginas bater — a busca binária só lê datas, então dispensa cDetalhesPedido.
      const probe = await callOmie<Record<string, unknown>>(
        cred, "produtos/nfconsultar/", "ListarNF",
        { pagina: 1, registros_por_pagina: 50 }
      );
      const ex = extrairNFResp(probe);
      totalPaginas = ex.pags;
      totalNFs = ex.total;
      fonte = "nfconsultar";
      fonteConfirmada = true;

      const deIso = brParaIso(opcoes.dataDe);
      if (deIso) {
        // Busca binária sem sleep: log₂(1263) ≈ 10 chamadas para localizar a página inicial
        let low = 1, high = totalPaginas;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          try {
            const rm = await callOmie<Record<string, unknown>>(
              cred, "produtos/nfconsultar/", "ListarNF",
              { pagina: mid, registros_por_pagina: 50 }
            );
            const lm = extrairNFResp(rm).lista;
            const ideLast = (lm[lm.length - 1]?.ide as Record<string, unknown>) ?? {};
            const dataNova = dataIso(ideLast.dEmi);
            if (!dataNova || dataNova < deIso) {
              low = mid + 1; // toda a página é anterior a dataDe → busca na metade superior
            } else {
              high = mid;    // há NFs no período ou mais novas → pode estar aqui ou antes
            }
          } catch { low = mid + 1; }
          // sem sleep entre passos — busca binária é rápida e não gera paginação pesada
        }
        // Recua algumas páginas: as NFs não vêm em ordem perfeita de data (emissão
        // fora de ordem, entrega futura), então damos margem para não perder o começo
        // do mês. O pós-filtro por data remove o que vier de fora do período.
        pagina = Math.max(1, low - 5);
      }
      // paginaStep = 1 (padrão) → avança para frente a partir de pagina
    } catch {
      // nfconsultar indisponível — loop principal tentará produtos/nf, pedido, financas
    }
  }

  // OTIMIZAÇÃO: quando o nfconsultar já foi confirmado pela busca binária, buscamos
  // as páginas do mês em LOTES CONCORRENTES (várias ao mesmo tempo) em vez de uma a
  // uma. As respostas com cDetalhesPedido são pesadas; paralelizar reduz muito o
  // tempo total. Paramos o pré-carregamento assim que uma página passa de dataAte.
  let bufferPaginas: Record<string, unknown>[][] | null = null;
  let bufIdx = 0;
  if (fonteConfirmada && fonte === "nfconsultar") {
    bufferPaginas = [];
    const ateIso = brParaIso(opcoes.dataAte);
    const CONC = 2; // páginas simultâneas (o Omie trava chamadas concorrentes do mesmo método)
    let p = pagina;
    let parar = false;
    let pgsAlemDoFim = 0; // páginas consecutivas totalmente após dataAte
    while (!parar && p <= totalPaginas && bufferPaginas.length < maxPaginas) {
      const lote: number[] = [];
      for (let k = 0; k < CONC && p + k <= totalPaginas; k++) lote.push(p + k);
      const respostas = await Promise.all(
        lote.map((pg) =>
          callOmie<Record<string, unknown>>(cred, "produtos/nfconsultar/", "ListarNF", buildParamNF(pg))
            .then((r) => extrairNFResp(r).lista)
            .catch(() => [] as Record<string, unknown>[])
        )
      );
      for (const l of respostas) {
        bufferPaginas.push(l);
        // Early stop robusto: só paramos quando a MENOR data da página já passou de
        // dataAte (página inteira fora do período) por 2 páginas seguidas — assim
        // uma NF fora de ordem não interrompe a leitura no meio do mês.
        if (ateIso && l.length > 0) {
          let menor: string | null = null;
          for (const reg of l) {
            const ide = (reg.ide as Record<string, unknown>) ?? {};
            const d = dataIso(ide.dEmi);
            if (d && (!menor || d < menor)) menor = d;
          }
          if (menor && menor > ateIso) {
            pgsAlemDoFim++;
            if (pgsAlemDoFim >= 2) { parar = true; break; }
          } else {
            pgsAlemDoFim = 0;
          }
        }
      }
      p += CONC;
      if (!parar && p <= totalPaginas) await sleep(50);
    }
  }

  do {
    let lista: Record<string, unknown>[] = [];

    if (bufferPaginas) {
      // Consome as páginas já pré-carregadas (busca concorrente acima).
      lista = bufferPaginas[bufIdx] ?? [];
      bufIdx++;
    } else if (!fonteConfirmada) {
      // Tenta nfconsultar primeiro (endpoint de consulta de NF)
      try {
        const r = await callOmie<Record<string, unknown>>(
          cred, "produtos/nfconsultar/", "ListarNF", buildParamNF(pagina)
        );
        const ex = extrairNFResp(r);
        totalPaginas = ex.pags; totalNFs = ex.total; lista = ex.lista;
        fonte = "nfconsultar"; fonteConfirmada = true;
      } catch {
        // Tenta produtos/nf direto
        try {
          const r = await callOmie<Record<string, unknown>>(
            cred, "produtos/nf/", "ListarNFe", buildParamNF(pagina)
          );
          const ex = extrairNFResp(r);
          totalPaginas = ex.pags; totalNFs = ex.total; lista = ex.lista;
          fonte = "nf"; fonteConfirmada = true;
        } catch {
          try {
            const r2 = await callOmie<{
              pedido_venda_produto_lista?: Record<string, unknown>[];
              lista_pedidos?: Record<string, unknown>[];
              total_de_paginas?: number;
              total_de_registros?: number;
            }>(cred, "pedido/pedido_venda_produto/", "ListarPedidos", buildParamPedido(pagina));
            totalPaginas = r2.total_de_paginas ?? 1;
            totalNFs = r2.total_de_registros ?? 0;
            lista = (r2.pedido_venda_produto_lista ?? r2.lista_pedidos ?? []) as Record<string, unknown>[];
            fonte = "pedido"; fonteConfirmada = true;
          } catch {
            // Conta sem módulo NF/pedido → usa contas a receber como proxy
            const r3 = await callOmie<ListarResponse>(
              cred, "financas/contareceber/", "ListarContasReceber", buildParamCR(pagina)
            );
            totalPaginas = r3.total_de_paginas ?? 1;
            totalNFs = r3.total_de_registros ?? 0;
            lista = r3.conta_receber_cadastro ?? [];
            fonte = "financas"; fonteConfirmada = true;
          }
        }
      }
    } else if (fonte === "nfconsultar") {
      const r = await callOmie<Record<string, unknown>>(
        cred, "produtos/nfconsultar/", "ListarNF", buildParamNF(pagina)
      );
      const ex = extrairNFResp(r);
      totalPaginas = ex.pags; totalNFs = ex.total; lista = ex.lista;
    } else if (fonte === "nf") {
      const r = await callOmie<Record<string, unknown>>(
        cred, "produtos/nf/", "ListarNFe", buildParamNF(pagina)
      );
      const ex = extrairNFResp(r);
      totalPaginas = ex.pags; totalNFs = ex.total; lista = ex.lista;
    } else if (fonte === "pedido") {
      const r2 = await callOmie<{
        pedido_venda_produto_lista?: Record<string, unknown>[];
        lista_pedidos?: Record<string, unknown>[];
        total_de_paginas?: number;
        total_de_registros?: number;
      }>(cred, "pedido/pedido_venda_produto/", "ListarPedidos", buildParamPedido(pagina));
      totalPaginas = r2.total_de_paginas ?? 1;
      totalNFs = r2.total_de_registros ?? 0;
      lista = (r2.pedido_venda_produto_lista ?? r2.lista_pedidos ?? []) as Record<string, unknown>[];
    } else {
      const r3 = await callOmie<ListarResponse>(
        cred, "financas/contareceber/", "ListarContasReceber", buildParamCR(pagina)
      );
      totalPaginas = r3.total_de_paginas ?? 1;
      totalNFs = r3.total_de_registros ?? 0;
      lista = r3.conta_receber_cadastro ?? [];
    }

    // Salva primeiro registro bruto para diagnóstico (quando itens = 0)
    if (!primeiroRegistroBruto && lista.length > 0) {
      primeiroRegistroBruto = lista[0];
    }

    for (const registro of lista) {
      if (fonte === "nfconsultar") {
        // ---- Parsing de produtos/nfconsultar ----
        // Estrutura confirmada via ConsultarNF:
        //   ide: nNF, serie, dEmi, dCan, cDeneg — cabeçalho da NF
        //   nfDestInt: cRazao, cnpj_cpf — destinatário
        //   det[].prod: xProd, qCom, vUnCom, vProd, uCom, CFOP
        //   total.ICMSTot: vNF — total da NF
        //   info: dInc, dAlt — apenas auditoria, NÃO contém nNF
        //   compl: cCodCateg
        const ide = (registro.ide as Record<string, unknown>) ?? {};
        const compl = (registro.compl as Record<string, unknown>) ?? {};
        if (!primeiroCompl) primeiroCompl = compl;
        const det = (registro.det as Record<string, unknown>[]) ?? [];
        const destInt = (registro.nfDestInt as Record<string, unknown>) ?? (registro.dest as Record<string, unknown>) ?? {};
        const totalObj = (registro.total as Record<string, unknown>) ?? {};
        const totICMS = (totalObj.ICMSTot as Record<string, unknown>) ?? {};

        // nNF fica em ide, já pode vir zerado em NFs inválidas
        const nfNumRaw = (ide.nNF ?? "").toString().replace(/^0+/, "");
        if (!nfNumRaw) continue;
        const nfNum = nfNumRaw.padStart(8, "0");

        const serie = (ide.serie ?? "").toString();
        const dataEmissao = dataIso(ide.dEmi) ?? "";

        // tpNF: "0"=entrada (devolução/compra), "1"=saída (venda) — descarta entradas
        // finNFe: "4"=devolução de saída — também exclui (não conta no faturamento bruto)
        const tpNF = (ide.tpNF ?? "1").toString();
        const finNFe = (ide.finNFe ?? "1").toString();
        if (tpNF === "0" || finNFe === "4") continue;

        // dCan não-vazio = cancelada; cDeneg="S" = denegada pela SEFAZ
        const dCan = (ide.dCan ?? "").toString().trim();
        const cDeneg = (ide.cDeneg ?? "").toString().toUpperCase();
        const situacao = dCan ? "Cancelado" : cDeneg === "S" ? "Denegado" : "Autorizado";
        // Canceladas e denegadas não entram no faturamento
        if (situacao !== "Autorizado") continue;

        const natOp = (ide.natOp ?? "").toString();
        const clienteNome = (pega(destInt, "cRazao", "xNome") ?? "").toString();
        const clienteDoc = (pega(destInt, "cnpj_cpf", "CNPJ", "CPF") ?? "").toString();

        // A "Operação" do relatório do Omie vem do objeto `pedido` (retornado por
        // cDetalhesPedido="S"): pedido.opPedido = "Pedido de Venda" / "Remessa de
        // Produto" / "Devolução de Venda" etc.
        const categoria = (compl.cCodCateg ?? "").toString();
        const nIdPedido = num(compl.nIdPedido);
        const nIdReceb = num(compl.nIdReceb);
        const pedidoObj = (registro.pedido as Record<string, unknown>) ?? {};
        const opPedido = (pedidoObj.opPedido ?? "").toString().trim();
        const devolvido = (pedidoObj.cDevolvido ?? "").toString().trim().toUpperCase();
        const devParcial = (pedidoObj.cDevParcial ?? "").toString().trim().toUpperCase();
        // opPedido é o código da operação do pedido no Omie:
        //   11 = Pedido de Venda (faturamento)   14 = Remessa de Produto (não é venda)
        const rotuloOp: Record<string, string> = { "11": "Pedido de Venda", "14": "Remessa de Produto" };
        const operacaoNF = rotuloOp[opPedido] ?? (opPedido ? `Operação ${opPedido}` : "(sem pedido)");

        // Registra a NF na lista de excluídas (diagnóstico) e pula.
        const registrarExcluida = (motivo: string) => {
          if (det.length > 0) {
            const cfopsNF = Array.from(new Set(det.map((item) => {
              const prod = (item.prod as Record<string, unknown>) ?? {};
              return ((pega(prod, "CFOP", "cfop") ?? "").toString()).replace(/\./g, "");
            }).filter(Boolean))).join(", ");
            const totalNF = det.reduce((s, item) => {
              const prod = (item.prod as Record<string, unknown>) ?? {};
              return s + num(pega(prod, "vProd", "vTotItem", "nCMCTotal") ?? 0);
            }, 0);
            excluidas.push({ nf: nfNum, dataEmissao, operacao: motivo, cfops: cfopsNF, total: totalNF });
          }
        };

        // Remessa (opPedido 14) não é faturamento de venda — fica de fora.
        if (opPedido === "14") {
          registrarExcluida(operacaoNF);
          continue;
        }

        // Notas com devolução (total ou parcial) não entram no faturamento —
        // o relatório do Omie as separa como "Devolução de Venda".
        if (devolvido === "S" || devParcial === "S") {
          registrarExcluida(devParcial === "S" ? "Devolução parcial" : "Devolvido (total)");
          continue;
        }

        // CFOP 5.116/6.116 = entrega de venda originada de encomenda (entrega
        // futura). A receita já foi reconhecida no simples faturamento (5.922/
        // 6.922) — contar a entrega também DUPLICARIA o faturamento.
        const CFOPS_ENTREGA_FUTURA = new Set(["5116", "6116"]);
        const soEntregaFutura =
          det.length > 0 &&
          det.every((item) => {
            const prod = (item.prod as Record<string, unknown>) ?? {};
            const cf = ((pega(prod, "CFOP", "cfop") ?? "").toString()).replace(/\./g, "");
            return CFOPS_ENTREGA_FUTURA.has(cf);
          });
        if (soEntregaFutura) {
          registrarExcluida("Entrega futura (5116/6116)");
          continue;
        }

        if (det.length > 0) {
          for (const item of det) {
            const prod = (item.prod as Record<string, unknown>) ?? {};
            // CFOP vem como "5.101" — normaliza removendo o ponto
            const cfopRaw = (pega(prod, "CFOP", "cfop") ?? "").toString();
            const cfop = cfopRaw.replace(/\./g, "");
            // Item de entrega futura em NF mista — também fica fora do faturamento
            if (CFOPS_ENTREGA_FUTURA.has(cfop)) continue;
            itens.push({
              dataEmissao, nf: nfNum, serie,
              clienteNome: clienteNome || clienteDoc, clienteDoc,
              produto: (pega(prod, "xProd", "cDescricao") ?? "").toString(),
              quantidade: num(pega(prod, "qCom") ?? 0),
              unidade: (pega(prod, "uCom") ?? "").toString(),
              valorUnitario: num(pega(prod, "vUnCom") ?? 0),
              // nCMCTotal é CMC (custo), vProd é o valor real do produto
              totalMercadoria: num(pega(prod, "vProd", "vTotItem", "nCMCTotal") ?? 0),
              operacao: operacaoNF, natOp, finNFe, situacao, tags: "", cfop, categoria, nIdPedido, nIdReceb, devolvido, devParcial,
            });
          }
        } else {
          // det vazio em modo listagem — linha resumo por NF com total.ICMSTot.vProd
          const valorNF = num(pega(totICMS, "vProd", "vNF") ?? 0);
          itens.push({
            dataEmissao, nf: nfNum, serie,
            clienteNome: clienteNome || clienteDoc, clienteDoc,
            produto: "", quantidade: 1, unidade: "", valorUnitario: valorNF,
            totalMercadoria: valorNF,
            operacao: operacaoNF, natOp, finNFe, situacao, tags: "", cfop: "", categoria, nIdPedido, nIdReceb, devolvido, devParcial,
          });
        }
      } else if (fonte === "nf") {
        // ---- Parsing do formato NF direto (produtos/nf/ListarNFe) ----
        const cab = (registro.cabecalho as Record<string, unknown>) ?? {};
        const info = (registro.informacoes_adicionais as Record<string, unknown>) ?? {};
        const det = (registro.det as Record<string, unknown>[]) ?? [];
        const nfNumRaw = (pega(cab, "nNF", "numero_nf", "cNumNF") ?? "").toString();
        const nfNum = nfNumRaw.padStart(8, "0");
        const serie = (pega(cab, "serie", "cSerie") ?? "").toString();
        const dataEmissao = dataIso(pega(cab, "dEmi", "data_emissao")) ?? "";
        const clienteNome = (pega(cab, "cRazao", "razao_social", "cNome", "nome_cliente") ?? "").toString();
        const clienteDoc = (pega(cab, "cCPFCNPJ", "cpf_cnpj", "cDocumento") ?? "").toString();
        const operacao = (pega(cab, "cOperacao", "operacao", "cTipoOperacao") ?? "").toString();
        const situacao = mapearSituacaoNF((pega(cab, "cSitNF", "situacao", "cStatus") ?? "").toString());
        const tagsArr = (info.tags as Record<string, unknown>[]) ?? [];
        const tags = tagsArr.map((t) => (t.tag ?? t.cTag ?? "").toString()).filter(Boolean).join(", ");
        for (const item of det) {
          const prod = (item.produto as Record<string, unknown>) ?? {};
          const imp = (item.imposto as Record<string, unknown>) ?? {};
          const icms = (imp.icms as Record<string, unknown>) ?? {};
          const cfop = (pega(prod, "cfop", "cCFOP") ?? pega(icms, "cfop", "cCFOP") ?? "").toString();
          itens.push({
            dataEmissao, nf: nfNum, serie,
            clienteNome: clienteNome || clienteDoc, clienteDoc,
            produto: (pega(prod, "cDescricao", "descricao", "nome_produto") ?? "").toString(),
            quantidade: num(pega(prod, "nQtde", "quantidade", "qtde") ?? 0),
            unidade: (pega(prod, "cUnidade", "unidade") ?? "").toString(),
            valorUnitario: num(pega(prod, "nValUnit", "valor_unitario") ?? 0),
            totalMercadoria: num(pega(prod, "nValorTotal", "valor_total", "nTotProd") ?? 0),
            operacao, natOp: "", finNFe: "", situacao, tags, cfop,
          });
        }
      } else if (fonte === "pedido") {
        // ---- Parsing do formato Pedido de Venda ----
        const cab = (registro.cabecalho as Record<string, unknown>) ?? {};
        const info = (registro.informacoes_adicionais as Record<string, unknown>) ?? {};
        const det = (registro.det as Record<string, unknown>[]) ?? [];
        const nfNumRaw = (pega(cab, "numero_nota", "nNF", "numero_pedido") ?? "").toString();
        if (!nfNumRaw || nfNumRaw === "0") continue;
        const nfNum = nfNumRaw.padStart(8, "0");
        const serie = (pega(cab, "serie_nota", "serie") ?? "").toString();
        const dataEmissao = dataIso(pega(cab, "data_nota", "data_previsao")) ?? "";
        const clienteNome = (pega(info, "nome_cliente", "contato") ?? "").toString();
        const clienteDoc = (pega(info, "cpf_cnpj_cliente", "cCPFCNPJ") ?? "").toString();
        const etapa = (pega(cab, "etapa") ?? "").toString();
        const situacao = etapa === "70" ? "Autorizado" : mapearSituacaoNF(etapa);
        for (const item of det) {
          const prod = (item.produto as Record<string, unknown>) ?? {};
          const cfop = (pega(prod, "cfop", "cCFOP") ?? "").toString();
          itens.push({
            dataEmissao, nf: nfNum, serie,
            clienteNome: clienteNome || clienteDoc, clienteDoc,
            produto: (pega(prod, "descricao", "cDescricao", "nome_produto") ?? "").toString(),
            quantidade: num(pega(prod, "quantidade", "nQtde") ?? 0),
            unidade: (pega(prod, "unidade", "cUnidade") ?? "").toString(),
            valorUnitario: num(pega(prod, "valor_unitario", "nValUnit") ?? 0),
            totalMercadoria: num(pega(prod, "valor_total", "nValorTotal") ?? 0),
            operacao: "Pedido de Venda", natOp: "", finNFe: "", situacao, tags: "", cfop,
          });
        }
      } else {
        // ---- Parsing de Contas a Receber (financas/contareceber) — proxy para NF ----
        const conta = omieParaContaReceber(registro);
        const nfNum = (conta.notaFiscal || conta.numeroDoc || "").toString();
        if (!nfNum) continue;
        const eCancelado = /cancel/i.test(conta.situacao);
        itens.push({
          dataEmissao: conta.dataEmissao ?? "",
          nf: nfNum,
          serie: conta.parcela || "",
          clienteNome: conta.cliente || conta.clienteDoc || "",
          clienteDoc: conta.clienteDoc || "",
          produto: conta.categoria || conta.operacao || "",
          quantidade: 0,
          unidade: "",
          valorUnitario: 0,
          totalMercadoria: conta.valorConta,
          operacao: conta.operacao || "",
          natOp: "",
          finNFe: "",
          situacao: eCancelado ? "Cancelado" : "Autorizado",
          tags: conta.situacao, // status de pagamento no campo tags
          cfop: "",
          vencimento: conta.vencimento ?? "",
        });
      }
    }

    paginasProcessadas++;

    // Modo buffer (nfconsultar concorrente): apenas avança no buffer já carregado.
    if (bufferPaginas) {
      if (bufIdx >= bufferPaginas.length || paginasProcessadas >= maxPaginas) break;
      continue;
    }

    // Early stop: quando a NF mais antiga desta página já é posterior a dataAte,
    // todas as páginas seguintes serão ainda mais novas — nada mais a encontrar.
    if (fonte === "nfconsultar" && fonteConfirmada && opcoes.dataAte) {
      const ateIso = brParaIso(opcoes.dataAte);
      if (ateIso && lista.length > 0) {
        const ide0 = (lista[0]?.ide as Record<string, unknown>) ?? {};
        const dataAntiga = dataIso(ide0.dEmi);
        if (dataAntiga && dataAntiga > ateIso) break;
      }
    }

    if (paginasProcessadas >= maxPaginas) {
      truncado = pagina < totalPaginas;
      break;
    }
    pagina++;
    if (pagina > totalPaginas) break;
    // nfconsultar: sleep curto entre páginas (busca binária já localizou o mês)
    await sleep(fonte === "nfconsultar" ? 40 : 200);
  } while (bufferPaginas ? bufIdx < bufferPaginas.length : pagina <= totalPaginas);

  // Pós-filtro por data de emissão — garante que, mesmo quando o filtro da API
  // é ignorado, só chegam ao cliente os itens do período solicitado.
  if (fonte === "nfconsultar" && (opcoes.dataDe || opcoes.dataAte)) {
    const deIso = brParaIso(opcoes.dataDe);
    const ateIso = brParaIso(opcoes.dataAte);
    const filtrados = itens.filter((item) => {
      if (!item.dataEmissao) return true;
      if (deIso && item.dataEmissao < deIso) return false;
      if (ateIso && item.dataEmissao > ateIso) return false;
      return true;
    });
    itens.length = 0;
    itens.push(...filtrados);
  }

  // Pós-filtro por data também nas NFs excluídas (diagnóstico só do período pedido)
  let excluidasFiltradas = excluidas;
  if (fonte === "nfconsultar" && (opcoes.dataDe || opcoes.dataAte)) {
    const deIso = brParaIso(opcoes.dataDe);
    const ateIso = brParaIso(opcoes.dataAte);
    excluidasFiltradas = excluidas.filter((e) => {
      if (!e.dataEmissao) return true;
      if (deIso && e.dataEmissao < deIso) return false;
      if (ateIso && e.dataEmissao > ateIso) return false;
      return true;
    });
  }

  return { itens, totalNFs, truncado, fonte, primeiroRegistroBruto: itens.length === 0 ? primeiroRegistroBruto : undefined, primeiroCompl, excluidas: excluidasFiltradas };
}

// ===================== Contas a Receber (financas/contareceber) =====================

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

// ===================== Posição de Estoque (contabilidade) =====================

export interface PosicaoEstoqueItem {
  codigo: string; // código/SKU do produto
  descricao: string; // descrição completa
  ncm: string; // "6806.20.00"
  tipoSped: string; // "04-Produto Acabado"
  familia: string; // "ARGILA EXPANDIDA"
  unidade: string; // "SC", "M3"…
  quantidade: number; // saldo físico na data
  cmcUnitario: number; // custo médio contábil unitário
  cmcTotal: number; // quantidade × cmcUnitario
}

// Código SPED do tipo de item (tipoItem no Omie) -> rótulo do relatório.
const TIPO_SPED: Record<string, string> = {
  "00": "00-Mercadoria para Revenda",
  "01": "01-Matéria Prima",
  "02": "02-Embalagem",
  "03": "03-Produto em Processo",
  "04": "04-Produto Acabado",
  "05": "05-Subproduto",
  "06": "06-Produto Intermediário",
  "07": "07-Material de Uso e Consumo",
  "08": "08-Ativo Imobilizado",
  "09": "09-Serviços",
  "10": "10-Outros Insumos",
  "99": "99-Outras",
};

interface ProdMeta {
  codigo: string;
  descricao: string;
  ncm: string;
  tipoSped: string;
  familia: string;
  unidade: string;
}

/** Formata NCM "68062000" -> "6806.20.00". */
function formatarNCM(v: unknown): string {
  const s = (v ?? "").toString().replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  return (v ?? "").toString();
}

/**
 * Cadastro de produtos: mapa (por nCodProd E por código) com NCM, tipo SPED,
 * família, unidade e descrição. A posição de estoque só traz saldo + custo.
 */
async function mapaProdutos(
  cred: OmieCredenciais,
  maxPaginas = 200,
  capturarRaw?: Set<string>
): Promise<{ porCodProd: Map<string, ProdMeta>; porCodigo: Map<string, ProdMeta>; amostra?: Record<string, unknown>; rawPorCodigo: Map<string, Record<string, unknown>> }> {
  const porCodProd = new Map<string, ProdMeta>();
  const porCodigo = new Map<string, ProdMeta>();
  const rawPorCodigo = new Map<string, Record<string, unknown>>();
  let amostra: Record<string, unknown> | undefined;
  let pagina = 1;
  let total = 1;
  do {
    const resp = await callOmie<{
      total_de_paginas?: number;
      produto_servico_cadastro?: Record<string, unknown>[];
    }>(cred, "geral/produtos/", "ListarProdutos", {
      pagina,
      registros_por_pagina: 500,
      apenas_importado_api: "N",
      filtrar_apenas_omiepdv: "N",
    });
    total = resp.total_de_paginas ?? 1;
    const lista = resp.produto_servico_cadastro ?? [];
    if (!amostra && lista.length > 0) amostra = lista[0];
    for (const p of lista) {
      const tipoRaw = (pega(p, "tipoItem", "tipo_item", "cTipoItem") ?? "").toString().padStart(2, "0");
      const meta: ProdMeta = {
        codigo: (pega(p, "codigo", "cCodigo", "codigo_produto_integracao") ?? "").toString(),
        descricao: (pega(p, "descricao", "cDescricao") ?? "").toString(),
        ncm: formatarNCM(pega(p, "ncm", "cNCM")),
        tipoSped: TIPO_SPED[tipoRaw] ?? (tipoRaw ? `${tipoRaw}-Outros` : ""),
        familia: (pega(p, "descricao_familia", "familia", "cDescrFamilia") ?? "").toString(),
        unidade: (pega(p, "unidade", "cUnidade") ?? "").toString(),
      };
      const cod = (pega(p, "codigo_produto", "nCodProd", "codigo_produto_omie") ?? "").toString();
      if (cod) porCodProd.set(cod, meta);
      if (meta.codigo) porCodigo.set(meta.codigo, meta);
      if (capturarRaw && meta.codigo && capturarRaw.has(meta.codigo.toUpperCase())) {
        rawPorCodigo.set(meta.codigo.toUpperCase(), p);
      }
    }
    pagina++;
    if (pagina <= total && pagina <= maxPaginas) await sleep(120);
  } while (pagina <= total && pagina <= maxPaginas);
  return { porCodProd, porCodigo, amostra, rawPorCodigo };
}

/**
 * Posição de Estoque na data informada (dd/mm/aaaa), cruzada com o cadastro de
 * produtos, no layout do relatório de contabilidade. Só itens com saldo != 0.
 */
export async function posicaoEstoque(
  cred: OmieCredenciais,
  opcoes: { dataPosicao: string; incluirZerados?: boolean; debug?: boolean; maxPaginas?: number; debugCodigos?: string[] }
): Promise<{ itens: PosicaoEstoqueItem[]; totalRegistros: number; amostraEstoque?: Record<string, unknown>; amostraProduto?: Record<string, unknown>; debugCampos?: Record<string, unknown>[] }> {
  const maxPaginas = opcoes.maxPaginas ?? 200;
  const alvos = new Set((opcoes.debugCodigos ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean));
  const prod = await mapaProdutos(cred, maxPaginas, alvos.size ? alvos : undefined);

  const itens: PosicaoEstoqueItem[] = [];
  const debugCampos: Record<string, unknown>[] = [];
  let amostraEstoque: Record<string, unknown> | undefined;
  let totalRegistros = 0;
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const resp = await callOmie<{
      nTotPaginas?: number;
      nTotRegistros?: number;
      produtos?: Record<string, unknown>[];
      posicaoEstoque?: Record<string, unknown>[];
      lista?: Record<string, unknown>[];
    }>(cred, "estoque/consulta/", "ListarPosEstoque", {
      nPagina: pagina,
      nRegPorPagina: 500,
      dDataPosicao: opcoes.dataPosicao,
    });
    totalPaginas = resp.nTotPaginas ?? 1;
    totalRegistros = resp.nTotRegistros ?? 0;
    const lista = (resp.produtos ?? resp.posicaoEstoque ?? resp.lista ?? []) as Record<string, unknown>[];
    if (!amostraEstoque && lista.length > 0) amostraEstoque = lista[0];

    for (const e of lista) {
      const saldo = num(pega(e, "fisico", "nSaldo", "saldo", "nFisico", "estoque"));
      // Saldo negativo NÃO entra no estoque contábil (é ruído de movimentação
      // e distorce o total); saldo zerado só entra em modo debug.
      if (saldo < 0) continue;
      if (!opcoes.incluirZerados && saldo < 0.0000001) continue;
      const cmc = num(pega(e, "nCMC", "cmc", "nCustoMedio", "custo_medio", "nValorUnitario"));
      const codProd = (pega(e, "nCodProd", "codigo_produto", "nIdProduto") ?? "").toString();
      const codigo = (pega(e, "cCodigo", "codigo", "cCodInt") ?? "").toString();
      const meta = prod.porCodProd.get(codProd) ?? prod.porCodigo.get(codigo);
      const tipoSped = meta?.tipoSped || "";
      const codigoAtual = (meta?.codigo || codigo || codProd);
      // Debug de campos: para os códigos pedidos, devolve TODOS os campos crus
      // do estoque e do cadastro, para identificar de qual campo sai o custo
      // médio de referência da contabilidade.
      if (alvos.size && codigoAtual && alvos.has(codigoAtual.toUpperCase())) {
        debugCampos.push({
          codigo: codigoAtual,
          saldo,
          cmcUsado: cmc,
          estoqueCampos: e,
          produtoCampos: prod.rawPorCodigo.get(codigoAtual.toUpperCase()) ?? null,
        });
      }
      // Só entram na posição de estoque para contabilidade os tipos SPED:
      // 01-Matéria Prima, 02-Embalagem, 03-Produto em Processo, 04-Produto Acabado.
      const cod2 = tipoSped.slice(0, 2);
      if (!["01", "02", "03", "04"].includes(cod2)) continue;
      // CMC Total = Quantidade × CMC Unitário (padrão do relatório contábil).
      // NÃO usar o nValorEstoque do Omie: ele carrega precisão cheia e diverge
      // do arredondamento contábil (qtd × custo médio exibido).
      const cmcTotal = saldo * cmc;
      itens.push({
        codigo: meta?.codigo || codigo || codProd,
        descricao: meta?.descricao || (pega(e, "cDescricao", "descricao") ?? "").toString(),
        ncm: meta?.ncm || "",
        tipoSped,
        familia: meta?.familia || "",
        unidade: meta?.unidade || (pega(e, "cUnidade", "unidade") ?? "").toString(),
        quantidade: saldo,
        cmcUnitario: cmc,
        cmcTotal: Math.round(cmcTotal * 100) / 100,
      });
    }
    pagina++;
    if (pagina <= totalPaginas && pagina <= maxPaginas) await sleep(150);
  } while (pagina <= totalPaginas && pagina <= maxPaginas);

  itens.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  return {
    itens,
    totalRegistros,
    amostraEstoque: opcoes.debug ? amostraEstoque : undefined,
    amostraProduto: opcoes.debug ? prod.amostra : undefined,
    debugCampos: alvos.size ? debugCampos : undefined,
  };
}

/**
 * Diagnóstico RÁPIDO de custo por produto: em vez de varrer todo o catálogo e
 * toda a posição de estoque (lento), consulta cada produto direto no Omie
 * (ConsultarProduto + PosicaoEstoque por data) e devolve TODOS os campos crus.
 * Serve para identificar de qual campo do Omie sai o custo médio da
 * contabilidade. Poucas chamadas -> responde em segundos.
 */
export async function diagnosticoEstoqueProdutos(
  cred: OmieCredenciais,
  opcoes: { dataPosicao: string; codigos: string[] }
): Promise<
  { codigo: string; nCodProd?: string; produto?: unknown; estoque?: unknown; erro?: string }[]
> {
  const out: { codigo: string; nCodProd?: string; produto?: unknown; estoque?: unknown; erro?: string }[] = [];
  for (const codigoRaw of opcoes.codigos) {
    const codigo = codigoRaw.trim();
    if (!codigo) continue;
    let produto: unknown = null;
    let estoque: unknown = null;
    let nCodProd = "";
    const erros: string[] = [];

    // 1) Cadastro do produto (traz nCodProd/nIdProduto e campos do cadastro).
    try {
      const p = await callOmie<Record<string, unknown>>(cred, "geral/produtos/", "ConsultarProduto", { codigo });
      produto = p;
      nCodProd = (pega(p, "codigo_produto", "nCodProd", "nIdProduto") ?? "").toString();
    } catch (e) {
      erros.push("produto: " + (e instanceof Error ? e.message : String(e)));
    }

    // 2) Posição de estoque do produto na data (traz saldo, custo médio,
    //    valor de estoque etc.). Tenta por nIdProduto; se não houver, por código.
    try {
      const params: Record<string, unknown> = { dDataPosicao: opcoes.dataPosicao, cExibeTodos: "S" };
      if (nCodProd) params.nIdProduto = Number(nCodProd);
      else params.cCodIntProduto = codigo;
      estoque = await callOmie<Record<string, unknown>>(cred, "estoque/consulta/", "PosicaoEstoque", params);
    } catch (e) {
      erros.push("estoque: " + (e instanceof Error ? e.message : String(e)));
    }

    out.push({ codigo, nCodProd, produto, estoque, erro: erros.length ? erros.join(" | ") : undefined });
    await sleep(300);
  }
  return out;
}
