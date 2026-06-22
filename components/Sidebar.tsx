"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CinexpanLogo } from "./CinexpanLogo";
import {
  LayoutDashboard,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Upload,
  Plug,
  Radar,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rastreio-faturamento", label: "Rastreio de Faturamento", icon: Radar },
  { href: "/fluxo-caixa", label: "Fluxo de Caixa", icon: TrendingUp },
  { href: "/dre", label: "DRE", icon: FileSpreadsheet },
  { href: "/relatorios", label: "Relatórios", icon: FileText },
  { href: "/importar", label: "Importar Planilha", icon: Upload },
  { href: "/integracao-omie", label: "Integração Omie", icon: Plug },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-950 text-white lg:flex">
      <div className="clay-band flex h-20 items-center border-b border-white/10 px-6">
        <CinexpanLogo tamanho="md" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
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

      <div className="border-t border-white/10 px-6 py-4 text-xs text-brand-200">
        Gestão &amp; Diretoria
      </div>
    </aside>
  );
}
