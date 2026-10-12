// Tipos de error semántico del analizador. Se modelan como un tipo de dato
// (código + categoría) en vez de strings sueltos, para que la UI y el CLI
// (scripts/analyze.ts) muestren siempre qué regla se violó.
export type ErrorCategory =
  | "TIPO_INCOMPATIBLE"
  | "IDENTIFICADOR_NO_DECLARADO"
  | "IDENTIFICADOR_REDECLARADO"
  | "USO_INCORRECTO_DE_IDENTIFICADOR"
  | "REGLA_MAL_FORMADA"
  | "ADVERTENCIA";

export interface SemanticError {
  category: ErrorCategory;
  rule: string; // id de la fila de TYPE_MATRIX o de la regla de identificadores (T1..T9, I1..I6)
  message: string;
  line?: number;
}

export function semanticError(category: ErrorCategory, rule: string, message: string, line?: number): SemanticError {
  return { category, rule, message, line };
}

// Solo las categorías bloqueantes impiden generar C++; ADVERTENCIA es informativa.
export function isBlocking(error: SemanticError): boolean {
  return error.category !== "ADVERTENCIA";
}
