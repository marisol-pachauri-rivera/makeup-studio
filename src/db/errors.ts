export class ErrorAccesoDatos extends Error {
  constructor(options?: { cause?: unknown }) {
    super("No se pudo acceder a la base de datos.", options);
    this.name = "ErrorAccesoDatos";
  }
}
