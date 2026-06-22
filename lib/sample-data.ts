import { Lancamento } from "./types";

// Estrutura de categorias usada para gerar dados de exemplo e para o DRE.
// Cada categoria pertence a um "grupo" do DRE.
interface ModeloCategoria {
  categoria: string;
  grupo: string;
  tipo: "receita" | "despesa";
  baseMensal: number; // valor médio mensal
  variacao: number; // amplitude da variação aleatória determinística
}

const CATEGORIAS: ModeloCategoria[] = [
  // Receitas
  { categoria: "Bilheteria", grupo: "Receita Bruta", tipo: "receita", baseMensal: 320000, variacao: 90000 },
  { categoria: "Bomboniere", grupo: "Receita Bruta", tipo: "receita", baseMensal: 145000, variacao: 40000 },
  { categoria: "Publicidade e Mídia", grupo: "Receita Bruta", tipo: "receita", baseMensal: 60000, variacao: 25000 },
  { categoria: "Eventos Corporativos", grupo: "Receita Bruta", tipo: "receita", baseMensal: 38000, variacao: 30000 },
  // Deduções
  { categoria: "Impostos sobre Vendas", grupo: "Deduções", tipo: "despesa", baseMensal: 52000, variacao: 12000 },
  // Custos
  { categoria: "Distribuição de Filmes", grupo: "Custos", tipo: "despesa", baseMensal: 96000, variacao: 28000 },
  { categoria: "Insumos Bomboniere", grupo: "Custos", tipo: "despesa", baseMensal: 41000, variacao: 11000 },
  // Despesas operacionais
  { categoria: "Folha de Pagamento", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 132000, variacao: 8000 },
  { categoria: "Aluguel e Condomínio", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 58000, variacao: 2000 },
  { categoria: "Energia e Utilidades", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 23000, variacao: 6000 },
  { categoria: "Marketing", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 27000, variacao: 14000 },
  { categoria: "Manutenção", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 16000, variacao: 9000 },
  { categoria: "Despesas Administrativas", grupo: "Despesas Operacionais", tipo: "despesa", baseMensal: 19000, variacao: 5000 },
  // Financeiro
  { categoria: "Despesas Financeiras", grupo: "Resultado Financeiro", tipo: "despesa", baseMensal: 9000, variacao: 4000 },
];

// Gerador pseudoaleatório determinístico (para os dados de exemplo serem estáveis).
function pseudo(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const DESCRICOES: Record<string, string[]> = {
  Bilheteria: ["Vendas de ingressos", "Sessões de estreia", "Ingressos antecipados"],
  Bomboniere: ["Vendas combo pipoca", "Bebidas e doces", "Combos promocionais"],
  "Publicidade e Mídia": ["Anúncios em tela", "Patrocínio de sala"],
  "Eventos Corporativos": ["Locação de sala", "Sessão privativa"],
  "Impostos sobre Vendas": ["ISS/ICMS sobre receita", "PIS/COFINS"],
  "Distribuição de Filmes": ["Repasse distribuidora", "Royalties de exibição"],
  "Insumos Bomboniere": ["Compra de insumos", "Reposição de estoque"],
  "Folha de Pagamento": ["Salários e encargos", "Benefícios da equipe"],
  "Aluguel e Condomínio": ["Aluguel do complexo", "Condomínio shopping"],
  "Energia e Utilidades": ["Energia elétrica", "Água e internet"],
  Marketing: ["Campanha digital", "Material gráfico"],
  Manutenção: ["Manutenção de projetores", "Reparos prediais"],
  "Despesas Administrativas": ["Serviços contábeis", "Material de escritório"],
  "Despesas Financeiras": ["Juros e tarifas bancárias", "IOF"],
};

/**
 * Gera lançamentos de exemplo para os últimos `meses` meses, a partir de hoje.
 */
export function gerarDadosExemplo(meses = 12): Lancamento[] {
  const lancamentos: Lancamento[] = [];
  const hoje = new Date();
  let contador = 0;

  for (let m = meses - 1; m >= 0; m--) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
    const ano = ref.getFullYear();
    const mes = ref.getMonth(); // 0-based
    const tendencia = 1 + (meses - 1 - m) * 0.012; // leve crescimento ao longo do tempo

    CATEGORIAS.forEach((cat, idx) => {
      const fator = 0.8 + pseudo(contador + idx * 7 + mes * 13) * 0.4;
      const sazonal = cat.tipo === "receita" ? tendencia : 1;
      const valor = Math.round(
        (cat.baseMensal + (pseudo(contador * 3 + idx) - 0.5) * 2 * cat.variacao) *
          fator *
          sazonal
      );
      const descricoes = DESCRICOES[cat.categoria] ?? [cat.categoria];
      const descricao = descricoes[Math.floor(pseudo(contador + idx) * descricoes.length)];
      const dia = 1 + Math.floor(pseudo(contador * 5 + idx) * 27);

      lancamentos.push({
        id: `ex-${ano}${String(mes + 1).padStart(2, "0")}-${idx}`,
        data: `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
        descricao,
        categoria: cat.categoria,
        grupo: cat.grupo,
        tipo: cat.tipo,
        valor: Math.max(0, valor),
        centroCusto: cat.tipo === "receita" ? "Operação" : "Operação",
        origem: "exemplo",
      });
      contador++;
    });
  }

  return lancamentos;
}
