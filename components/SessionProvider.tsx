"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Perfil } from "@/lib/auth/roles";

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
}

interface SessaoCtx {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<SessaoCtx>({
  usuario: null,
  carregando: true,
  recarregar: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setUsuario(j.usuario ?? null);
      } else {
        setUsuario(null);
      }
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <Ctx.Provider value={{ usuario, carregando, recarregar: carregar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSessao() {
  return useContext(Ctx);
}
