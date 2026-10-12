// AST -> texto del lenguaje intermedio (CULTIVO CANA; SENSOR HUMEDAD_SUELO;
// SI HUMEDAD_SUELO < 30 ENCENDER BOMBA_PRINCIPAL;).
// Sirve para que el agricultor y la docente vean qué "entendió" el sistema, y
// también como round-trip: el texto que emite programToText es el mismo que
// acepta el parser (src/compiler/parser.ts) — es la prueba de que ambos hablan
// el mismo lenguaje.
import type { Declaration, Expr, Operand, Program, Rule, Statement } from "./ast.ts";
import { usedDeclarations } from "./ast.ts";

function operandToText(node: Operand): string {
  if (node.kind === "Literal") return `${node.value}`;
  if (node.kind === "SensorRef") return node.sensor;
  return node.actuator;
}

function exprToText(node: Expr): string {
  if (node.kind === "Comparison") {
    return `${node.left.sensor} ${node.operator} ${operandToText(node.right)}`;
  }
  return `(${exprToText(node.left)}) ${node.operator} (${exprToText(node.right)})`;
}

function statementToText(node: Statement): string {
  if (node.kind === "StateAction") return `${node.action} ${node.actuator}`;
  return `ESPERAR ${node.seconds}`;
}

function declarationToText(node: Declaration): string {
  return node.kind === "SensorDeclaration" ? `SENSOR ${node.id};` : `ACTUADOR ${node.id};`;
}

export function ruleToText(rule: Rule): string {
  const condition = exprToText(rule.condition);
  const actions = rule.actions.map(statementToText).join(";\n  ");
  const window = rule.timeWindow ? ` SIEMPRE QUE HORA ENTRE ${rule.timeWindow.from} Y ${rule.timeWindow.to}` : "";
  return `SI ${condition}${window}\n  ${actions};`;
}

export function programToText(program: Program): string {
  const header = `CULTIVO ${program.crop};`;
  // Si el programa no trae declaraciones explícitas (p. ej. viene de una receta
  // pre-armada), se derivan de lo que realmente usan las reglas, para que el
  // texto emitido siempre sea releíble por el parser.
  const declarations =
    program.declarations.length > 0 ? program.declarations : usedDeclarations(program.rules);
  const declarationBlock = declarations.map(declarationToText).join("\n");
  const rules = program.rules.map(ruleToText).join("\n\n");
  return `${header}\n${declarationBlock}\n\n${rules}`;
}
