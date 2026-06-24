"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useSessao } from "@/components/SessionProvider";
import { PERFIS, Perfil } from "@/lib/auth/roles";
import { UserPlus, Pencil, Trash2, X, Loader2, ShieldAlert } from "lucide-react";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
}

const PERFIL_COR: Record<Perfil, string> = {
  Administrador: "bg-brand-100 text-brand-800",
  Diretoria: "bg-purple-100 text-purple-800",
  Gestor: "bg-blue-100 text-blue-800",
  Operador: "bg-slate-100 text-slate-700",
};

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function UsuariosPage() {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);

  const ehAdmin = usuario?.perfil === "Administrador";

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/usuarios", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Erro ao carregar usuários.");
        setUsuarios([]);
      } else {
        setUsuarios(j.usuarios);
      }
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (ehAdmin) carregar();
    else if (!carregandoSessao) setCarregando(false);
  }, [ehAdmin, carregandoSessao]);

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }
  function abrirEdicao(u: Usuario) {
    setEditando(u);
    setModalAberto(true);
  }

  async function remover(u: Usuario) {
    if (!confirm(`Remover o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
    const r = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      alert(j.erro ?? "Erro ao remover.");
      return;
    }
    carregar();
  }

  if (carregandoSessao || carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!ehAdmin) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="mt-3 text-lg font-semibold text-amber-900">Acesso restrito</h2>
        <p className="mt-1 text-sm text-amber-700">
          Apenas administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Usuários"
        subtitulo="Crie e gerencie os acessos ao portal e seus perfis."
        acoes={
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </button>
        }
      />

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.nome}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PERFIL_COR[u.perfil]}`}
                    >
                      {u.perfil}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.ativo ? (
                      <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{dataBR(u.ultimoAcesso)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirEdicao(u)}
                        title="Editar"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remover(u)}
                        title="Remover"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && (
        <ModalUsuario
          usuario={editando}
          onFechar={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function ModalUsuario({
  usuario,
  onFechar,
  onSalvo,
}: {
  usuario: Usuario | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const editando = Boolean(usuario);
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? "Operador");
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { nome, email, perfil, ativo };
      if (senha) corpo.senha = senha;

      const url = editando ? `/api/usuarios/${usuario!.id}` : "/api/usuarios";
      const metodo = editando ? "PUT" : "POST";
      if (!editando) corpo.senha = senha;

      const r = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Erro ao salvar.");
        setSalvando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Erro de conexão.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {editando ? "Editar usuário" : "Novo usuário"}
          </h2>
          <button onClick={onFechar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={salvar} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {editando ? "Nova senha (deixe em branco para manter)" : "Senha"}
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required={!editando}
              minLength={6}
              placeholder={editando ? "••••••••" : "Mínimo 6 caracteres"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Perfil</label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value as Perfil)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Usuário ativo
            </label>
          )}

          {erro && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
