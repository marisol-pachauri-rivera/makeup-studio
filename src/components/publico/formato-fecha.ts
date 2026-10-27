// Las fechas son de calendario (`YYYY-MM-DD`, sin hora): se formatean en UTC para que el día no se desplace.
const largo = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const corto = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/** `jueves, 24 de diciembre` */
export const fechaLarga = (fecha: string) => largo.format(aFecha(fecha));

/** `jue, 24 dic` */
export const fechaCorta = (fecha: string) => corto.format(aFecha(fecha));
