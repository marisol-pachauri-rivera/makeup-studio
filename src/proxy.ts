import { NextResponse, type NextRequest } from "next/server";
import { esRutaDeLogin, tieneCookieDeSesion, urlDeLogin } from "@/lib/auth/rutas";

/**
 * Comprobación optimista del panel (design.md, decisión 5): solo mira si hay cookie de sesión, sin
 * consultar la base. La barrera real es `requerirAdminOLogin()` en cada página y `requerirAdmin()`
 * en cada Server Action, porque este filtro no cubre una acción movida a otra ruta.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (esRutaDeLogin(pathname)) return NextResponse.next();

  const nombres = request.cookies.getAll().map((c) => c.name);
  if (tieneCookieDeSesion(nombres)) return NextResponse.next();

  return NextResponse.redirect(new URL(urlDeLogin(pathname, search), request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
