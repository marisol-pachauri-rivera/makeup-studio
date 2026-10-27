/**
 * Convención del ADR 0006: toda Server Action del panel llama a `requerirAdmin()` antes de hacer
 * cualquier otra cosa. Revisión textual: no entiende el código, pero hace que olvidarlo sea ruidoso.
 */
export function accionesSinGuardia(codigo: string): string[] {
  const problemas: string[] = [];
  if (!/^\s*["']use server["']/.test(codigo)) problemas.push('falta la directiva "use server" al inicio del archivo');

  const encabezados = [...codigo.matchAll(/export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async)/g)];
  // Una exportación que no sea `async` no es una Server Action válida.
  for (const m of codigo.matchAll(/export\s+(?:function|const\s+\w+\s*=[ \t]*(?![ \t]|async\b))/g)) {
    problemas.push(`exportación no asíncrona cerca de «${m[0].trim()}»`);
  }

  encabezados.forEach((m, i) => {
    const nombre = m[1] ?? m[2];
    const cuerpo = codigo.slice(m.index, encabezados[i + 1]?.index ?? codigo.length);
    const guardia = cuerpo.search(/\brequerirAdmin\(/);
    if (guardia === -1) {
      problemas.push(`${nombre}: no llama a requerirAdmin()`);
      return;
    }
    const otroAwait = cuerpo.search(/\bawait\s+(?!requerirAdmin\()/);
    const accesoADatos = cuerpo.search(/\bgetDb\(|\bdb\./);
    const primeraOtraCosa = [otroAwait, accesoADatos].filter((n) => n !== -1).sort((a, b) => a - b)[0];
    if (primeraOtraCosa !== undefined && primeraOtraCosa < guardia) {
      problemas.push(`${nombre}: requerirAdmin() no es lo primero que hace la acción`);
    }
  });
  return problemas;
}
