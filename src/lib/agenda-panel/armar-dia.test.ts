import { describe, expect, it } from "vitest";
import type { Maquilladora } from "@/lib/catalogo/maquilladoras";
import { armarDia, etiquetaDeEstado } from "./armar-dia";
import type { AgendaDelDia, TurnoDelDia } from "./consulta";

const ana = { id: 1, nombre: "Ana", activa: true } as Maquilladora;
const bea = { id: 2, nombre: "Bea", activa: true } as Maquilladora;
const inactiva = { id: 3, nombre: "Carla", activa: false } as Maquilladora;

// 15:00 UTC = 10:00 en Lima; 2026-12-21 es lunes.
const utc = (hora: string, dia = "2026-12-21") => new Date(`${dia}T${hora}:00Z`);

let n = 0;
const turno = (extra: Partial<TurnoDelDia> = {}): TurnoDelDia => ({
  lineaId: ++n,
  maquilladoraId: 1,
  persona: "Lucía",
  servicio: "Peinado",
  inicio: utc("15:00"),
  fin: utc("16:00"),
  estadoReserva: "confirmada",
  motivoRechazo: null,
  vencida: false,
  nombreContacto: "Lucía",
  telefonoContacto: "999111222",
  ...extra,
});

const agenda = (extra: Partial<AgendaDelDia> = {}): AgendaDelDia => ({
  fecha: "2026-12-21",
  maquilladoras: [ana],
  tramos: new Map(),
  bloqueos: [],
  turnos: [],
  ...extra,
});

describe("armarDia", () => {
  it("muestra las horas de Lima: 15:00 UTC es 10:00", () => {
    const [seccion] = armarDia(agenda({ turnos: [turno()] }));
    expect(seccion.filas[0]).toMatchObject({ tipo: "turno", hora: "10:00 a 11:00" });
  });

  it("ordena los turnos por hora de inicio", () => {
    const [seccion] = armarDia(
      agenda({
        turnos: [
          turno({ persona: "Tarde", inicio: utc("20:00"), fin: utc("21:00") }),
          turno({ persona: "Temprano", inicio: utc("14:00"), fin: utc("15:00") }),
        ],
      }),
    );
    expect(seccion.filas.map((f) => f.tipo === "turno" && f.persona)).toEqual(["Temprano", "Tarde"]);
  });

  it("mezcla turnos y bloqueos en una sola línea de tiempo", () => {
    const [seccion] = armarDia(
      agenda({
        turnos: [turno({ persona: "Mañana", inicio: utc("14:00"), fin: utc("15:00") }), turno({ persona: "Noche", inicio: utc("22:00"), fin: utc("23:00") })],
        bloqueos: [{ id: 9, maquilladoraId: 1, inicio: utc("18:00"), fin: utc("19:00"), motivo: "Almuerzo" }],
      }),
    );
    expect(seccion.filas.map((f) => f.tipo)).toEqual(["turno", "bloqueo", "turno"]);
    expect(seccion.filas[1]).toMatchObject({ tipo: "bloqueo", motivo: "Almuerzo", hora: "13:00 a 14:00" });
  });

  it("separa por maquilladora y no mezcla sus turnos ni bloqueos", () => {
    const secciones = armarDia(
      agenda({
        maquilladoras: [ana, bea],
        turnos: [turno({ maquilladoraId: 2, persona: "DeBea" })],
        bloqueos: [{ id: 1, maquilladoraId: 1, inicio: utc("15:00"), fin: utc("16:00"), motivo: "Curso" }],
      }),
    );
    expect(secciones.map((s) => [s.nombre, s.filas.length])).toEqual([
      ["Ana", 1],
      ["Bea", 1],
    ]);
    expect(secciones[0].filas[0].tipo).toBe("bloqueo");
    expect(secciones[1].filas[0].tipo).toBe("turno");
  });

  it("un día sin horario deja el horario vacío y conserva sus turnos", () => {
    const [seccion] = armarDia(agenda({ turnos: [turno()] }));
    expect(seccion.horario).toEqual([]);
    expect(seccion.filas).toHaveLength(1);
  });

  it("el horario de trabajo se da por tramos, sin segundos", () => {
    const [seccion] = armarDia(
      agenda({
        tramos: new Map([
          [
            1,
            [
              { horaInicio: "09:00:00", horaFin: "13:00:00" },
              { horaInicio: "15:00:00", horaFin: "19:00:00" },
            ],
          ],
        ]),
      }),
    );
    expect(seccion.horario).toEqual(["09:00 a 13:00", "15:00 a 19:00"]);
  });

  it("descarta a la maquilladora inactiva sin turnos y conserva a la inactiva con turnos", () => {
    const sin = armarDia(agenda({ maquilladoras: [ana, inactiva] }));
    expect(sin.map((s) => s.nombre)).toEqual(["Ana"]);

    const con = armarDia(agenda({ maquilladoras: [ana, inactiva], turnos: [turno({ maquilladoraId: 3 })] }));
    expect(con.map((s) => s.nombre)).toEqual(["Ana", "Carla"]);
    expect(con[1].activa).toBe(false);
  });

  it("una maquilladora inactiva con solo un bloqueo y sin turnos no aparece", () => {
    const secciones = armarDia(
      agenda({
        maquilladoras: [inactiva],
        bloqueos: [{ id: 1, maquilladoraId: 3, inicio: utc("15:00"), fin: utc("16:00"), motivo: "x" }],
      }),
    );
    expect(secciones).toEqual([]);
  });

  it("muestra el nombre de contacto solo si difiere del de la persona", () => {
    const [seccion] = armarDia(
      agenda({
        turnos: [
          turno({ persona: "Lucía", nombreContacto: "Lucía" }),
          turno({ persona: "Marta", nombreContacto: "Lucía", inicio: utc("17:00"), fin: utc("18:00") }),
        ],
      }),
    );
    const [individual, grupal] = seccion.filas;
    expect(individual).toMatchObject({ contacto: null, telefono: "999111222" });
    expect(grupal).toMatchObject({ contacto: "Lucía", telefono: "999111222" });
  });

  it("un turno que viene de otro día muestra la fecha en su rango", () => {
    const [seccion] = armarDia(
      agenda({ turnos: [turno({ inicio: new Date("2026-12-22T04:30:00Z"), fin: new Date("2026-12-22T05:30:00Z") })], fecha: "2026-12-21" }),
    );
    // 23:30 del 21 a 00:30 del 22 en Lima.
    expect(seccion.filas[0]).toMatchObject({ hora: "23:30 a 22/12 00:30" });
  });
});

describe("etiquetas de estado", () => {
  it.each([
    ["pendiente_pago", null, "Pendiente de pago"],
    ["pendiente_pago", "no aparece", "Pago rechazado"],
    ["pendiente_validacion", null, "Pendiente de validación"],
    ["confirmada", null, "Confirmada"],
  ] as const)("%s (rechazo %j) se escribe %s", (estadoReserva, motivoRechazo, esperado) => {
    expect(etiquetaDeEstado({ estadoReserva, motivoRechazo })).toBe(esperado);
  });

  it("una reserva vencida lleva además la marca de texto Plazo vencido", () => {
    const [seccion] = armarDia(agenda({ turnos: [turno({ estadoReserva: "pendiente_pago", vencida: true })] }));
    expect(seccion.filas[0]).toMatchObject({ estado: "Pendiente de pago", marcas: ["Plazo vencido"] });
  });

  it("una reserva que no está vencida no lleva marcas", () => {
    const [seccion] = armarDia(agenda({ turnos: [turno()] }));
    expect(seccion.filas[0]).toMatchObject({ marcas: [] });
  });

  it("una devuelta por rechazo se ve como Pago rechazado y sin Plazo vencido", () => {
    const [seccion] = armarDia(
      agenda({ turnos: [turno({ estadoReserva: "pendiente_pago", motivoRechazo: "no aparece", vencida: false })] }),
    );
    expect(seccion.filas[0]).toMatchObject({ estado: "Pago rechazado", marcas: [] });
  });
});
