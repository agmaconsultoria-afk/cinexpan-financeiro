import { NextRequest, NextResponse } from "next/server";
import { listarUsuarios, criarUsuario } from "@/lib/auth/db";
import { exigirAdmin } from "@/lib/auth/session";
import { ehPerfilValido } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** GET /api/usuarios — lista todos (admin). */
export async function GET() {
  const r = await exigirAdmin();
  if (r instanceof NextResponse) return r;
  const usuarios = await listarUsuarios();
  return NextResponse.json({ ok: true, usuarios });
}

/** POST /api/usuarios — cria usuário (admin). body: { nome, email, senha, perfil } */
export async function POST(req: NextRequest) {
  const r = await exigirAdmin();
  if (r instanceof NextResponse) return r;

  try {
    const body = await req.json();
    const nome = (body?.nome ?? "").toString().trim();
    const email = (body?.email ?? "").toString().trim();
    const senha = (body?.senha ?? "").toString();
    const perfil = (body?.perfil ?? "").toString();

    if (!nome || !email || !senha) {
      return NextResponse.json(
        { ok: false, erro: "Nome, email e senha são obrigatórios." },
        { status: 400 }
      );
    }
    if (senha.length < 6) {
      return NextResponse.json(
        { ok: false, erro: "A senha deve ter ao menos 6 caracteres." },
        { status: 400 }
      );
    }
    if (!ehPerfilValido(perfil)) {
      return NextResponse.json({ ok: false, erro: "Perfil inválido." }, { status: 400 });
    }

    const usuario = await criarUsuario({ nome, email, senha, perfil });
    return NextResponse.json({ ok: true, usuario });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao criar usuário.";
    // Violação de unicidade do email
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(
        { ok: false, erro: "Já existe um usuário com este email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
