// Parser descendente recursivo: texto del lenguaje intermedio -> AST (Program).
// Es deliberadamente PERMISIVO: acepta cosas sintácticamente correctas pero
// semánticamente inválidas (p. ej. "HUMEDAD_SUELO < BOMBA_PRINCIPAL" o
// "ESPERAR 2.5"). Rechazarlas es trabajo del analizador de tipos
// (src/compiler/typeChecker.ts), no del parser.
//
// Gramática (EBNF resumida):
//   programa      := "CULTIVO" ID ";" declaracion* regla*
//   declaracion   := ("SENSOR" | "ACTUADOR") ID ";"
//   regla         := "SI" expr horario? sentencia+
//   horario       := "SIEMPRE" "QUE" "HORA" "ENTRE" HORA "Y" HORA
//   expr          := andExpr ("O" andExpr)*
//   andExpr       := atom ("Y" atom)*
//   atom          := "(" expr ")" | comparacion
//   comparacion   := ID OP_RELACIONAL operando
//   operando      := NUMERO | ID
//   sentencia     := ("ENCENDER" | "APAGAR") ID ";"
//                  | "ESPERAR" NUMERO ";"
import type { Declaration, Expr, Operand, Program, Rule, Statement } from "./ast.ts";
import { tokenize, type Token } from "./lexer.ts";
import type { RelationalOperator } from "./catalog.ts";

export class ParseError extends Error { // Error sintáctico (no semántico) detectado por el parser.
  line: number;
  constructor(message: string, line: number) {
    super(`Error sintáctico (línea ${line}): ${message}`);
    this.name = "ParseError";
    this.line = line;
  }
}

class Cursor { // Cursor sobre la lista de tokens que produce el lexer. Permite avanzar y
  // verificar el token actual, con manejo de errores sintácticos.
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  current(): Token {
    return this.tokens[this.pos];
  }

  advance(): Token {
    return this.tokens[this.pos++];
  }

  is(value: string): boolean {
    return this.current().value === value;
  }

  isType(type: Token["type"]): boolean {
    return this.current().type === type;
  }

  expect(value: string): Token {
    if (!this.is(value)) {
      throw new ParseError(
        `se esperaba "${value}" pero se encontró "${this.current().value || "fin de archivo"}"`,
        this.current().line
      );
    }
    return this.advance();
  }

  expectType(type: Token["type"], description: string): Token {
    if (!this.isType(type)) {
      throw new ParseError(
        `se esperaba ${description} pero se encontró "${this.current().value || "fin de archivo"}"`,
        this.current().line
      );
    }
    return this.advance();
  }
}

function parseOperand(cur: Cursor): Operand { // Un operando puede ser un literal (número) o una referencia a un sensor o actuador.
  if (cur.isType("NUMBER")) {
    const t = cur.advance();
    const isDecimal = t.value.includes(".");
    return { kind: "Literal", value: Number(t.value), type: isDecimal ? "DECIMAL" : "ENTERO" };
  }
  if (cur.isType("IDENTIFIER")) {
    const t = cur.advance();
    // No sabemos todavía si es SENSOR o ACTUADOR (eso lo decide la tabla de
    // símbolos); se guarda como SensorRef y el analizador de tipos lo
    // reclasifica si corresponde. Ver symbolTable.ts / typeChecker.ts.
    return { kind: "SensorRef", sensor: t.value };
  }
  throw new ParseError(`se esperaba un número o un identificador`, cur.current().line);
}

function parseComparison(cur: Cursor): Expr { // Una comparación es siempre entre un sensor y un operando (literal o sensor/actuador).
  const left = cur.expectType("IDENTIFIER", "un identificador");
  const op = cur.expectType("RELATIONAL_OPERATOR", "un operador relacional (<, >, =, <=, >=)");
  const right = parseOperand(cur);
  return {
    kind: "Comparison",
    operator: op.value as RelationalOperator,
    left: { kind: "SensorRef", sensor: left.value },
    right,
  };
}

function parseAtom(cur: Cursor): Expr { // Un "átomo" es un paréntesis con una expresión dentro, o una comparación.
  if (cur.isType("LPAREN")) {
    cur.advance();
    const e = parseExpr(cur);
    cur.expect(")");
    return e;
  }
  return parseComparison(cur);
}

function parseAndExpr(cur: Cursor): Expr {
  let left = parseAtom(cur);
  while (cur.is("Y")) {
    cur.advance();
    const right = parseAtom(cur);
    left = { kind: "Logical", operator: "Y", left, right };
  }
  return left;
}

function parseExpr(cur: Cursor): Expr {
  let left = parseAndExpr(cur);
  while (cur.is("O")) {
    cur.advance();
    const right = parseAndExpr(cur);
    left = { kind: "Logical", operator: "O", left, right };
  }
  return left;
}

function parseStatement(cur: Cursor): Statement {
  if (cur.is("ENCENDER") || cur.is("APAGAR")) {
    const action = cur.advance().value as "ENCENDER" | "APAGAR";
    const actuator = cur.expectType("IDENTIFIER", "el nombre de un actuador").value;
    cur.expect(";");
    return { kind: "StateAction", action, actuator };
  }
  if (cur.is("ESPERAR")) {
    cur.advance();
    // Se acepta cualquier NUMBER (incluso decimal): el analizador de tipos es
    // quien exige que ESPERAR reciba un ENTERO positivo (regla T5/T7).
    const num = cur.expectType("NUMBER", "una cantidad de segundos").value;
    cur.expect(";");
    return { kind: "WaitAction", action: "ESPERAR", seconds: Number(num) };
  }
  throw new ParseError(
    `se esperaba una acción (ENCENDER, APAGAR o ESPERAR) pero se encontró "${cur.current().value}"`,
    cur.current().line
  );
}

function startsStatement(cur: Cursor): boolean {
  return cur.is("ENCENDER") || cur.is("APAGAR") || cur.is("ESPERAR");
}

function parseRule(cur: Cursor): Rule {
  const line = cur.current().line;
  cur.expect("SI");
  const condition = parseExpr(cur);

  let timeWindow: Rule["timeWindow"];
  if (cur.is("SIEMPRE")) {
    cur.advance();
    cur.expect("QUE");
    cur.expect("HORA");
    cur.expect("ENTRE");
    const from = cur.expectType("TIME", "una hora HH:MM").value;
    cur.expect("Y");
    const to = cur.expectType("TIME", "una hora HH:MM").value;
    timeWindow = { from, to };
  }

  const actions: Statement[] = [];
  while (startsStatement(cur)) {
    actions.push(parseStatement(cur));
  }
  if (actions.length === 0) {
    throw new ParseError("una regla SI necesita al menos una acción", cur.current().line);
  }

  return { id: `regla-linea-${line}`, name: `Regla (línea ${line})`, condition, actions, timeWindow };
}

function parseDeclaration(cur: Cursor): Declaration {
  const line = cur.current().line;
  if (cur.is("SENSOR")) {
    cur.advance();
    const id = cur.expectType("IDENTIFIER", "el nombre de un sensor").value;
    cur.expect(";");
    return { kind: "SensorDeclaration", id, line };
  }
  cur.expect("ACTUADOR");
  const id = cur.expectType("IDENTIFIER", "el nombre de un actuador").value;
  cur.expect(";");
  return { kind: "ActuatorDeclaration", id, line };
}

export function parseProgram(source: string): Program {
  const cur = new Cursor(tokenize(source));

  cur.expect("CULTIVO");
  const cropLine = cur.current().line;
  const crop = cur.expectType("IDENTIFIER", "el nombre de un cultivo").value;
  cur.expect(";");

  const declarations: Declaration[] = [];
  while (cur.is("SENSOR") || cur.is("ACTUADOR")) {
    declarations.push(parseDeclaration(cur));
  }

  const rules: Rule[] = [];
  while (cur.is("SI")) {
    rules.push(parseRule(cur));
  }

  if (!cur.isType("EOF")) {
    throw new ParseError(
      `contenido inesperado: "${cur.current().value}" (¿falta declarar el identificador o falta un ";"?)`,
      cur.current().line
    );
  }

  return { crop, cropLine, declarations, rules };
}
