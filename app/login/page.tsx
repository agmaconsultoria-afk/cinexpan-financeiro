"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CinexpanLogo } from "@/components/CinexpanLogo";
import { LogIn, Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Não foi possível entrar.");
        setEnviando(false);
        return;
      }
      const destino = searchParams.get("from") || "/";
      // Navega e força recarga para o SessionProvider reler a sessão.
      window.location.href = destino;
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center rounded-2xl bg-brand-950 px-6 py-8">
          <CinexpanLogo tamanho="lg" />
        </div>

        <div className="card card-pad">
          <h1 className="text-xl font-bold text-slate-900">Portal Financeiro</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse com seu email e senha.</p>

          <form onSubmit={entrar} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="voce@cinexpan.com.br"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
              <input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {enviando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cinexpan · Gestão &amp; Diretoria
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
