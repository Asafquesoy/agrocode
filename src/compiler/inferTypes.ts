// Inferencia del tipo de dato de cada sensor según cómo se usa en las reglas.
// Al agricultor nunca se le pregunta: el tipo sale de las comparaciones.
//   - alguna comparación con un número decimal      -> DECIMAL
//   - todas las comparaciones son "= 0" o "= 1"     -> BOOLEANO
//   - cualquier otro caso                           -> ENTERO
// No toca TYPE_MATRIX: T1/T2 ya cubren SENSOR vs ENTERO/DECIMAL.
import type { Expr, Program } from "./ast.ts";

export type SensorValueType = "ENTERO" | "DECIMAL" | "BOOLEANO";

interface Usage {
  hasDecimal: boolean;
  allBoolean: boolean;
}

export function inferSensorTypes(program: Program): Map<string, SensorValueType> {
  const usage = new Map<string, Usage>();

  const visit = (e: Expr) => {
    if (e.kind === "Logical") {
      visit(e.left);
      visit(e.right);
      return;
    }
    // Solo se infiere sobre comparaciones contra un número; contra un
    // identificador es un error de tipos (T6/T9) que ya reporta el analizador.
    if (e.right.kind !== "Literal") return;
    const current = usage.get(e.left.sensor) ?? { hasDecimal: false, allBoolean: true };
    current.hasDecimal ||= e.right.type === "DECIMAL";
    current.allBoolean &&= e.operator === "=" && (e.right.value === 0 || e.right.value === 1);
    usage.set(e.left.sensor, current);
  };
  for (const rule of program.rules) visit(rule.condition);

  const types = new Map<string, SensorValueType>();
  for (const [id, u] of usage) {
    types.set(id, u.hasDecimal ? "DECIMAL" : u.allBoolean ? "BOOLEANO" : "ENTERO");
  }
  return types;
}
