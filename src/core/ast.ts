// AST común: la interfaz de "receta" construye este árbol. El analizador de tipos
// y el generador de C++ solo conocen este AST, nunca la interfaz que lo produjo.
import type { OperadorLogico, OperadorRelacional } from "./tipos.ts";

export interface RefSensor {
  clase: "RefSensor";
  sensor: string; // id de DefinicionSensor
}

export interface RefActuador {
  clase: "RefActuador";
  actuador: string; // id de DefinicionActuador
}

export interface Literal {
  clase: "Literal";
  valor: number;
  tipo: "ENTERO" | "DECIMAL";
}

// El lado derecho de una comparación puede ser un literal (caso normal) o una
// referencia a otro identificador (SENSOR/ACTUADOR). Admitir la referencia es
// lo que permite representar y luego rechazar semánticamente comparaciones
// como "HUMEDAD_SUELO < BOMBA_PRINCIPAL" (SENSOR vs ACTUADOR).
export type Operando = Literal | RefSensor | RefActuador;

export interface Comparacion {
  clase: "Comparacion";
  operador: OperadorRelacional;
  izquierda: RefSensor;
  derecha: Operando;
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

// Declaraciones explícitas de identificadores. El lenguaje escrito exige
// declarar cada SENSOR/ACTUADOR antes de usarlo (ver src/core/tablaSimbolos.ts);
// el AST guarda la línea de origen para poder señalar errores de identificador.
export interface DeclaracionSensor {
  clase: "DeclaracionSensor";
  id: string;
  linea?: number;
}

export interface DeclaracionActuador {
  clase: "DeclaracionActuador";
  id: string;
  linea?: number;
}

export type Declaracion = DeclaracionSensor | DeclaracionActuador;

export interface Programa {
  cultivo: string; // id de DefinicionCultivo
  cultivoLinea?: number;
  declaraciones: Declaracion[];
  reglas: Regla[];
}

// --- Constructores de conveniencia, usados por las 3 propuestas ---

export function refSensor(sensor: string): RefSensor {
  return { clase: "RefSensor", sensor };
}

export function refActuador(actuador: string): RefActuador {
  return { clase: "RefActuador", actuador };
}

export function declaracionSensor(id: string, linea?: number): DeclaracionSensor {
  return { clase: "DeclaracionSensor", id, linea };
}

export function declaracionActuador(id: string, linea?: number): DeclaracionActuador {
  return { clase: "DeclaracionActuador", id, linea };
}

// Deriva las declaraciones SENSOR/ACTUADOR a partir de los identificadores
// realmente usados en las reglas. La usan tanto recetas.ts (que no las declara
// a mano) como lenguaje.ts (para emitir un texto que el parser pueda releer).
export function declaracionesUsadas(reglas: Regla[]): Declaracion[] {
  const sensores = new Set<string>();
  const actuadores = new Set<string>();

  const visitarExpr = (e: Expr) => {
    if (e.clase === "Comparacion") {
      sensores.add(e.izquierda.sensor);
      if (e.derecha.clase === "RefSensor") sensores.add(e.derecha.sensor);
      if (e.derecha.clase === "RefActuador") actuadores.add(e.derecha.actuador);
    } else {
      visitarExpr(e.izquierda);
      visitarExpr(e.derecha);
    }
  };
  for (const regla of reglas) {
    visitarExpr(regla.condicion);
    for (const accion of regla.acciones) {
      if (accion.clase === "AccionEstado") actuadores.add(accion.actuador);
    }
  }

  return [
    ...[...sensores].map((id) => declaracionSensor(id)),
    ...[...actuadores].map((id) => declaracionActuador(id)),
  ];
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
