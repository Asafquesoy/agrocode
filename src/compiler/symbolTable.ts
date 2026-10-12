// Tabla de símbolos: valida las declaraciones (SENSOR/ACTUADOR/CULTIVO) del
// programa y resuelve en qué rol se usa cada identificador dentro de las
// reglas. Reúne las "5 reglas relacionadas con la declaración o utilización
// de identificadores" que pide la Actividad 5 (aquí hay 6, ver tabla abajo).
import type { Declaration, Expr, Program, Statement } from "./ast.ts";
import { findActuator, findCrop, findSensor } from "./catalog.ts";
import { semanticError, type ErrorCategory, type SemanticError } from "./errors.ts";

export interface IdentifierRule {
  id: string; // I1..I6, como en el documento "Actividad 5"
  name: string;
  category: ErrorCategory;
  description: string;
}

// Reglas de declaración/uso de identificadores, como tabla de datos — igual
// que TYPE_MATRIX en typeChecker.ts — para tener una única fuente de verdad.
// Los id/category de aquí son los que usan las llamadas a identifierError()
// más abajo en este mismo archivo.
export const IDENTIFIER_RULES: IdentifierRule[] = [
  { id: "I1", name: "Identificador no declarado", category: "IDENTIFICADOR_NO_DECLARADO", description: "Un SENSOR/ACTUADOR se usa en una regla sin haber sido declarado antes." },
  { id: "I2", name: "Identificador redeclarado", category: "IDENTIFICADOR_REDECLARADO", description: "El mismo identificador se declara dos veces." },
  { id: "I3", name: "Identificador fuera de catálogo", category: "IDENTIFICADOR_NO_DECLARADO", description: "Se declara un SENSOR/ACTUADOR que no existe en el catálogo del dispositivo (catalog.ts)." },
  { id: "I4", name: "Uso en rol incorrecto", category: "USO_INCORRECTO_DE_IDENTIFICADOR", description: "Un identificador declarado como SENSOR se usa como ACTUADOR, o viceversa." },
  { id: "I5", name: "Cultivo inexistente", category: "IDENTIFICADOR_NO_DECLARADO", description: "El CULTIVO del programa no existe en el catálogo de cultivos." },
  { id: "I6", name: "Identificador declarado sin usar", category: "ADVERTENCIA", description: "Un SENSOR/ACTUADOR se declara pero ninguna regla lo usa (no bloquea el C++)." },
];

// Arma el SemanticError de una fila de IDENTIFIER_RULES, para que la
// categoría nunca pueda quedar desincronizada del id (I1..I6) que se muestra.
function identifierError(id: string, message: string, line?: number): SemanticError {
  const row = IDENTIFIER_RULES.find((r) => r.id === id);
  return semanticError(row?.category ?? "REGLA_MAL_FORMADA", id, message, line);
}

export type SymbolRole = "SENSOR" | "ACTUADOR";

export interface SymbolEntry {
  id: string;
  role: SymbolRole;
  line?: number;
  used: boolean;
}

export interface SymbolTable {
  symbols: Map<string, SymbolEntry>;
  errors: SemanticError[];
}

// I1: uso de identificador no declarado en el programa.
// I2: redeclaración del mismo identificador.
// I3: identificador declarado que no existe en el catálogo de catalog.ts.
// I4: identificador usado en un rol distinto al declarado (SENSOR <-> ACTUADOR).
// I5: CULTIVO existente en el catálogo.
// I6: identificador declarado y nunca usado (advertencia, no bloquea el C++).
export function buildSymbolTable(program: Program): SymbolTable {
  const symbols = new Map<string, SymbolEntry>();
  const errors: SemanticError[] = [];

  for (const decl of program.declarations) {
    registerDeclaration(decl, symbols, errors);
  }

  checkCrop(program, errors);
  checkUsages(program, symbols, errors);
  checkUnused(symbols, errors);

  return { symbols, errors };
}

function registerDeclaration(decl: Declaration, symbols: Map<string, SymbolEntry>, errors: SemanticError[]) {
  const role: SymbolRole = decl.kind === "SensorDeclaration" ? "SENSOR" : "ACTUADOR";

  // I2: redeclaración.
  if (symbols.has(decl.id)) {
    errors.push(identifierError("I2", `"${decl.id}" ya fue declarado antes; no se puede declarar dos veces.`, decl.line));
    return;
  }

  // I3: el identificador declarado debe existir en el catálogo de catalog.ts
  // (que sigue siendo la fuente de verdad de pines/unidades — ver CLAUDE.md).
  const existsInCatalog = role === "SENSOR" ? findSensor(decl.id) : findActuator(decl.id);
  if (!existsInCatalog) {
    errors.push(
      identifierError(
        "I3",
        `"${decl.id}" no existe en el catálogo de ${role === "SENSOR" ? "sensores" : "actuadores"} del dispositivo.`,
        decl.line
      )
    );
    return;
  }

  symbols.set(decl.id, { id: decl.id, role, line: decl.line, used: false });
}

function checkCrop(program: Program, errors: SemanticError[]) {
  // I5: CULTIVO debe existir en el catálogo de catalog.ts.
  if (!findCrop(program.crop)) {
    errors.push(
      identifierError("I5", `El cultivo "${program.crop}" no existe en el catálogo de cultivos.`, program.cropLine)
    );
  }
}

// expectedRole es opcional: el lado izquierdo de una comparación y el
// argumento de ENCENDER/APAGAR tienen un rol inequívoco por gramática (I4 se
// aplica ahí). El lado derecho de una comparación es ambiguo — puede ser otro
// SENSOR o, por error, un ACTUADOR — y ese caso lo resuelve exclusivamente el
// analizador de tipos (T6/T9), para no reportar dos veces el mismo error con
// categorías distintas.
function markUsage(
  id: string,
  expectedRole: SymbolRole | undefined,
  line: number | undefined,
  symbols: Map<string, SymbolEntry>,
  errors: SemanticError[]
) {
  const symbol = symbols.get(id);
  // I1: uso de identificador no declarado.
  if (!symbol) {
    errors.push(identifierError("I1", `"${id}" se usa pero nunca fue declarado con SENSOR/ACTUADOR.`, line));
    return;
  }
  symbol.used = true;
  // I4: identificador usado en un rol distinto al que fue declarado.
  if (expectedRole && symbol.role !== expectedRole) {
    errors.push(identifierError("I4", `"${id}" fue declarado como ${symbol.role} pero se usa como ${expectedRole}.`, line));
  }
}

function checkUsages(program: Program, symbols: Map<string, SymbolEntry>, errors: SemanticError[]) {
  const visitExpr = (e: Expr) => {
    if (e.kind === "Comparison") {
      markUsage(e.left.sensor, "SENSOR", undefined, symbols, errors);
      // Rol ambiguo a propósito (ver markUsage): solo se valida que exista (I1).
      if (e.right.kind === "SensorRef") markUsage(e.right.sensor, undefined, undefined, symbols, errors);
      if (e.right.kind === "ActuatorRef") markUsage(e.right.actuator, undefined, undefined, symbols, errors);
    } else {
      visitExpr(e.left);
      visitExpr(e.right);
    }
  };
  const visitStatement = (s: Statement) => {
    if (s.kind === "StateAction") markUsage(s.actuator, "ACTUADOR", undefined, symbols, errors);
  };

  for (const rule of program.rules) {
    visitExpr(rule.condition);
    rule.actions.forEach(visitStatement);
  }
}

function checkUnused(symbols: Map<string, SymbolEntry>, errors: SemanticError[]) {
  // I6: advertencia, no bloquea la generación de C++.
  for (const symbol of symbols.values()) {
    if (!symbol.used) {
      errors.push(identifierError("I6", `"${symbol.id}" está declarado pero ninguna regla lo usa.`, symbol.line));
    }
  }
}
