// AST común: la interfaz de "receta" construye este árbol. El analizador de tipos
// y el generador de C++ solo conocen este AST, nunca la interfaz que lo produjo.
import type { OperadorLogico, OperadorRelacional } from "./tipos";

export interface RefSensor {
  clase: "RefSensor";
  sensor: string; // id de DefinicionSensor
}

export interface Literal {
  clase: "Literal";
  valor: number;
  tipo: "ENTERO" | "DECIMAL";
}

export interface Comparacion {
  clase: "Comparacion";
  operador: OperadorRelacional;
  izquierda: RefSensor;
  derecha: Literal;
}

export interface Logica {
  clase: "Logica";
  operador: OperadorLogico;
  izquierda: Expr;
  derecha: Expr;
}

export type Expr = Comparacion | Logica;

export interface AccionEstado {
  clase: "AccionEstado";
  accion: "ENCENDER" | "APAGAR";
  actuador: string; // id de DefinicionActuador
}

export interface AccionTiempo {
  clase: "AccionTiempo";
  accion: "ESPERAR";
  segundos: number;
}

export type Sentencia = AccionEstado | AccionTiempo;

export interface RestriccionHoraria {
  desde: string; // "HH:MM"
  hasta: string;
}

export interface Regla {
  id: string;
  nombre: string;
  condicion: Expr;
  acciones: Sentencia[];
  restriccionHoraria?: RestriccionHoraria;
}

export interface Programa {
  cultivo: string; // id de DefinicionCultivo
  reglas: Regla[];
}

// --- Constructores de conveniencia, usados por las 3 propuestas ---

export function refSensor(sensor: string): RefSensor {
  return { clase: "RefSensor", sensor };
}

export function literalEntero(valor: number): Literal {
  return { clase: "Literal", valor, tipo: "ENTERO" };
}

export function literalDecimal(valor: number): Literal {
  return { clase: "Literal", valor, tipo: "DECIMAL" };
}

export function comparacion(
  sensor: string,
  operador: OperadorRelacional,
  valor: number,
  tipoValor: "ENTERO" | "DECIMAL" = "ENTERO"
): Comparacion {
  return {
    clase: "Comparacion",
    operador,
    izquierda: refSensor(sensor),
    derecha: { clase: "Literal", valor, tipo: tipoValor },
  };
}

export function logica(operador: OperadorLogico, izquierda: Expr, derecha: Expr): Logica {
  return { clase: "Logica", operador, izquierda, derecha };
}

export function accionEstado(accion: "ENCENDER" | "APAGAR", actuador: string): AccionEstado {
  return { clase: "AccionEstado", accion, actuador };
}

export function accionTiempo(segundos: number): AccionTiempo {
  return { clase: "AccionTiempo", accion: "ESPERAR", segundos };
}
