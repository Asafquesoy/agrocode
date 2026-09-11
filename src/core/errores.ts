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

// Las 3+ categorías de error que pide la Actividad 5, listadas como dato para
// que la pestaña "Evidencia" las muestre sin repetir el enum a mano.
export const CATEGORIAS_ERROR: { categoria: CategoriaError; descripcion: string }[] = [
  { categoria: "TIPO_INCOMPATIBLE", descripcion: "Los tipos de los dos lados de una operación no combinan (matriz de tipos T6–T9)." },
  { categoria: "IDENTIFICADOR_NO_DECLARADO", descripcion: "Se usa un identificador que no fue declarado, o se declaró algo fuera del catálogo." },
  { categoria: "IDENTIFICADOR_REDECLARADO", descripcion: "El mismo identificador se declaró más de una vez." },
  { categoria: "USO_INCORRECTO_DE_IDENTIFICADOR", descripcion: "Un identificador se usa en un rol (SENSOR/ACTUADOR) distinto al declarado." },
  { categoria: "REGLA_MAL_FORMADA", descripcion: "La regla no tiene forma válida (sin acciones, condición no booleana, etc.)." },
  { categoria: "ADVERTENCIA", descripcion: "No bloquea el C++, pero avisa algo que conviene revisar (p. ej. un identificador sin usar)." },
];
