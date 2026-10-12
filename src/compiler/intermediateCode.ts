// Generación de código intermedio: AST (ya verificado) -> cuádruplos.
//
// Un cuádruplo es (operación, arg1, arg2, resultado). Es la representación
// lineal que queda entre el análisis semántico y el código final: el
// generador de C++ (cppGenerator.ts) solo lee esta lista, nunca el AST.
//
// Cada regla del agricultor se traduce a un bloque con esta forma:
//   <cálculo de la condición en temporales t1, t2, ...>
//   SALTARF tN, Lk     (si la condición es falsa, salta al final de la regla)
//   <acciones: ENCENDER / APAGAR / ESPERAR>
//   ETIQUETA Lk
import type { Expr, Program, Statement, TimeWindow } from "./ast.ts";
import { blockingErrors, checkProgram } from "./typeChecker.ts";
import { SENSORS } from "./catalog.ts";

export type IROp =
  | "LEER"
  | "<"
  | ">"
  | "="
  | "<="
  | ">="
  | "Y"
  | "O"
  | "SALTARF"
  | "ENCENDER"
  | "APAGAR"
  | "ESPERAR"
  | "ETIQUETA";

export interface Quadruple {
  index: number;
  op: IROp;
  arg1: string | null;
  arg2: string | null;
  result: string | null;
}

// Rango [from, to] (índices inclusivos de `quadruples`) que ocupa una regla.
export interface IRRuleBlock {
  id: string;
  name: string;
  timeWindow?: TimeWindow;
  from: number;
  to: number;
}

export interface IRProgram {
  crop: string;
  quadruples: Quadruple[];
  rules: IRRuleBlock[];
}

function usedSensors(program: Program): Set<string> {
  const used = new Set<string>();
  const visit = (e: Expr) => {
    if (e.kind === "Comparison") {
      used.add(e.left.sensor);
      if (e.right.kind === "SensorRef") used.add(e.right.sensor);
    } else {
      visit(e.left);
      visit(e.right);
    }
  };
  for (const rule of program.rules) visit(rule.condition);
  return used;
}

export function generateIntermediateCode(program: Program): IRProgram {
  // Gate semántico: nunca se genera código intermedio de un programa inválido.
  const errors = blockingErrors(checkProgram(program));
  if (errors.length > 0) {
    const detail = errors.map((e) => `  - [${e.rule}] ${e.message}`).join("\n");
    throw new Error(`No se puede generar código: hay errores de tipos.\n${detail}`);
  }

  const quadruples: Quadruple[] = [];
  const blocks: IRRuleBlock[] = [];
  let temporalCounter = 0;
  let labelCounter = 0;

  const emit = (op: IROp, arg1: string | null, arg2: string | null, result: string | null) => {
    quadruples.push({ index: quadruples.length, op, arg1, arg2, result });
  };

  // Postorden: emite los hijos y devuelve el temporal que guarda el resultado.
  const emitExpr = (e: Expr): string => {
    if (e.kind === "Comparison") {
      // El gate garantiza SENSOR vs número; el throw cubre un AST armado a mano.
      if (e.right.kind !== "Literal") {
        throw new Error(`Comparación no soportada: ${e.left.sensor} contra un identificador, no un número.`);
      }
      const temporal = `t${++temporalCounter}`;
      emit(e.operator, e.left.sensor, String(e.right.value), temporal);
      return temporal;
    }
    const left = emitExpr(e.left);
    const right = emitExpr(e.right);
    const temporal = `t${++temporalCounter}`;
    emit(e.operator, left, right, temporal);
    return temporal;
  };

  const emitStatement = (s: Statement) => {
    if (s.kind === "StateAction") emit(s.action, s.actuator, null, null);
    else emit("ESPERAR", String(s.seconds), null, null);
  };

  // Una lectura por sensor usado, en el orden del catálogo (determinista).
  const used = usedSensors(program);
  for (const sensor of SENSORS) {
    if (used.has(sensor.id)) emit("LEER", sensor.id, null, sensor.id);
  }

  for (const rule of program.rules) {
    const from = quadruples.length;
    const label = `L${++labelCounter}`;
    const condition = emitExpr(rule.condition);
    emit("SALTARF", condition, null, label);
    rule.actions.forEach(emitStatement);
    emit("ETIQUETA", null, null, label);
    blocks.push({
      id: rule.id,
      name: rule.name,
      timeWindow: rule.timeWindow,
      from,
      to: quadruples.length - 1,
    });
  }

  return { crop: program.crop, quadruples, rules: blocks };
}

export function cell(value: string | null): string {
  return value ?? "-";
}

export function quadrupleToText(q: Quadruple): string {
  return `(${q.op}, ${cell(q.arg1)}, ${cell(q.arg2)}, ${cell(q.result)})`;
}

export function intermediateCodeToText(ir: IRProgram): string {
  const lines: string[] = [`// Cultivo: ${ir.crop}`];
  const firstRuleStart = ir.rules.length > 0 ? ir.rules[0].from : ir.quadruples.length;
  const width = String(ir.quadruples.length).length;
  const row = (q: Quadruple) => `${String(q.index).padStart(width, " ")}: ${quadrupleToText(q)}`;

  ir.quadruples.slice(0, firstRuleStart).forEach((q) => lines.push(row(q)));
  for (const block of ir.rules) {
    const window = block.timeWindow ? ` (${block.timeWindow.from}-${block.timeWindow.to})` : "";
    lines.push(`// Regla: ${block.name}${window}`);
    ir.quadruples.slice(block.from, block.to + 1).forEach((q) => lines.push(row(q)));
  }
  return lines.join("\n");
}
