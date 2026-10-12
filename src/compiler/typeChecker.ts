// Analizador semántico: aplica la matriz de tipos de la Actividad 5 y la
// tabla de símbolos (src/compiler/symbolTable.ts) sobre el AST que produce el
// parser (src/compiler/parser.ts) o los constructores de conveniencia (ast.ts).
// La matriz se representa como tabla de datos (no como ifs anidados) para que
// quede clara la trazabilidad con el documento entregado.
import type { Comparison, Expr, Logical, Operand, Program, Rule, StateAction, Statement, WaitAction } from "./ast.ts";
import type { DataType } from "./catalog.ts";
import { semanticError, isBlocking, type SemanticError } from "./errors.ts";
import { buildSymbolTable, type SymbolTable } from "./symbolTable.ts";

export interface TypeRule {
  id: string; // T1..T9, como en el documento "Actividad 5"
  type1: DataType;
  operator: string;
  type2: DataType;
  result: DataType | "EJECUCION" | "PAUSA" | "ERROR";
}

// Matriz de la Actividad 5 — Sección 3.
// T1-T5: combinaciones válidas (mínimo pedido: 5 reglas de comprobación de tipos).
// T6-T9: combinaciones inválidas, explícitas como filas de error — así cada
// rechazo del analizador cita la fila exacta que violó, igual que un válido.
export const TYPE_MATRIX: TypeRule[] = [
  { id: "T1", type1: "SENSOR", operator: "relacional (<,>,=,<=,>=)", type2: "ENTERO", result: "BOOLEANO" },
  { id: "T2", type1: "SENSOR", operator: "relacional (<,>,=,<=,>=)", type2: "DECIMAL", result: "BOOLEANO" },
  { id: "T3", type1: "BOOLEANO", operator: "lógico (Y, O)", type2: "BOOLEANO", result: "BOOLEANO" },
  { id: "T4", type1: "ACCION_ESTADO", operator: "aplicación", type2: "ACTUADOR", result: "EJECUCION" },
  { id: "T5", type1: "ACCION_TIEMPO", operator: "aplicación", type2: "ENTERO", result: "PAUSA" },
  { id: "T6", type1: "SENSOR", operator: "relacional (<,>,=,<=,>=)", type2: "ACTUADOR", result: "ERROR" },
  { id: "T7", type1: "ACCION_TIEMPO", operator: "aplicación", type2: "DECIMAL", result: "ERROR" },
  { id: "T8", type1: "ACCION_ESTADO", operator: "aplicación", type2: "SENSOR", result: "ERROR" },
  { id: "T9", type1: "SENSOR", operator: "relacional (<,>,=,<=,>=)", type2: "SENSOR", result: "ERROR" },
];

function findRule(type1: DataType, isRelational: boolean, type2: DataType): TypeRule | undefined {
  return TYPE_MATRIX.find(
    (r) => r.type1 === type1 && r.type2 === type2 && (isRelational ? r.operator.startsWith("relacional") : true)
  );
}

type CheckResult =
  | { ok: true; type: DataType | "EJECUCION" | "PAUSA"; rule: string }
  | { ok: false; error: SemanticError };

// El lado derecho de una comparación puede ser un Literal, o una referencia a
// otro identificador cuyo rol real (SENSOR/ACTUADOR) solo se conoce a través
// de la tabla de símbolos — así se detecta "HUMEDAD_SUELO < BOMBA_PRINCIPAL"
// (T6) sin que el parser tenga que adivinar el rol de antemano.
function typeOfOperand(node: Operand, table: SymbolTable): DataType {
  if (node.kind === "Literal") return node.type;
  if (node.kind === "ActuatorRef") return "ACTUADOR";
  const symbol = table.symbols.get(node.sensor);
  // Si no está en la tabla, symbolTable ya reportó IDENTIFICADOR_NO_DECLARADO (I1);
  // aquí se asume SENSOR para no generar un segundo error redundante.
  return symbol?.role ?? "SENSOR";
}

function operandLabel(node: Operand): string {
  if (node.kind === "SensorRef") return node.sensor;
  if (node.kind === "ActuatorRef") return node.actuator;
  return `${node.value}`;
}

function checkComparison(node: Comparison, table: SymbolTable): CheckResult {
  const leftSymbol = table.symbols.get(node.left.sensor);
  const type1: DataType = leftSymbol?.role ?? "SENSOR";
  const type2 = typeOfOperand(node.right, table);

  const row = findRule(type1, true, type2);
  if (!row || row.result === "ERROR") {
    return {
      ok: false,
      error: semanticError(
        "TIPO_INCOMPATIBLE",
        row?.id ?? "T1/T2",
        `No es posible comparar "${node.left.sensor}" (${type1}) con ${operandLabel(node.right)} (${type2}).`
      ),
    };
  }
  return { ok: true, type: "BOOLEANO", rule: row.id };
}

function checkLogical(node: Logical, table: SymbolTable): CheckResult {
  const left = checkExpr(node.left, table);
  if (!left.ok) return left;
  const right = checkExpr(node.right, table);
  if (!right.ok) return right;

  const row = findRule("BOOLEANO", false, "BOOLEANO");
  if (!row || left.type !== "BOOLEANO" || right.type !== "BOOLEANO") {
    return {
      ok: false,
      error: semanticError(
        "TIPO_INCOMPATIBLE",
        "T3",
        `El operador lógico "${node.operator}" solo puede unir dos condiciones BOOLEANAS.`
      ),
    };
  }
  return { ok: true, type: "BOOLEANO", rule: row.id };
}

function checkExpr(node: Expr, table: SymbolTable): CheckResult {
  if (node.kind === "Comparison") return checkComparison(node, table);
  return checkLogical(node, table);
}

function checkStateAction(node: StateAction, table: SymbolTable): CheckResult {
  const symbol = table.symbols.get(node.actuator);
  const type2: DataType = symbol?.role ?? "ACTUADOR";
  const row = findRule("ACCION_ESTADO", false, type2);
  if (!row || row.result === "ERROR") {
    return {
      ok: false,
      error: semanticError(
        "TIPO_INCOMPATIBLE",
        row?.id ?? "T4",
        `"${node.action}" exige un ACTUADOR, pero "${node.actuator}" es de tipo ${type2}.`
      ),
    };
  }
  return { ok: true, type: "EJECUCION", rule: row.id };
}

function checkWaitAction(node: WaitAction): CheckResult {
  if (!Number.isFinite(node.seconds) || node.seconds <= 0) {
    return {
      ok: false,
      error: semanticError(
        "REGLA_MAL_FORMADA",
        "T5",
        `"ESPERAR" exige un ENTERO positivo de segundos (se recibió ${node.seconds}).`
      ),
    };
  }
  if (!Number.isInteger(node.seconds)) {
    return {
      ok: false,
      error: semanticError(
        "TIPO_INCOMPATIBLE",
        "T7",
        `"ESPERAR" exige un ENTERO de segundos, pero ${node.seconds} es DECIMAL.`
      ),
    };
  }
  return { ok: true, type: "PAUSA", rule: "T5" };
}

function checkStatement(node: Statement, table: SymbolTable): CheckResult {
  if (node.kind === "StateAction") return checkStateAction(node, table);
  return checkWaitAction(node);
}

export interface RuleCheckResult {
  ruleId: string;
  inferredType?: DataType | "EJECUCION" | "PAUSA";
  // Filas de TYPE_MATRIX que efectivamente se aplicaron (condición + cada
  // acción), en orden. Se acumulan también cuando el resultado es válido —
  // sin esto, un caso de prueba correcto no podría citar "regla aplicada: T1".
  appliedRules: string[];
  errors: SemanticError[];
}

function checkRule(rule: Rule, table: SymbolTable): RuleCheckResult {
  const errors: SemanticError[] = [];
  const appliedRules: string[] = [];
  let inferredType: RuleCheckResult["inferredType"];

  const condition = checkExpr(rule.condition, table);
  if (!condition.ok) errors.push(condition.error);
  else if (condition.type !== "BOOLEANO") {
    errors.push(semanticError("REGLA_MAL_FORMADA", condition.rule, `La condición de "${rule.name}" debe evaluar a BOOLEANO.`));
  } else {
    inferredType = condition.type;
    appliedRules.push(condition.rule);
  }

  if (rule.actions.length === 0) {
    errors.push(semanticError("REGLA_MAL_FORMADA", "-", `La regla "${rule.name}" no tiene ninguna acción.`));
  }
  for (const action of rule.actions) {
    const r = checkStatement(action, table);
    if (!r.ok) errors.push(r.error);
    else appliedRules.push(r.rule);
  }

  return { ruleId: rule.id, inferredType, appliedRules, errors };
}

export function checkProgram(program: Program): RuleCheckResult[] {
  const table = buildSymbolTable(program);
  const results = program.rules.map((rule) => checkRule(rule, table));

  // Los errores de declaración (I1-I6) no pertenecen a ninguna regla puntual;
  // se listan aparte, bajo un "ruleId" fijo, para no perderlos.
  if (table.errors.length > 0) {
    results.unshift({ ruleId: "(declaraciones)", appliedRules: [], errors: table.errors });
  }
  return results;
}

// Errores bloqueantes (todos menos ADVERTENCIA) de todos los resultados.
// Es el gate obligatorio antes de generar código: vacío = programa válido.
export function blockingErrors(results: RuleCheckResult[]): SemanticError[] {
  return results.flatMap((r) => r.errors.filter(isBlocking));
}
