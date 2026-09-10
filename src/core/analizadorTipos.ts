// Analizador semántico: aplica la matriz de tipos de la Actividad 5.
// La matriz se representa como tabla de datos (no como ifs anidados) para que
// quede clara la trazabilidad con el documento entregado.
import type { AccionEstado, AccionTiempo, Comparacion, Expr, Logica, Programa, Regla, Sentencia } from "./ast";
import { buscarActuador, buscarSensor, type TipoDato } from "./tipos";

export interface ReglaTipo {
  tipo1: TipoDato;
  operador: string;
  tipo2: TipoDato;
  resultado: TipoDato | "EJECUCION" | "PAUSA";
}

// Matriz de la Actividad 5 — Sección 3.
export const MATRIZ_TIPOS: ReglaTipo[] = [
  { tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "ENTERO", resultado: "BOOLEANO" },
  { tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "DECIMAL", resultado: "BOOLEANO" },
  { tipo1: "BOOLEANO", operador: "lógico (Y, O)", tipo2: "BOOLEANO", resultado: "BOOLEANO" },
  { tipo1: "ACCION_ESTADO", operador: "aplicación", tipo2: "ACTUADOR", resultado: "EJECUCION" },
  { tipo1: "ACCION_TIEMPO", operador: "aplicación", tipo2: "ENTERO", resultado: "PAUSA" },
  { tipo1: "ENTERO", operador: "aritmético (+,-,*,/)", tipo2: "ENTERO", resultado: "ENTERO" },
  { tipo1: "DECIMAL", operador: "aritmético (+,-,*,/)", tipo2: "ENTERO", resultado: "DECIMAL" },
  { tipo1: "DECIMAL", operador: "aritmético (+,-,*,/)", tipo2: "DECIMAL", resultado: "DECIMAL" },
];

export class ErrorTipos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorTipos";
  }
}

export type ResultadoAnalisis =
  | { ok: true; tipo: TipoDato | "EJECUCION" | "PAUSA" }
  | { ok: false; error: string };

function verificarComparacion(nodo: Comparacion): ResultadoAnalisis {
  const sensor = buscarSensor(nodo.izquierda.sensor);
  if (!sensor) {
    return { ok: false, error: `El sensor "${nodo.izquierda.sensor}" no existe en el catálogo.` };
  }
  const regla = MATRIZ_TIPOS.find((r) => r.tipo1 === "SENSOR" && r.tipo2 === nodo.derecha.tipo);
  if (!regla) {
    return {
      ok: false,
      error: `No se puede comparar ${sensor.etiqueta} (SENSOR) con un valor de tipo ${nodo.derecha.tipo}.`,
    };
  }
  return { ok: true, tipo: "BOOLEANO" };
}

function verificarLogica(nodo: Logica): ResultadoAnalisis {
  const izq = verificarExpr(nodo.izquierda);
  if (!izq.ok) return izq;
  const der = verificarExpr(nodo.derecha);
  if (!der.ok) return der;
  const regla = MATRIZ_TIPOS.find(
    (r) => r.tipo1 === "BOOLEANO" && r.tipo2 === "BOOLEANO" && r.operador.startsWith("lógico")
  );
  if (!regla || izq.tipo !== "BOOLEANO" || der.tipo !== "BOOLEANO") {
    return { ok: false, error: `El operador "${nodo.operador}" solo puede unir dos condiciones (BOOLEANO Y/O BOOLEANO).` };
  }
  return { ok: true, tipo: "BOOLEANO" };
}

export function verificarExpr(nodo: Expr): ResultadoAnalisis {
  if (nodo.clase === "Comparacion") return verificarComparacion(nodo);
  return verificarLogica(nodo);
}

function verificarAccionEstado(nodo: AccionEstado): ResultadoAnalisis {
  const actuador = buscarActuador(nodo.actuador);
  if (!actuador) {
    return {
      ok: false,
      error: `"${nodo.accion}" exige un ACTUADOR válido, pero "${nodo.actuador}" no existe. (Ej. inválido: ENCENDER 45)`,
    };
  }
  return { ok: true, tipo: "EJECUCION" };
}

function verificarAccionTiempo(nodo: AccionTiempo): ResultadoAnalisis {
  if (!Number.isFinite(nodo.segundos) || nodo.segundos <= 0) {
    return {
      ok: false,
      error: `"ESPERAR" exige un ENTERO positivo de segundos. (Ej. inválido: ESPERAR BOMBA_PRINCIPAL)`,
    };
  }
  return { ok: true, tipo: "PAUSA" };
}

export function verificarSentencia(nodo: Sentencia): ResultadoAnalisis {
  if (nodo.clase === "AccionEstado") return verificarAccionEstado(nodo);
  return verificarAccionTiempo(nodo);
}

export interface ResultadoReglaAnalisis {
  reglaId: string;
  errores: string[];
}

export function verificarRegla(regla: Regla): ResultadoReglaAnalisis {
  const errores: string[] = [];

  const condicion = verificarExpr(regla.condicion);
  if (!condicion.ok) errores.push(condicion.error);
  else if (condicion.tipo !== "BOOLEANO") {
    errores.push(`La condición de "${regla.nombre}" debe evaluar a BOOLEANO.`);
  }

  if (regla.acciones.length === 0) {
    errores.push(`La regla "${regla.nombre}" no tiene ninguna acción.`);
  }
  for (const accion of regla.acciones) {
    const r = verificarSentencia(accion);
    if (!r.ok) errores.push(r.error);
  }

  return { reglaId: regla.id, errores };
}

export function verificarPrograma(programa: Programa): ResultadoReglaAnalisis[] {
  return programa.reglas.map(verificarRegla);
}

export function programaValido(programa: Programa): boolean {
  return verificarPrograma(programa).every((r) => r.errores.length === 0);
}
