/**
 * Perfis de acesso e regras de permissão (compartilhado client + servidor).
 *
 * NÃO importe nada de Node aqui — este módulo roda também no navegador
 * (Sidebar, telas) para esconder menus conforme o perfil.
 *
 * Modelo hierárquico:
 *   Administrador → tudo + gerenciar usuários
 *   Diretoria     → vê tudo (somente leitura; sem editar/sincronizar)
 *   Gestor        → vê tudo + lança faturamento + sincroniza Omie
 *   Operador      → Dashboard, Rastreio e Relatórios (somente leitura)
 */

export type Perfil = "Administrador" | "Diretoria" | "Gestor" | "Operador";

export const PERFIS: Perfil[] = ["Administrador", "Diretoria", "Gestor", "Operador"];

/** Nível hierárquico (maior = mais poder). Útil para comparações. */
export const NIVEL: Record<Perfil, number> = {
  Administrador: 4,
  Diretoria: 3,
  Gestor: 2,
  Operador: 1,
};

export function ehPerfilValido(v: unknown): v is Perfil {
  return typeof v === "string" && (PERFIS as string[]).includes(v);
}

/** Menus (href) que cada perfil enxerga. */
export const NAV_POR_PERFIL: Record<Perfil, string[]> = {
  Administrador: [
    "/",
    "/rastreio-faturamento",
    "/lancar-faturamento",
    "/faturamento-nf",
    "/posicao-estoque",
    "/fluxo-caixa",
    "/dre",
    "/relatorios",
    "/integracao-omie",
    "/usuarios",
  ],
  Diretoria: ["/", "/rastreio-faturamento", "/faturamento-nf", "/posicao-estoque", "/fluxo-caixa", "/dre", "/relatorios"],
  Gestor: [
    "/",
    "/rastreio-faturamento",
    "/lancar-faturamento",
    "/faturamento-nf",
    "/posicao-estoque",
    "/fluxo-caixa",
    "/dre",
    "/relatorios",
    "/integracao-omie",
  ],
  Operador: ["/", "/rastreio-faturamento", "/relatorios"],
};

/** Pode acessar/ver determinada rota (menu). */
export function podeVer(perfil: Perfil, href: string): boolean {
  return NAV_POR_PERFIL[perfil]?.includes(href) ?? false;
}

/** Pode executar ações de escrita: lançar faturamento, sincronizar Omie. */
export function podeEditar(perfil: Perfil): boolean {
  return perfil === "Administrador" || perfil === "Gestor";
}

/** É administrador (gerencia usuários). */
export function ehAdmin(perfil: Perfil): boolean {
  return perfil === "Administrador";
}
