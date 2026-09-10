// Tipos de error semántico del analizador. Se modelan como un tipo de dato
// (código + categoría) en vez de strings sueltos, para poder:
//   1) demostrar los "3 tipos diferentes de errores semánticos" que pide la Actividad 5,
//   2) que la UI y el CLI (scripts/analizar.ts) muestren siempre qué regla se violó.
export type CategoriaError =
  | "TIPO_INCOMPATIBLE"
  | "IDENTIFICADOR_NO_DECLARADO"
  | "IDENTIFICADOR_REDECLARADO"
  | "USO_INCORRECTO_DE_IDENTIFICADOR"
  | "REGLA_MAL_FORMADA"
  | "ADVERTENCIA";

export interface ErrorSemantico {
  categoria: CategoriaError;
  regla: string; // id de la fila de MATRIZ_TIPOS o de la regla de identificadores (T1..T8, I1..I6)
  mensaje: string;
  linea?: number;
}

export function errorSemantico(
  categoria: CategoriaError,
  regla: string,
  mensaje: string,
  linea?: number
): ErrorSemantico {
  return { categoria, regla, mensaje, linea };
}

// Solo las categorías bloqueantes impiden generar C++; ADVERTENCIA es informativa.
export function esBloqueante(error: ErrorSemantico): boolean {
  return error.categoria !== "ADVERTENCIA";
}
