import { describe, expect, it } from "vitest";
import { agruparPorDia, horaCorta, NOMBRE_DIA, ORDEN_DIAS } from "./dias";

describe("dias", () => {
  it("empieza en lunes y termina en domingo", () => {
    expect(ORDEN_DIAS.map((d) => NOMBRE_DIA[d])).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
  });

  it("recorta los segundos de la hora", () => {
    expect(horaCorta("09:00:00")).toBe("09:00");
    expect(horaCorta("09:00")).toBe("09:00");
  });

  it("agrupa por día, con los siete días aunque estén vacíos, y conserva el orden dentro del día", () => {
    const grupos = agruparPorDia([
      { diaSemana: 0, n: "a" },
      { diaSemana: 2, n: "b" },
      { diaSemana: 2, n: "c" },
    ]);
    expect(grupos.map((g) => g.dia)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(grupos.find((g) => g.dia === 2)?.tramos.map((t) => t.n)).toEqual(["b", "c"]);
    expect(grupos.find((g) => g.dia === 0)?.tramos.map((t) => t.n)).toEqual(["a"]);
    expect(grupos.find((g) => g.dia === 1)?.tramos).toEqual([]);
  });
});
