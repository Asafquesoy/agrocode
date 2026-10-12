// Generación de código intermedio: AST (ya verificado) -> cuádruplos.
//
// Un cuádruplo es (operación, arg1, arg2, resultado). Es la representación
// lineal que queda entre el análisis semántico y el código final: el
// generador de C++ (generadorCpp.ts) solo lee esta lista, nunca el AST.
//
// Cada regla del agricultor se traduce a un bloque con esta forma:
//   <cálculo de la condición en temporales t1, t2, ...>
//   SALTARF tN, Lk     (si la condición es falsa, salta al final de la regla)
//   <acciones: ENCENDER / APAGAR / ESPERAR>
//   ETIQUETA Lk
import type { Expr, Programa, RestriccionHoraria, Sentencia } from "./ast.ts";
import { programaValido, verificarPrograma } from "./analizadorTipos.ts";
import { SENSORES } from "./tipos.ts";

export type OperacionIR =
  | "LEER"
  | "<"
  | ">"
  | "="
  | "<="
  | ">="
  | "Y"
  | "O"
  | "SALTARF"
  | "ENCENDER"
  | "APAGAR"
  | "ESPERAR"
  | "ETIQUETA";

export interface Cuadruplo {
  indice: number;
  op: OperacionIR;
  arg1: string | null;
  arg2: string | null;
  resultado: string | null;
}

// Rango [desde, hasta] (índices inclusivos de `cuadruplos`) que ocupa una regla.
export interface BloqueReglaIR {
  id: string;
  nombre: string;
  restriccionHoraria?: RestriccionHoraria;
  desde: number;
  hasta: number;
}

export interface ProgramaIR {
  cultivo: string;
  cuadruplos: Cuadruplo[];
  reglas: BloqueReglaIR[];
}

function sensoresUsados(programa: Programa): Set<string> {
  const usados = new Set<string>();
  const visitar = (e: Expr) => {
    if (e.clase === "Comparacion") {
      usados.add(e.izquierda.sensor);
      if (e.derecha.clase === "RefSensor") usados.add(e.derecha.sensor);
    } else {
      visitar(e.izquierda);
      visitar(e.derecha);
    }
  };
  for (const regla of programa.reglas) visitar(regla.condicion);
  return usados;
}

export function generarCodigoIntermedio(programa: Programa): ProgramaIR {
  // Gate semántico: nunca se genera código intermedio de un programa inválido.
  if (!programaValido(programa)) {
    const detalle = verificarPrograma(programa)
      .filter((r) => r.errores.length > 0)
      .map((r) => `  - ${r.reglaId}: ${r.errores.map((e) => `[${e.regla}] ${e.mensaje}`).join("; ")}`)
      .join("\n");
    throw new Error(`No se puede generar código: hay errores de tipos.\n${detalle}`);
  }

  const cuadruplos: Cuadruplo[] = [];
  const bloques: BloqueReglaIR[] = [];
  let contadorTemporal = 0;
  let contadorEtiqueta = 0;

  const emitir = (op: OperacionIR, arg1: string | null, arg2: string | null, resultado: string | null) => {
    cuadruplos.push({ indice: cuadruplos.length, op, arg1, arg2, resultado });
  };

  // Postorden: emite los hijos y devuelve el temporal que guarda el resultado.
  const emitirExpr = (e: Expr): string => {
    if (e.clase === "Comparacion") {
      // El gate garantiza SENSOR vs número; el throw cubre un AST armado a mano.
      if (e.derecha.clase !== "Literal") {
        throw new Error(`Comparación no soportada: ${e.izquierda.sensor} contra un identificador, no un número.`);
      }
      const temporal = `t${++contadorTemporal}`;
      emitir(e.operador, e.izquierda.sensor, String(e.derecha.valor), temporal);
      return temporal;
    }
    const izq = emitirExpr(e.izquierda);
    const der = emitirExpr(e.derecha);
    const temporal = `t${++contadorTemporal}`;
    emitir(e.operador, izq, der, temporal);
    return temporal;
  };

  const emitirSentencia = (s: Sentencia) => {
    if (s.clase === "AccionEstado") emitir(s.accion, s.actuador, null, null);
    else emitir("ESPERAR", String(s.segundos), null, null);
  };

  // Una lectura por sensor usado, en el orden del catálogo (determinista).
  const usados = sensoresUsados(programa);
  for (const sensor of SENSORES) {
    if (usados.has(sensor.id)) emitir("LEER", sensor.id, null, sensor.id);
  }

  for (const regla of programa.reglas) {
    const desde = cuadruplos.length;
    const etiqueta = `L${++contadorEtiqueta}`;
    const condicion = emitirExpr(regla.condicion);
    emitir("SALTARF", condicion, null, etiqueta);
    regla.acciones.forEach(emitirSentencia);
    emitir("ETIQUETA", null, null, etiqueta);
    bloques.push({
      id: regla.id,
      nombre: regla.nombre,
      restriccionHoraria: regla.restriccionHoraria,
      desde,
      hasta: cuadruplos.length - 1,
    });
  }

  return { cultivo: programa.cultivo, cuadruplos, reglas: bloques };
}

function celda(valor: string | null): string {
  return valor ?? "-";
}

export function cuadruploATexto(c: Cuadruplo): string {
  return `(${c.op}, ${celda(c.arg1)}, ${celda(c.arg2)}, ${celda(c.resultado)})`;
}

export function codigoIntermedioATexto(ir: ProgramaIR): string {
  const lineas: string[] = [`// Cultivo: ${ir.cultivo}`];
  const inicioPrimeraRegla = ir.reglas.length > 0 ? ir.reglas[0].desde : ir.cuadruplos.length;
  const ancho = String(ir.cuadruplos.length).length;
  const fila = (c: Cuadruplo) => `${String(c.indice).padStart(ancho, " ")}: ${cuadruploATexto(c)}`;

  ir.cuadruplos.slice(0, inicioPrimeraRegla).forEach((c) => lineas.push(fila(c)));
  for (const bloque of ir.reglas) {
    const horario = bloque.restriccionHoraria
      ? ` (${bloque.restriccionHoraria.desde}-${bloque.restriccionHoraria.hasta})`
      : "";
    lineas.push(`// Regla: ${bloque.nombre}${horario}`);
    ir.cuadruplos.slice(bloque.desde, bloque.hasta + 1).forEach((c) => lineas.push(fila(c)));
  }
  return lineas.join("\n");
}
