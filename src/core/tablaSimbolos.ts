// Tabla de símbolos: valida las declaraciones (SENSOR/ACTUADOR/CULTIVO) del
// programa y resuelve en qué rol se usa cada identificador dentro de las
// reglas. Reúne las "5 reglas relacionadas con la declaración o utilización
// de identificadores" que pide la Actividad 5 (aquí hay 6, ver tabla abajo).
import type { Declaracion, Expr, Programa, Sentencia } from "./ast.ts";
import { buscarActuador, buscarCultivo, buscarSensor } from "./tipos.ts";
import { errorSemantico, type CategoriaError, type ErrorSemantico } from "./errores.ts";

export interface ReglaIdentificador {
  id: string; // I1..I6, como en el documento "Actividad 5"
  nombre: string;
  categoria: CategoriaError;
  descripcion: string;
}

// Reglas de declaración/uso de identificadores, como tabla de datos — igual
// que MATRIZ_TIPOS en analizadorTipos.ts — para que la UI (pestaña Evidencia)
// las liste desde una única fuente de verdad en vez de repetirlas en un
// comentario. Los id/categoria de aquí son los que usan las llamadas a
// errorSemantico() más abajo en este mismo archivo.
export const REGLAS_IDENTIFICADORES: ReglaIdentificador[] = [
  { id: "I1", nombre: "Identificador no declarado", categoria: "IDENTIFICADOR_NO_DECLARADO", descripcion: "Un SENSOR/ACTUADOR se usa en una regla sin haber sido declarado antes." },
  { id: "I2", nombre: "Identificador redeclarado", categoria: "IDENTIFICADOR_REDECLARADO", descripcion: "El mismo identificador se declara dos veces." },
  { id: "I3", nombre: "Identificador fuera de catálogo", categoria: "IDENTIFICADOR_NO_DECLARADO", descripcion: "Se declara un SENSOR/ACTUADOR que no existe en el catálogo del dispositivo (tipos.ts)." },
  { id: "I4", nombre: "Uso en rol incorrecto", categoria: "USO_INCORRECTO_DE_IDENTIFICADOR", descripcion: "Un identificador declarado como SENSOR se usa como ACTUADOR, o viceversa." },
  { id: "I5", nombre: "Cultivo inexistente", categoria: "IDENTIFICADOR_NO_DECLARADO", descripcion: "El CULTIVO del programa no existe en el catálogo de cultivos." },
  { id: "I6", nombre: "Identificador declarado sin usar", categoria: "ADVERTENCIA", descripcion: "Un SENSOR/ACTUADOR se declara pero ninguna regla lo usa (no bloquea el C++)." },
];

// Arma el ErrorSemantico de una fila de REGLAS_IDENTIFICADORES, para que la
// categoría nunca pueda quedar desincronizada del id (I1..I6) que se muestra.
function errorIdentificador(id: string, mensaje: string, linea?: number): ErrorSemantico {
  const fila = REGLAS_IDENTIFICADORES.find((r) => r.id === id);
  return errorSemantico(fila?.categoria ?? "REGLA_MAL_FORMADA", id, mensaje, linea);
}

export type RolSimbolo = "SENSOR" | "ACTUADOR";

export interface Simbolo {
  id: string;
  rol: RolSimbolo;
  linea?: number;
  usado: boolean;
}

export interface TablaSimbolos {
  simbolos: Map<string, Simbolo>;
  errores: ErrorSemantico[];
}

// I1: uso de identificador no declarado en el programa.
// I2: redeclaración del mismo identificador.
// I3: identificador declarado que no existe en el catálogo de tipos.ts.
// I4: identificador usado en un rol distinto al declarado (SENSOR <-> ACTUADOR).
// I5: CULTIVO declarado una única vez y existente en el catálogo.
// I6: identificador declarado y nunca usado (advertencia, no bloquea el C++).
export function construirTablaSimbolos(programa: Programa): TablaSimbolos {
  const simbolos = new Map<string, Simbolo>();
  const errores: ErrorSemantico[] = [];

  for (const decl of programa.declaraciones) {
    registrarDeclaracion(decl, simbolos, errores);
  }

  verificarCultivo(programa, errores);
  verificarUsos(programa, simbolos, errores);
  verificarNoUsados(simbolos, errores);

  return { simbolos, errores };
}

function registrarDeclaracion(decl: Declaracion, simbolos: Map<string, Simbolo>, errores: ErrorSemantico[]) {
  const rol: RolSimbolo = decl.clase === "DeclaracionSensor" ? "SENSOR" : "ACTUADOR";

  // I2: redeclaración.
  if (simbolos.has(decl.id)) {
    errores.push(errorIdentificador("I2", `"${decl.id}" ya fue declarado antes; no se puede declarar dos veces.`, decl.linea));
    return;
  }

  // I3: el identificador declarado debe existir en el catálogo de tipos.ts
  // (que sigue siendo la fuente de verdad de pines/unidades — ver CLAUDE.md).
  const existeEnCatalogo = rol === "SENSOR" ? buscarSensor(decl.id) : buscarActuador(decl.id);
  if (!existeEnCatalogo) {
    errores.push(
      errorIdentificador(
        "I3",
        `"${decl.id}" no existe en el catálogo de ${rol === "SENSOR" ? "sensores" : "actuadores"} del dispositivo.`,
        decl.linea
      )
    );
    return;
  }

  simbolos.set(decl.id, { id: decl.id, rol, linea: decl.linea, usado: false });
}

function verificarCultivo(programa: Programa, errores: ErrorSemantico[]) {
  // I5: CULTIVO debe existir en el catálogo de tipos.ts.
  if (!buscarCultivo(programa.cultivo)) {
    errores.push(
      errorIdentificador("I5", `El cultivo "${programa.cultivo}" no existe en el catálogo de cultivos.`, programa.cultivoLinea)
    );
  }
}

// rolEsperado es opcional: el lado izquierdo de una comparación y el
// argumento de ENCENDER/APAGAR tienen un rol inequívoco por gramática (I4 se
// aplica ahí). El lado derecho de una comparación es ambiguo — puede ser otro
// SENSOR o, por error, un ACTUADOR — y ese caso lo resuelve exclusivamente el
// analizador de tipos (T6/T9), para no reportar dos veces el mismo error con
// categorías distintas (I4 e IDENTIFICADOR_NO_DECLARADO/TIPO_INCOMPATIBLE).
function marcarUso(
  id: string,
  rolEsperado: RolSimbolo | undefined,
  linea: number | undefined,
  simbolos: Map<string, Simbolo>,
  errores: ErrorSemantico[]
) {
  const simbolo = simbolos.get(id);
  // I1: uso de identificador no declarado.
  if (!simbolo) {
    errores.push(errorIdentificador("I1", `"${id}" se usa pero nunca fue declarado con SENSOR/ACTUADOR.`, linea));
    return;
  }
  simbolo.usado = true;
  // I4: identificador usado en un rol distinto al que fue declarado.
  if (rolEsperado && simbolo.rol !== rolEsperado) {
    errores.push(
      errorIdentificador("I4", `"${id}" fue declarado como ${simbolo.rol} pero se usa como ${rolEsperado}.`, linea)
    );
  }
}

function verificarUsos(programa: Programa, simbolos: Map<string, Simbolo>, errores: ErrorSemantico[]) {
  const visitarExpr = (e: Expr) => {
    if (e.clase === "Comparacion") {
      marcarUso(e.izquierda.sensor, "SENSOR", undefined, simbolos, errores);
      // Rol ambiguo a propósito (ver marcarUso): solo se valida que exista (I1).
      if (e.derecha.clase === "RefSensor") marcarUso(e.derecha.sensor, undefined, undefined, simbolos, errores);
      if (e.derecha.clase === "RefActuador") marcarUso(e.derecha.actuador, undefined, undefined, simbolos, errores);
    } else {
      visitarExpr(e.izquierda);
      visitarExpr(e.derecha);
    }
  };
  const visitarSentencia = (s: Sentencia) => {
    if (s.clase === "AccionEstado") marcarUso(s.actuador, "ACTUADOR", undefined, simbolos, errores);
  };

  for (const regla of programa.reglas) {
    visitarExpr(regla.condicion);
    regla.acciones.forEach(visitarSentencia);
  }
}

function verificarNoUsados(simbolos: Map<string, Simbolo>, errores: ErrorSemantico[]) {
  // I6: advertencia, no bloquea la generación de C++.
  for (const simbolo of simbolos.values()) {
    if (!simbolo.usado) {
      errores.push(errorIdentificador("I6", `"${simbolo.id}" está declarado pero ninguna regla lo usa.`, simbolo.linea));
    }
  }
}
