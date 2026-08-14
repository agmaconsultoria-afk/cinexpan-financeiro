// Custeio "a granel por volume" (SOMENTE lógica pura — client/servidor).
//
// Motivo: o custo médio (CMC) dos produtos ACABADOS ensacados no Omie vem
// inflado pelo componente de embalagem/ensacamento, derrubando a margem para
// níveis irreais. Para o CMV e o giro gerencial, valoramos a argila pelo custo
// do GRANEL (matéria-prima) por volume:
//   - Produto solto/granel (m³): usa o próprio custo médio (já é matéria-prima).
//   - Produto empacotado (saco 50L, embalagem 25L, big bag): custo =
//     volume (m³) × custo do granel da mesma argila.
//
// Conversões: 1 saco 50 L = 0,05 m³; 1 embalagem 25 L = 0,025 m³;
//             1 big bag = 1 m³; granel já vem em m³.

export interface ItemCusto {
  descricao: string;
  unidade: string;
  cmcUnitario: number;
}

export interface ModeloCustoGranel {
  granelPorTipo: Map<string, number>; // tipo de argila -> custo do granel (R$/m³)
  granelGlobal: number; // média dos granéis (fallback)
}

/** É argila solta/granel (matéria-prima) — não empacotada. Big bag é empacotado. */
export function ehGranel(descricao: string, unidade: string): boolean {
  const d = (descricao || "").toUpperCase();
  if (/BIG\s*BAG/.test(d)) return false;
  if (/GRANEL/.test(d)) return true;
  if ((unidade || "").toUpperCase() === "M3") return true;
  return false;
}

/** Volume em m³ de UMA unidade do produto (da descrição/unidade). null = desconhecido. */
export function volumeM3(descricao: string, unidade: string): number | null {
  const d = (descricao || "").toUpperCase();
  const mL = d.match(/(\d+)\s*LITROS?/);
  if (mL) return Number(mL[1]) / 1000;
  if (/BIG\s*BAG/.test(d)) return 1;
  if ((unidade || "").toUpperCase() === "M3" || /GRANEL/.test(d)) return 1;
  return null; // por peso (kg) u outros
}

/** Tipo de argila (para escolher o custo do granel correspondente). */
export function tipoArgila(descricao: string): string {
  const d = (descricao || "").toUpperCase();
  if (/LAMINADO\s*2[,.]5/.test(d)) return "LAM25";
  if (/LAMINADO\s*2\/7/.test(d)) return "LAM27";
  if (/SUBSTRATO/.test(d)) return "SUB";
  const m = d.match(/\b(1506|2215|3222|0?500)\b/);
  if (m) return m[1] === "500" ? "0500" : m[1];
  return "";
}

/** Monta o modelo de custo do granel a partir dos itens do snapshot de estoque. */
export function construirModelo(itens: ItemCusto[]): ModeloCustoGranel {
  const granelPorTipo = new Map<string, number>();
  const valores: number[] = [];
  for (const it of itens) {
    if (!ehGranel(it.descricao, it.unidade)) continue;
    const c = Number(it.cmcUnitario) || 0;
    if (c <= 0) continue;
    const t = tipoArgila(it.descricao);
    if (t) granelPorTipo.set(t, c);
    valores.push(c);
  }
  const granelGlobal = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  return { granelPorTipo, granelGlobal };
}

export interface CustoUnitResultado {
  custoUnit: number;
  base: string; // como o custo foi obtido (auditoria)
  volumeM3: number | null;
  tipo: string;
}

/** Custo unitário "a granel por volume" de um produto. */
export function custoUnitGranel(
  descricao: string,
  unidade: string,
  cmcProprio: number | null,
  modelo: ModeloCustoGranel
): CustoUnitResultado {
  const tipo = tipoArgila(descricao);
  const vol = volumeM3(descricao, unidade);

  if (ehGranel(descricao, unidade)) {
    // Matéria-prima solta: usa o próprio custo médio; se faltar, o granel do tipo/global.
    const c = cmcProprio != null && cmcProprio > 0 ? cmcProprio : modelo.granelPorTipo.get(tipo) ?? modelo.granelGlobal;
    return { custoUnit: c, base: cmcProprio != null && cmcProprio > 0 ? "granel-proprio" : "granel-ref", volumeM3: vol, tipo };
  }

  if (vol != null) {
    const granel = modelo.granelPorTipo.get(tipo);
    const c = granel ?? modelo.granelGlobal;
    return { custoUnit: vol * c, base: granel != null ? "empacotado-granel-tipo" : "empacotado-granel-global", volumeM3: vol, tipo };
  }

  // Sem volume (produtos por peso): cai no próprio custo médio.
  return { custoUnit: cmcProprio ?? 0, base: "sem-volume-fallback", volumeM3: vol, tipo };
}
