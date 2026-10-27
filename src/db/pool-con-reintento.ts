import { conReintento } from "./retry";

type Funcion = (...args: unknown[]) => unknown;

/**
 * Reintenta la adquisición de conexión y las consultas sueltas del pool. Lo que corre dentro de
 * una transacción abierta va por el cliente ya adquirido y no se reintenta (ADR 0009).
 * Con callback se delega al original: pg-pool llama a `connect` con callback desde `query`, y
 * reintentar ahí anidaría los reintentos.
 */
export function conReintentoEnPool<P extends { connect: unknown; query: unknown }>(pool: P): P {
  const connect = (pool.connect as Funcion).bind(pool);
  const query = (pool.query as Funcion).bind(pool);

  const envolver = (original: Funcion): Funcion => (...args) =>
    typeof args[args.length - 1] === "function"
      ? original(...args)
      : conReintento(() => original(...args) as Promise<unknown>);

  pool.connect = envolver(connect);
  pool.query = envolver(query);
  return pool;
}
