import { NextRequest, NextResponse } from "next/server";

/**
 * Proteção de rotas: sem cookie de sessão, redireciona páginas para /login
 * e responde 401 nas APIs. A validação real (token no banco + expiração +
 * perfil) acontece nas rotas/Server Components via lib/auth/session.
 *
 * Roda no Edge — por isso aqui só checamos a PRESENÇA do cookie (sem acesso
 * ao banco). Os dados sensíveis só trafegam pelas APIs, que validam a sessão.
 */
const COOKIE = "cinexpan_sessao";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  const ehLogin = pathname === "/login";
  const ehApiPublica = pathname.startsWith("/api/auth/login");
  const ehPublica = ehLogin || ehApiPublica;

  if (!token && !ehPublica) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Já autenticado tentando abrir /login → manda para o início.
  if (token && ehLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Ignora estáticos do Next e o favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
