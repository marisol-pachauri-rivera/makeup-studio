// Parámetros del reintento ante suspensión de Neon (ADR 0009). Un solo lugar para ajustarlos.
export const REINTENTO = {
  intentos: 4,
  esperasMs: [300, 600, 1200],
} as const;
