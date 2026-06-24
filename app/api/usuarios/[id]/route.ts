import { NextRequest, NextResponse } from "next/server";
import {
  atualizarUsuario,
  removerUsuario,
  listarUsuarios,
  totalAdminsAtivos,
} from "@/lib/auth/db";
import { exigirAdmin } from "@/lib/auth/session";
import { ehPerfilValido } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** PUT /api/usuarios/:id — atualiza (admin). body: { nome?, email?, perfil?, ativo?, senha? } */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await exigirAdmin();
  if (r instanceof NextResponse) return r;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, erro: "ID inválido." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const dados: {
      nome?: string;
      email?: string;
      perfil?: "Administrador" | "Diretoria" | "Gestor" | "Operador";
      ativo?: boolean;
      senha?: string;
    } = {};

    if (typeof body.nome === "string") dados.nome = body.nome;
    if (typeof body.email === "string") dados.email = body.email;
    if (typeof body.ativo === "boolean") dados.ativo = body.ativo;
    if (typeof body.senha === "string" && body.senha) {
      if (body.senha.length < 6) {
        return NextResponse.json(
          { ok: false, erro: "A senha deve ter ao menos 6 caracteres." },
          { status: 400 }
        );
      }
      dados.senha = body.senha;
    }
    if (body.perfil !== undefined) {
      if (!ehPerfilValido(body.perfil)) {
        return NextResponse.json({ ok: false, erro: "Perfil inválido." }, { status: 400 });
      }
      dados.perfil = body.perfil;
    }

    // Trava de segurança: não permitir remover/rebaixar/desativar o último admin ativo.
    const rebaixandoAdmin =
      (dados.perfil !== undefined && dados.perfil !== "Administrador") ||
      dados.ativo === false;
    if (rebaixandoAdmin) {
      const usuarios = await listarUsuarios();
      const alvo = usuarios.find((u) => u.id === id);
      if (alvo?.perfil === "Administrador" && alvo.ativo && (await totalAdminsAtivos()) <= 1) {
        return NextResponse.json(
          { ok: false, erro: "Não é possível desativar/rebaixar o único administrador ativo." },
          { status: 400 }
        );
      }
    }

    await atualizarUsuario(id, dados);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar usuário.";
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(
        { ok: false, erro: "Já existe um usuário com este email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}

/** DELETE /api/usuarios/:id — remove (admin). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const r = await exigirAdmin();
  if (r instanceof NextResponse) return r;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, erro: "ID inválido." }, { status: 400 });
  }

  // Não permitir remover o próprio usuário logado nem o último admin ativo.
  if (r.id === id) {
    return NextResponse.json(
      { ok: false, erro: "Você não pode remover o próprio usuário." },
      { status: 400 }
    );
  }
  const usuarios = await listarUsuarios();
  const alvo = usuarios.find((u) => u.id === id);
  if (alvo?.perfil === "Administrador" && alvo.ativo && (await totalAdminsAtivos()) <= 1) {
    return NextResponse.json(
      { ok: false, erro: "Não é possível remover o único administrador ativo." },
      { status: 400 }
    );
  }

  await removerUsuario(id);
  return NextResponse.json({ ok: true });
}
