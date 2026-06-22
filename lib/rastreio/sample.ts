import { ContaReceber } from "./types";
import { FATURAMENTO_SEED } from "./faturamento";

// Gerador determinístico de contas a receber de EXEMPLO (dados fictícios).
// Serve apenas para demonstrar o módulo antes da importação do BD real.

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function ultimoDiaDoMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function diaDoMes(ym: string, dia: number): string {
  const [a, m] = ym.split("-").map(Number);
  const max = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const d = Math.min(dia, max);
  return `${ym}-${String(d).padStart(2, "0")}`;
}

function addMeses(ym: string, n: number): string {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const CLIENTES = [
  "Construdecor",
  "Cobasi",
  "La Pedra Marmoraria",
  "Casa & Construção",
  "Materiais Premium",
  "Decorel Revestimentos",
  "Jardim & Cia",
  "Obra Forte Ltda",
];

/**
 * Gera um conjunto fictício de contas a receber por competência, com totais
 * aproximados aos do faturamento de exemplo.
 */
export function gerarContasExemplo(): ContaReceber[] {
  const contas: ContaReceber[] = [];
  const rand = rng(20260222);
  const competencias = Object.keys(FATURAMENTO_SEED).sort();

  competencias.forEach((comp, ci) => {
    const total = FATURAMENTO_SEED[comp];
    const nContas = 35 + Math.floor(rand() * 15);
    let restante = total;

    for (let i = 0; i < nContas; i++) {
      const ultimo = i === nContas - 1;
      const fatia = ultimo ? restante : Math.round((restante / (nContas - i)) * (0.4 + rand() * 1.4));
      const valor = Math.max(500, Math.min(restante, fatia));
      restante -= valor;

      const cliente = CLIENTES[Math.floor(rand() * CLIENTES.length)];
      const dataEmissao = diaDoMes(comp, 1 + Math.floor(rand() * 27));
      const vencimento = diaDoMes(addMeses(comp, Math.floor(rand() * 3)), 5 + Math.floor(rand() * 23));

      // Distribuição de situações
      const r = rand();
      let situacao: string;
      let valorRecebido = 0;
      let valorAReceber = 0;
      let desconto = 0;
      let jurosMulta = 0;
      let ultimoRecebimento: string | null = null;
      let previsao: string | null = vencimento;

      if (r < 0.78) {
        // Recebido
        situacao = "Recebido";
        desconto = rand() < 0.15 ? Math.round(valor * 0.02 * rand() * 100) / 100 : 0;
        jurosMulta = rand() < 0.1 ? Math.round(valor * 0.01 * rand() * 100) / 100 : 0;
        valorRecebido = valor - desconto + jurosMulta;
        ultimoRecebimento = diaDoMes(vencimento.slice(0, 7), 5 + Math.floor(rand() * 23));
      } else if (r < 0.93) {
        // A receber
        situacao = "A vencer";
        valorAReceber = valor;
        const recebMes = addMeses(comp, 1 + Math.floor(rand() * 4));
        previsao = diaDoMes(recebMes, 5 + Math.floor(rand() * 23));
      } else {
        // Atrasado
        situacao = "Atrasado";
        valorAReceber = valor;
        const recebMes = addMeses(comp, 1 + Math.floor(rand() * 3));
        previsao = diaDoMes(recebMes, 5 + Math.floor(rand() * 23));
      }

      contas.push({
        situacao,
        numeroDoc: `${130000 + ci * 1000 + i}`,
        parcela: `001/00${1 + Math.floor(rand() * 3)}`,
        notaFiscal: `${131000 + ci * 1000 + i}`,
        cliente,
        previsaoRecebimento: previsao,
        ultimoRecebimento,
        valorConta: valor,
        valorLiquido: valor,
        desconto,
        jurosMulta,
        valorRecebido,
        valorAReceber,
        categoria: "Receita de Vendas",
        operacao: `Pedido nº ${82000 + i}`,
        contaCorrente: "1 - Bradesco",
        vencimento,
        dataEmissao,
        vendedor: "Equipe Comercial",
        projeto: "Revenda Diversos",
      });
    }
  });

  return contas;
}
