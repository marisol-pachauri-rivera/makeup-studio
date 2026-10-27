"use server";

import { signOut } from "@/auth";
import { requerirAdmin } from "@/lib/auth/sesion";

export async function cerrarSesion() {
  await requerirAdmin();
  await signOut({ redirectTo: "/admin/login" });
}
