import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { buscarAdminDeSesion } from "./admin-activa";

/** Una Server Action del panel se invocó sin una sesión de administradora válida. */
export class NoAutorizado extends Error {
  constructor() {
    super("No autorizado.");
    this.name = "NoAutorizado";
  }
}

async function adminActual() {
  // Primero la sesión: leer la petición es lo que aplaza el prerender de las páginas del panel;
  // abrir la base antes lo rompería en `next build`, donde no hay DATABASE_URL.
  const sesion = await auth();
  return buscarAdminDeSesion(getDb(), sesion);
}

/** Administradora de la sesión actual o `null`; para páginas que deciden sin exigir sesión (el login). */
export function obtenerAdmin() {
  return adminActual();
}

/**
 * Guardia de las Server Actions del panel (ADR 0006): debe ser lo primero que hace cada acción,
 * antes de validar la entrada o tocar la base. Lanza `NoAutorizado` sin sesión válida.
 */
export async function requerirAdmin() {
  const admin = await adminActual();
  if (!admin) throw new NoAutorizado();
  return admin;
}

/** Guardia de páginas y layouts del panel: sin sesión válida lleva al login. */
export async function requerirAdminOLogin() {
  const admin = await adminActual();
  if (!admin) redirect("/admin/login");
  return admin;
}
