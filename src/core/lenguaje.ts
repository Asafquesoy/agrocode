// AST -> texto del lenguaje intermedio (el que escribiría la docente en el ejemplo original:
// CULTIVO CAÑA; SENSOR HUMEDAD; SI HUMEDAD < 30 ACTIVAR RIEGO;).
// Sirve para que el agricultor y la docente vean qué "entendió" el sistema.
import type { Expr, Programa, Regla, Sentencia } from "./ast";
import { buscarActuador, buscarCultivo, buscarSensor } from "./tipos";

function exprATexto(nodo: Expr): string {
  if (nodo.clase === "Comparacion") {
    const sensor = buscarSensor(nodo.izquierda.sensor);
    const nombre = sensor?.id ?? nodo.izquierda.sensor;
    return `${nombre} ${nodo.operador} ${nodo.derecha.valor}`;
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
  const reglas = programa.reglas.map(reglaATexto).join("\n\n");
  return `${encabezado}\n\n${reglas}`;
}
