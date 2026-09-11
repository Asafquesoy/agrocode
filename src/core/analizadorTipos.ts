// Analizador semántico: aplica la matriz de tipos de la Actividad 5 y la
// tabla de símbolos (src/core/tablaSimbolos.ts) sobre el AST que produce el
// parser (src/core/parser.ts) o los constructores de conveniencia (ast.ts).
// La matriz se representa como tabla de datos (no como ifs anidados) para que
// quede clara la trazabilidad con el documento entregado.
import type { AccionEstado, AccionTiempo, Comparacion, Expr, Logica, Operando, Programa, Regla, Sentencia } from "./ast.ts";
import type { TipoDato } from "./tipos.ts";
import { errorSemantico, esBloqueante, type ErrorSemantico } from "./errores.ts";
import { construirTablaSimbolos, type TablaSimbolos } from "./tablaSimbolos.ts";

export interface ReglaTipo {
  id: string; // T1..T9, como en el documento "Actividad 5"
  tipo1: TipoDato;
  operador: string;
  tipo2: TipoDato;
  resultado: TipoDato | "EJECUCION" | "PAUSA" | "ERROR";
}

// Matriz de la Actividad 5 — Sección 3.
// T1-T5: combinaciones válidas (mínimo pedido: 5 reglas de comprobación de tipos).
// T6-T9: combinaciones inválidas, explícitas como filas de error — así cada
// rechazo del analizador cita la fila exacta que violó, igual que un válido.
export const MATRIZ_TIPOS: ReglaTipo[] = [
  { id: "T1", tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "ENTERO", resultado: "BOOLEANO" },
  { id: "T2", tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "DECIMAL", resultado: "BOOLEANO" },
  { id: "T3", tipo1: "BOOLEANO", operador: "lógico (Y, O)", tipo2: "BOOLEANO", resultado: "BOOLEANO" },
  { id: "T4", tipo1: "ACCION_ESTADO", operador: "aplicación", tipo2: "ACTUADOR", resultado: "EJECUCION" },
  { id: "T5", tipo1: "ACCION_TIEMPO", operador: "aplicación", tipo2: "ENTERO", resultado: "PAUSA" },
  { id: "T6", tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "ACTUADOR", resultado: "ERROR" },
  { id: "T7", tipo1: "ACCION_TIEMPO", operador: "aplicación", tipo2: "DECIMAL", resultado: "ERROR" },
  { id: "T8", tipo1: "ACCION_ESTADO", operador: "aplicación", tipo2: "SENSOR", resultado: "ERROR" },
  { id: "T9", tipo1: "SENSOR", operador: "relacional (<,>,=,<=,>=)", tipo2: "SENSOR", resultado: "ERROR" },
];

function buscarFila(tipo1: TipoDato, esRelacional: boolean, tipo2: TipoDato): ReglaTipo | undefined {
  return MATRIZ_TIPOS.find(
    (r) => r.tipo1 === tipo1 && r.tipo2 === tipo2 && (esRelacional ? r.operador.startsWith("relacional") : true)
  );
}

export type ResultadoAnalisis =
  | { ok: true; tipo: TipoDato | "EJECUCION" | "PAUSA"; regla: string }
  | { ok: false; error: ErrorSemantico };

// El lado derecho de una comparación puede ser un Literal, o una referencia a
// otro identificador cuyo rol real (SENSOR/ACTUADOR) solo se conoce a través
// de la tabla de símbolos — así se detecta "HUMEDAD_SUELO < BOMBA_PRINCIPAL"
// (T6) sin que el parser tenga que adivinar el rol de antemano.
function tipoDeOperando(nodo: Operando, tabla: TablaSimbolos): TipoDato {
  if (nodo.clase === "Literal") return nodo.tipo;
  if (nodo.clase === "RefActuador") return "ACTUADOR";
  const simbolo = tabla.simbolos.get(nodo.sensor);
  // Si no está en la tabla, tablaSimbolos ya reportó IDENTIFICADOR_NO_DECLARADO (I1);
  // aquí se asume SENSOR para no generar un segundo error redundante.
  return simbolo?.rol ?? "SENSOR";
}

function verificarComparacion(nodo: Comparacion, tabla: TablaSimbolos): ResultadoAnalisis {
  const simboloIzq = tabla.simbolos.get(nodo.izquierda.sensor);
  const tipo1: TipoDato = simboloIzq?.rol ?? "SENSOR";
  const tipo2 = tipoDeOperando(nodo.derecha, tabla);

  const fila = buscarFila(tipo1, true, tipo2);
  if (!fila || fila.resultado === "ERROR") {
    const etiquetaDerecha = nodo.derecha.clase === "Literal" ? `${nodo.derecha.valor} (${tipo2})` : `${tipoEtiqueta(nodo.derecha)} (${tipo2})`;
    return {
      ok: false,
      error: errorSemantico(
        "TIPO_INCOMPATIBLE",
        fila?.id ?? "T1/T2",
        `No es posible comparar "${nodo.izquierda.sensor}" (${tipo1}) con ${etiquetaDerecha}.`
      ),
    };
  }
  return { ok: true, tipo: "BOOLEANO", regla: fila.id };
}

function tipoEtiqueta(nodo: Operando): string {
  if (nodo.clase === "RefSensor") return nodo.sensor;
  if (nodo.clase === "RefActuador") return nodo.actuador;
  return `${nodo.valor}`;
}

function verificarLogica(nodo: Logica, tabla: TablaSimbolos): ResultadoAnalisis {
  const izq = verificarExpr(nodo.izquierda, tabla);
  if (!izq.ok) return izq;
  const der = verificarExpr(nodo.derecha, tabla);
  if (!der.ok) return der;

  const fila = buscarFila("BOOLEANO", false, "BOOLEANO");
  if (!fila || izq.tipo !== "BOOLEANO" || der.tipo !== "BOOLEANO") {
    return {
      ok: false,
      error: errorSemantico(
        "TIPO_INCOMPATIBLE",
        "T3",
        `El operador lógico "${nodo.operador}" solo puede unir dos condiciones BOOLEANAS.`
      ),
    };
  }
  return { ok: true, tipo: "BOOLEANO", regla: fila.id };
}

export function verificarExpr(nodo: Expr, tabla: TablaSimbolos): ResultadoAnalisis {
  if (nodo.clase === "Comparacion") return verificarComparacion(nodo, tabla);
  return verificarLogica(nodo, tabla);
}

function verificarAccionEstado(nodo: AccionEstado, tabla: TablaSimbolos): ResultadoAnalisis {
  const simbolo = tabla.simbolos.get(nodo.actuador);
  const tipo2: TipoDato = simbolo?.rol ?? "ACTUADOR";
  const fila = buscarFila("ACCION_ESTADO", false, tipo2);
  if (!fila || fila.resultado === "ERROR") {
    return {
      ok: false,
      error: errorSemantico(
        "TIPO_INCOMPATIBLE",
        fila?.id ?? "T4",
        `"${nodo.accion}" exige un ACTUADOR, pero "${nodo.actuador}" es de tipo ${tipo2}.`
      ),
    };
  }
  return { ok: true, tipo: "EJECUCION", regla: fila.id };
}

function verificarAccionTiempo(nodo: AccionTiempo): ResultadoAnalisis {
  if (!Number.isFinite(nodo.segundos) || nodo.segundos <= 0) {
    return {
      ok: false,
      error: errorSemantico(
        "REGLA_MAL_FORMADA",
        "T5",
        `"ESPERAR" exige un ENTERO positivo de segundos (se recibió ${nodo.segundos}).`
      ),
    };
  }
  if (!Number.isInteger(nodo.segundos)) {
    return {
      ok: false,
      error: errorSemantico(
        "TIPO_INCOMPATIBLE",
        "T7",
        `"ESPERAR" exige un ENTERO de segundos, pero ${nodo.segundos} es DECIMAL.`
      ),
    };
  }
  return { ok: true, tipo: "PAUSA", regla: "T5" };
}

export function verificarSentencia(nodo: Sentencia, tabla: TablaSimbolos): ResultadoAnalisis {
  if (nodo.clase === "AccionEstado") return verificarAccionEstado(nodo, tabla);
  return verificarAccionTiempo(nodo);
}

export interface ResultadoReglaAnalisis {
  reglaId: string;
  tipoInferido?: TipoDato | "EJECUCION" | "PAUSA";
  // Filas de MATRIZ_TIPOS que efectivamente se aplicaron (condición + cada
  // acción), en orden. Se acumulan también cuando el resultado es válido —
  // sin esto, un caso de prueba correcto no podría citar "regla aplicada:
  // T1", que es una columna obligatoria de la evidencia.
  reglasAplicadas: string[];
  errores: ErrorSemantico[];
}

export function verificarRegla(regla: Regla, tabla: TablaSimbolos): ResultadoReglaAnalisis {
  const errores: ErrorSemantico[] = [];
  const reglasAplicadas: string[] = [];
  let tipoInferido: ResultadoReglaAnalisis["tipoInferido"];

  const condicion = verificarExpr(regla.condicion, tabla);
  if (!condicion.ok) errores.push(condicion.error);
  else if (condicion.tipo !== "BOOLEANO") {
    errores.push(errorSemantico("REGLA_MAL_FORMADA", condicion.regla, `La condición de "${regla.nombre}" debe evaluar a BOOLEANO.`));
  } else {
    tipoInferido = condicion.tipo;
    reglasAplicadas.push(condicion.regla);
  }

  if (regla.acciones.length === 0) {
    errores.push(errorSemantico("REGLA_MAL_FORMADA", "-", `La regla "${regla.nombre}" no tiene ninguna acción.`));
  }
  for (const accion of regla.acciones) {
    const r = verificarSentencia(accion, tabla);
    if (!r.ok) errores.push(r.error);
    else reglasAplicadas.push(r.regla);
  }

  return { reglaId: regla.id, tipoInferido, reglasAplicadas, errores };
}

export function verificarPrograma(programa: Programa): ResultadoReglaAnalisis[] {
  const tabla = construirTablaSimbolos(programa);
  const resultados = programa.reglas.map((regla) => verificarRegla(regla, tabla));

  // Los errores de declaración (I1-I6) no pertenecen a ninguna regla puntual;
  // se listan aparte, bajo un "reglaId" fijo, para no perderlos.
  if (tabla.errores.length > 0) {
    resultados.unshift({ reglaId: "(declaraciones)", reglasAplicadas: [], errores: tabla.errores });
  }
  return resultados;
}

export function programaValido(programa: Programa): boolean {
  return verificarPrograma(programa).every((r) => r.errores.every((e) => !esBloqueante(e)));
}
