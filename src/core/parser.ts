// Parser descendente recursivo: texto del lenguaje intermedio -> AST (Programa).
// Es deliberadamente PERMISIVO: acepta cosas sintácticamente correctas pero
// semánticamente inválidas (p. ej. "HUMEDAD_SUELO < BOMBA_PRINCIPAL" o
// "ESPERAR 2.5"). Rechazarlas es trabajo del analizador de tipos
// (src/core/analizadorTipos.ts), no del parser — si el parser fuera estricto,
// esos errores nunca llegarían a demostrarse.
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
import type {
  Declaracion,
  Expr,
  Operando,
  Programa,
  Regla,
  Sentencia,
} from "./ast.ts";
import { tokenizar, type Token } from "./lexer.ts";
import type { OperadorLogico, OperadorRelacional } from "./tipos.ts";

export class ErrorSintactico extends Error {
  linea: number;
  constructor(mensaje: string, linea: number) {
    super(`Error sintáctico (línea ${linea}): ${mensaje}`);
    this.name = "ErrorSintactico";
    this.linea = linea;
  }
}

class Cursor {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  actual(): Token {
    return this.tokens[this.pos];
  }

  avanzar(): Token {
    return this.tokens[this.pos++];
  }

  es(valor: string): boolean {
    return this.actual().valor === valor;
  }

  esTipo(tipo: Token["tipo"]): boolean {
    return this.actual().tipo === tipo;
  }

  esperar(valor: string): Token {
    if (!this.es(valor)) {
      throw new ErrorSintactico(
        `se esperaba "${valor}" pero se encontró "${this.actual().valor || "fin de archivo"}"`,
        this.actual().linea
      );
    }
    return this.avanzar();
  }

  esperarTipo(tipo: Token["tipo"], descripcion: string): Token {
    if (!this.esTipo(tipo)) {
      throw new ErrorSintactico(
        `se esperaba ${descripcion} pero se encontró "${this.actual().valor || "fin de archivo"}"`,
        this.actual().linea
      );
    }
    return this.avanzar();
  }
}

function parseOperando(cur: Cursor): Operando {
  if (cur.esTipo("NUMERO")) {
    const t = cur.avanzar();
    const esDecimal = t.valor.includes(".");
    return { clase: "Literal", valor: Number(t.valor), tipo: esDecimal ? "DECIMAL" : "ENTERO" };
  }
  if (cur.esTipo("IDENTIFICADOR")) {
    const t = cur.avanzar();
    // No sabemos todavía si es SENSOR o ACTUADOR (eso lo decide la tabla de
    // símbolos); se guarda como RefSensor y el analizador de tipos lo
    // reclasifica si corresponde. Ver tablaSimbolos.ts / analizadorTipos.ts.
    return { clase: "RefSensor", sensor: t.valor };
  }
  throw new ErrorSintactico(`se esperaba un número o un identificador`, cur.actual().linea);
}

function parseComparacion(cur: Cursor): Expr {
  const izq = cur.esperarTipo("IDENTIFICADOR", "un identificador");
  const op = cur.esperarTipo("OPERADOR_RELACIONAL", "un operador relacional (<, >, =, <=, >=)");
  const derecha = parseOperando(cur);
  return {
    clase: "Comparacion",
    operador: op.valor as OperadorRelacional,
    izquierda: { clase: "RefSensor", sensor: izq.valor },
    derecha,
  };
}

function parseAtom(cur: Cursor): Expr {
  if (cur.esTipo("PAREN_ABRE")) {
    cur.avanzar();
    const e = parseExpr(cur);
    cur.esperar(")");
    return e;
  }
  return parseComparacion(cur);
}

function parseAndExpr(cur: Cursor): Expr {
  let izq = parseAtom(cur);
  while (cur.es("Y")) {
    cur.avanzar();
    const der = parseAtom(cur);
    izq = { clase: "Logica", operador: "Y" as OperadorLogico, izquierda: izq, derecha: der };
  }
  return izq;
}

function parseExpr(cur: Cursor): Expr {
  let izq = parseAndExpr(cur);
  while (cur.es("O")) {
    cur.avanzar();
    const der = parseAndExpr(cur);
    izq = { clase: "Logica", operador: "O" as OperadorLogico, izquierda: izq, derecha: der };
  }
  return izq;
}

function parseSentencia(cur: Cursor): Sentencia {
  if (cur.es("ENCENDER") || cur.es("APAGAR")) {
    const accion = cur.avanzar().valor as "ENCENDER" | "APAGAR";
    const actuador = cur.esperarTipo("IDENTIFICADOR", "el nombre de un actuador").valor;
    cur.esperar(";");
    return { clase: "AccionEstado", accion, actuador };
  }
  if (cur.es("ESPERAR")) {
    cur.avanzar();
    // Se acepta cualquier NUMERO (incluso decimal): el analizador de tipos es
    // quien exige que ESPERAR reciba un ENTERO positivo (regla T5/T7).
    const num = cur.esperarTipo("NUMERO", "una cantidad de segundos").valor;
    cur.esperar(";");
    return { clase: "AccionTiempo", accion: "ESPERAR", segundos: Number(num) };
  }
  throw new ErrorSintactico(
    `se esperaba una acción (ENCENDER, APAGAR o ESPERAR) pero se encontró "${cur.actual().valor}"`,
    cur.actual().linea
  );
}

function esInicioSentencia(cur: Cursor): boolean {
  return cur.es("ENCENDER") || cur.es("APAGAR") || cur.es("ESPERAR");
}

function parseRegla(cur: Cursor): Regla {
  const linea = cur.actual().linea;
  cur.esperar("SI");
  const condicion = parseExpr(cur);

  let restriccionHoraria: Regla["restriccionHoraria"];
  if (cur.es("SIEMPRE")) {
    cur.avanzar();
    cur.esperar("QUE");
    cur.esperar("HORA");
    cur.esperar("ENTRE");
    const desde = cur.esperarTipo("HORA", "una hora HH:MM").valor;
    cur.esperar("Y");
    const hasta = cur.esperarTipo("HORA", "una hora HH:MM").valor;
    restriccionHoraria = { desde, hasta };
  }

  const acciones: Sentencia[] = [];
  while (esInicioSentencia(cur)) {
    acciones.push(parseSentencia(cur));
  }
  if (acciones.length === 0) {
    throw new ErrorSintactico("una regla SI necesita al menos una acción", cur.actual().linea);
  }

  return { id: `regla-linea-${linea}`, nombre: `Regla (línea ${linea})`, condicion, acciones, restriccionHoraria };
}

function parseDeclaracion(cur: Cursor): Declaracion {
  const linea = cur.actual().linea;
  if (cur.es("SENSOR")) {
    cur.avanzar();
    const id = cur.esperarTipo("IDENTIFICADOR", "el nombre de un sensor").valor;
    cur.esperar(";");
    return { clase: "DeclaracionSensor", id, linea };
  }
  cur.esperar("ACTUADOR");
  const id = cur.esperarTipo("IDENTIFICADOR", "el nombre de un actuador").valor;
  cur.esperar(";");
  return { clase: "DeclaracionActuador", id, linea };
}

export function parsearPrograma(fuente: string): Programa {
  const cur = new Cursor(tokenizar(fuente));

  cur.esperar("CULTIVO");
  const cultivoLinea = cur.actual().linea;
  const cultivo = cur.esperarTipo("IDENTIFICADOR", "el nombre de un cultivo").valor;
  cur.esperar(";");

  const declaraciones: Declaracion[] = [];
  while (cur.es("SENSOR") || cur.es("ACTUADOR")) {
    declaraciones.push(parseDeclaracion(cur));
  }

  const reglas: Regla[] = [];
  while (cur.es("SI")) {
    reglas.push(parseRegla(cur));
  }

  if (!cur.esTipo("FIN")) {
    throw new ErrorSintactico(
      `contenido inesperado: "${cur.actual().valor}" (¿falta declarar el identificador o falta un ";"?)`,
      cur.actual().linea
    );
  }

  return { cultivo, cultivoLinea, declaraciones, reglas };
}
