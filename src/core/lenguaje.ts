// AST -> texto del lenguaje intermedio (el que escribiría la docente en el ejemplo original:
// CULTIVO CAÑA; SENSOR HUMEDAD; SI HUMEDAD < 30 ACTIVAR RIEGO;).
// Sirve para que el agricultor y la docente vean qué "entendió" el sistema, y
// también como round-trip: el texto que emite programaATexto es el mismo que
// acepta el parser (src/core/parser.ts) — es la prueba de que ambos hablan el
// mismo lenguaje.
import type { Declaracion, Expr, Operando, Programa, Regla, Sentencia } from "./ast.ts";
import { declaracionesUsadas } from "./ast.ts";
import { buscarActuador, buscarCultivo, buscarSensor } from "./tipos.ts";

function operandoATexto(nodo: Operando): string {
  if (nodo.clase === "Literal") return `${nodo.valor}`;
  if (nodo.clase === "RefSensor") return nodo.sensor;
  return nodo.actuador;
}

function exprATexto(nodo: Expr): string {
  if (nodo.clase === "Comparacion") {
    const sensor = buscarSensor(nodo.izquierda.sensor);
    const nombre = sensor?.id ?? nodo.izquierda.sensor;
    return `${nombre} ${nodo.operador} ${operandoATexto(nodo.derecha)}`;
  }
  return `(${exprATexto(nodo.izquierda)}) ${nodo.operador} (${exprATexto(nodo.derecha)})`;
}

function sentenciaATexto(nodo: Sentencia): string {
  if (nodo.clase === "AccionEstado") {
    const actuador = buscarActuador(nodo.actuador);
    return `${nodo.accion} ${actuador?.id ?? nodo.actuador}`;
  }
  return `ESPERAR ${nodo.segundos}`;
}

function declaracionATexto(nodo: Declaracion): string {
  return nodo.clase === "DeclaracionSensor" ? `SENSOR ${nodo.id};` : `ACTUADOR ${nodo.id};`;
}

export function reglaATexto(regla: Regla): string {
  const condicion = exprATexto(regla.condicion);
  const acciones = regla.acciones.map(sentenciaATexto).join(";\n  ");
  const horario = regla.restriccionHoraria
    ? ` SIEMPRE QUE HORA ENTRE ${regla.restriccionHoraria.desde} Y ${regla.restriccionHoraria.hasta}`
    : "";
  return `SI ${condicion}${horario}\n  ${acciones};`;
}

export function programaATexto(programa: Programa): string {
  const cultivo = buscarCultivo(programa.cultivo);
  const encabezado = `CULTIVO ${cultivo?.id ?? programa.cultivo};`;
  // Si el programa no trae declaraciones explícitas (p. ej. viene de una receta
  // pre-armada construida antes de que el lenguaje las exigiera), se derivan
  // de lo que realmente usan las reglas, para que el texto emitido siempre sea
  // releíble por el parser.
  const declaraciones =
    programa.declaraciones && programa.declaraciones.length > 0
      ? programa.declaraciones
      : declaracionesUsadas(programa.reglas);
  const bloqueDeclaraciones = declaraciones.map(declaracionATexto).join("\n");
  const reglas = programa.reglas.map(reglaATexto).join("\n\n");
  return `${encabezado}\n${bloqueDeclaraciones}\n\n${reglas}`;
}
