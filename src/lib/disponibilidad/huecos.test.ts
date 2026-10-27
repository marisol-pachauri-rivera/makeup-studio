import { afterEach, describe, expect, it } from "vitest";
import { aPartesLocales, deLocalAInstante } from "@/lib/agenda/zona-horaria";
import { calcularHuecos, type DiaConHuecos, type RangoOcupado, type TramoSemanal } from "./huecos";

// 2026-12-21 es lunes. 05:00 UTC = 00:00 en Lima.
const AMANECER = new Date("2026-12-21T05:00:00Z");

const local = (fecha: string, hora: string) => {
  const instante = deLocalAInstante(`${fecha}T${hora}`);
  if (!instante) throw new Error("hora local inválida en la prueba");
  return instante;
};
const rango = (fecha: string, desde: string, hasta: string, fechaFin = fecha): RangoOcupado => ({
  inicio: local(fecha, desde),
  fin: local(fechaFin, hasta),
});
const tramo = (diaSemana: number, horaInicio: string, horaFin: string): TramoSemanal => ({ diaSemana, horaInicio, horaFin });
const todosLosDias = (horaInicio: string, horaFin: string) => [0, 1, 2, 3, 4, 5, 6].map((d) => tramo(d, horaInicio, horaFin));

/** Horas locales `HH:mm` ofrecidas en una fecha. */
function horas(dias: DiaConHuecos[], fecha: string): string[] {
  return (dias.find((d) => d.fecha === fecha)?.inicios ?? []).map((i) => aPartesLocales(i).hora);
}

const calcular = (entrada: Partial<Parameters<typeof calcularHuecos>[0]> & { tramos: TramoSemanal[] }) =>
  calcularHuecos({ ocupados: [], duracionMinutos: 60, ahora: AMANECER, ...entrada });

describe("horarios según el horario de trabajo", () => {
  it("ofrece los inicios en que el servicio cabe en el tramo", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "12:00")] });
    expect(horas(dias, "2026-12-21")).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("no ofrece nada si el servicio no cabe", () => {
    expect(calcular({ tramos: [tramo(1, "09:00", "12:00")], duracionMinutos: 240 })).toEqual([]);
  });

  it("acepta el servicio que termina justo al cierre del tramo", () => {
    expect(horas(calcular({ tramos: [tramo(1, "09:00", "12:00")], duracionMinutos: 180 }), "2026-12-21")).toEqual(["09:00"]);
  });

  it("con dos tramos separados no ofrece inicios en el hueco", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "13:00"), tramo(1, "15:00", "19:00")] });
    const lunes = horas(dias, "2026-12-21");
    expect(lunes).toContain("12:00");
    expect(lunes).not.toContain("12:30");
    expect(lunes.filter((h) => h > "12:00" && h < "15:00")).toEqual([]);
    expect(lunes).toContain("15:00");
    expect(lunes.at(-1)).toBe("18:00");
  });

  it("funde tramos contiguos: un servicio puede cruzar el punto de unión", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "13:00"), tramo(1, "13:00", "17:00")] });
    expect(horas(dias, "2026-12-21")).toContain("12:30");
  });

  it("funde tramos que se solapan aunque lleguen desordenados", () => {
    const dias = calcular({ tramos: [tramo(1, "12:00", "16:00"), tramo(1, "09:00", "13:00")] });
    const lunes = horas(dias, "2026-12-21");
    expect(lunes[0]).toBe("09:00");
    expect(lunes).toContain("12:30");
    expect(lunes.at(-1)).toBe("15:00");
  });

  it("no cruza un hueco entre tramos", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "13:00"), tramo(1, "13:30", "17:00")] });
    const lunes = horas(dias, "2026-12-21");
    expect(lunes).toContain("12:00");
    expect(lunes).not.toContain("12:30");
    expect(lunes).not.toContain("13:00");
    expect(lunes).toContain("13:30");
  });

  it("solo ofrece los días con tramos", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "12:00")] });
    expect(dias.map((d) => d.fecha).slice(0, 3)).toEqual(["2026-12-21", "2026-12-28", "2027-01-04"]);
  });

  it("no ofrece nada sin tramos", () => {
    expect(calcular({ tramos: [] })).toEqual([]);
  });

  it("ancla la grilla al inicio del tramo", () => {
    const dias = calcular({ tramos: [tramo(1, "09:15", "11:15")] });
    expect(horas(dias, "2026-12-21")).toEqual(["09:15", "09:45", "10:15"]);
  });

  it("acepta horas con segundos, como las devuelve la columna time", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00:00", "10:00:00")] });
    expect(horas(dias, "2026-12-21")).toEqual(["09:00"]);
  });

  it("devuelve los instantes UTC correctos para la hora de Lima", () => {
    const [primero] = calcular({ tramos: [tramo(1, "09:00", "10:00")] });
    expect(primero.inicios[0].toISOString()).toBe("2026-12-21T14:00:00.000Z");
  });
});

describe("bloqueos y reservas ocupan el horario", () => {
  const tramos = [tramo(1, "09:00", "14:00")];

  it("un bloqueo en medio quita lo que se cruza y deja lo contiguo", () => {
    const dias = calcular({ tramos, ocupados: [rango("2026-12-21", "10:00", "12:00")] });
    expect(horas(dias, "2026-12-21")).toEqual(["09:00", "12:00", "12:30", "13:00"]);
  });

  it("una línea activa contigua no ocupa: se ofrecen 09:00 y 11:00", () => {
    const dias = calcular({ tramos, ocupados: [rango("2026-12-21", "10:00", "11:00")] });
    const lunes = horas(dias, "2026-12-21");
    expect(lunes).toContain("09:00");
    expect(lunes).toContain("11:00");
    expect(lunes).not.toContain("09:30");
    expect(lunes).not.toContain("10:00");
    expect(lunes).not.toContain("10:30");
  });

  it("un bloqueo de varios días vacía los días intermedios y recorta los extremos", () => {
    const dias = calcular({
      tramos: todosLosDias("09:00", "18:00"),
      ocupados: [rango("2026-12-24", "14:00", "09:00", "2026-12-26")],
    });
    expect(horas(dias, "2026-12-25")).toEqual([]);
    expect(dias.some((d) => d.fecha === "2026-12-25")).toBe(false);
    const jueves = horas(dias, "2026-12-24");
    expect(jueves.at(-1)).toBe("13:00");
    expect(jueves).not.toContain("13:30");
    const sabado = horas(dias, "2026-12-26");
    expect(sabado[0]).toBe("09:00");
  });

  it("ignora los ocupados que no tocan el día", () => {
    const sinOcupados = calcular({ tramos });
    const conOtroDia = calcular({ tramos, ocupados: [rango("2026-12-22", "09:00", "14:00")] });
    expect(horas(conOtroDia, "2026-12-21")).toEqual(horas(sinOcupados, "2026-12-21"));
  });

  it("con servicios más largos exige que el turno completo esté libre", () => {
    const dias = calcular({ tramos, duracionMinutos: 120, ocupados: [rango("2026-12-21", "11:00", "12:00")] });
    // 09:00–11:00 termina justo donde empieza el bloqueo; 09:30 a 11:30 ya lo cruza.
    expect(horas(dias, "2026-12-21")).toEqual(["09:00", "12:00"]);
  });
});

describe("hora local del studio y horarios pasados", () => {
  it("a las 10:10 en Lima el primer horario de hoy es 10:30", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "18:00")], ahora: new Date("2026-12-21T15:10:00Z") });
    expect(horas(dias, "2026-12-21")[0]).toBe("10:30");
  });

  it("un horario que empieza justo ahora se ofrece", () => {
    const dias = calcular({ tramos: [tramo(1, "09:00", "18:00")], ahora: new Date("2026-12-21T15:00:00Z") });
    expect(horas(dias, "2026-12-21")[0]).toBe("10:00");
  });

  it("si a hoy no le queda ningún horario, no aparece como día disponible", () => {
    const dias = calcular({
      tramos: todosLosDias("09:00", "18:00"),
      ahora: new Date("2026-12-21T22:45:00Z"), // 17:45 en Lima
    });
    expect(dias[0].fecha).toBe("2026-12-22");
  });

  it("usa el día de Lima aunque en UTC ya sea el siguiente", () => {
    // 03:00 UTC del martes 22 es 22:00 del lunes 21 en Lima.
    const dias = calcular({ tramos: [tramo(1, "09:00", "23:00")], ahora: new Date("2026-12-22T03:00:00Z") });
    expect(dias[0].fecha).toBe("2026-12-21");
    expect(horas(dias, "2026-12-21")).toEqual(["22:00"]);
  });

  it("ofrece solo los próximos 30 días contando hoy", () => {
    const dias = calcular({ tramos: todosLosDias("09:00", "18:00") });
    expect(dias).toHaveLength(30);
    expect(dias[0].fecha).toBe("2026-12-21");
    expect(dias.at(-1)?.fecha).toBe("2027-01-19");
  });

  it("permite acortar el horizonte y cambiar la grilla", () => {
    const dias = calcular({ tramos: todosLosDias("09:00", "11:00"), dias: 2, intervaloMinutos: 15, duracionMinutos: 30 });
    expect(dias.map((d) => d.fecha)).toEqual(["2026-12-21", "2026-12-22"]);
    expect(horas(dias, "2026-12-21")).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30"]);
  });

  it("devuelve los inicios en orden ascendente", () => {
    const dias = calcular({ tramos: [tramo(1, "15:00", "19:00"), tramo(1, "09:00", "13:00")] });
    const inicios = dias[0].inicios.map((i) => i.getTime());
    expect(inicios).toEqual([...inicios].sort((a, b) => a - b));
  });
});

describe("independencia de la zona del proceso", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it.each(["UTC", "Asia/Tokyo", "America/New_York"])("da el mismo resultado con TZ=%s", (tz) => {
    process.env.TZ = tz;
    const dias = calcular({
      tramos: [tramo(1, "09:00", "12:00")],
      ocupados: [rango("2026-12-21", "10:00", "10:30")],
      ahora: new Date("2026-12-21T14:10:00Z"),
    });
    expect(dias[0].fecha).toBe("2026-12-21");
    expect(dias[0].inicios.map((i) => i.toISOString())).toEqual(["2026-12-21T15:30:00.000Z", "2026-12-21T16:00:00.000Z"]);
  });
});
