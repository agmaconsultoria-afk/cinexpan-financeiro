"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CinexpanLogo } from "./CinexpanLogo";
import { useSessao } from "./SessionProvider";
import { podeVer } from "@/lib/auth/roles";
import {
  LayoutDashboard,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  PencilLine,
  Plug,
  Radar,
  Users,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rastreio-faturamento", label: "Rastreio de Faturamento", icon: Radar },
  { href: "/lancar-faturamento", label: "Lançar Faturamento", icon: PencilLine },
  { href: "/fluxo-caixa", label: "Fluxo de Caixa", icon: TrendingUp },
  { href: "/dre", label: "DRE", icon: FileSpreadsheet },
  { href: "/relatorios", label: "Relatórios", icon: FileText },
  { href: "/integracao-omie", label: "Integração Omie", icon: Plug },
  { href: "/usuarios", label: "Usuários", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario } = useSessao();

  // Enquanto a sessão não carregou, mostra tudo; depois filtra pelo perfil.
  const itens = usuario ? NAV.filter((n) => podeVer(usuario.perfil, n.href)) : NAV;

  async function sair() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignora
    }
    // Recarrega para limpar todo o estado em memória.
    window.location.href = "/login";
  }

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-950 text-white lg:flex">
      <div className="clay-band flex h-20 items-center border-b border-white/10 px-6">
        <CinexpanLogo tamanho="md" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-brand-600 text-white"
                  : "text-brand-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        {usuario && (
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-medium text-white" title={usuario.nome}>
              {usuario.nome}
            </p>
            <p className="truncate text-xs text-brand-200" title={usuario.email}>
              {usuario.perfil}
            </p>
          </div>
        )}
        <button
          onClick={sair}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
