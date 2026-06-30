"use client";

import { useState } from "react";
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
  KeyRound,
  X,
  Eye,
  EyeOff,
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

function ModalTrocarSenha({ onFechar }: { onFechar: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarAtual, setMostrarAtual] = useState(false);
  const [mostrarNova, setMostrarNova] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (novaSenha !== confirmar) {
      setErro("A nova senha e a confirmação não conferem.");
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErro(data.erro ?? "Erro ao trocar a senha.");
      } else {
        setSucesso(true);
        setTimeout(onFechar, 1500);
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Alterar senha</h2>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sucesso ? (
          <div className="px-5 py-8 text-center">
            <p className="font-medium text-emerald-600">Senha alterada com sucesso!</p>
          </div>
        ) : (
          <form onSubmit={salvar} className="space-y-4 px-5 py-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Senha atual</label>
              <div className="relative">
                <input
                  type={mostrarAtual ? "text" : "password"}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setMostrarAtual((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {mostrarAtual ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
              <div className="relative">
                <input
                  type={mostrarNova ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setMostrarNova((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {mostrarNova ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Confirmar nova senha
              </label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{erro}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onFechar}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={carregando}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {carregando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  mobileAberto?: boolean;
  onFecharMobile?: () => void;
}

export function Sidebar({ mobileAberto = false, onFecharMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario } = useSessao();
  const [modalSenha, setModalSenha] = useState(false);

  const itens = usuario ? NAV.filter((n) => podeVer(usuario.perfil, n.href)) : NAV;

  async function sair() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignora
    }
    window.location.href = "/login";
  }

  const conteudoNav = (
    <>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onFecharMobile}
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
            <p className="truncate text-xs text-brand-200">{usuario.perfil}</p>
          </div>
        )}
        <button
          onClick={() => { setModalSenha(true); onFecharMobile?.(); }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          <KeyRound className="h-4 w-4" />
          Alterar senha
        </button>
        <button
          onClick={sair}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      {modalSenha && <ModalTrocarSenha onFechar={() => setModalSenha(false)} />}

      {/* Overlay mobile */}
      {mobileAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onFecharMobile}
        />
      )}

      {/* Drawer mobile */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-950 text-white transition-transform duration-300 lg:hidden ${
          mobileAberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="clay-band flex h-20 items-center border-b border-white/10 px-6">
          <CinexpanLogo tamanho="md" />
        </div>
        {conteudoNav}
      </aside>

      {/* Sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-950 text-white lg:flex">
        <div className="clay-band flex h-20 items-center border-b border-white/10 px-6">
          <CinexpanLogo tamanho="md" />
        </div>
        {conteudoNav}
      </aside>
    </>
  );
}
