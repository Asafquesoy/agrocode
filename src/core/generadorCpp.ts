// AST -> sketch .ino para ESP32 (Arduino framework).
// Solo se invoca sobre programas que ya pasaron verificarPrograma() sin errores.
import type { Expr, Programa, Regla, Sentencia } from "./ast";
import { ACTUADORES, buscarActuador, buscarCultivo, buscarSensor, SENSORES } from "./tipos";
import { programaValido, verificarPrograma } from "./analizadorTipos";

function pinesUsados(programa: Programa) {
  const sensoresUsados = new Set<string>();
  const actuadoresUsados = new Set<string>();

  const visitarExpr = (e: Expr) => {
    if (e.clase === "Comparacion") sensoresUsados.add(e.izquierda.sensor);
    else {
      visitarExpr(e.izquierda);
      visitarExpr(e.derecha);
    }
  };
  const visitarSentencia = (s: Sentencia) => {
    if (s.clase === "AccionEstado") actuadoresUsados.add(s.actuador);
  };

  for (const regla of programa.reglas) {
    visitarExpr(regla.condicion);
    regla.acciones.forEach(visitarSentencia);
  }

  return {
    sensores: SENSORES.filter((s) => sensoresUsados.has(s.id)),
    actuadores: ACTUADORES.filter((a) => actuadoresUsados.has(a.id)),
  };
}

function operadorCpp(op: string): string {
  switch (op) {
    case "=":
      return "==";
    case "<=":
      return "<=";
    case ">=":
      return ">=";
    default:
      return op;
  }
}

function exprACpp(nodo: Expr): string {
  if (nodo.clase === "Comparacion") {
    const sensor = buscarSensor(nodo.izquierda.sensor);
    const variable = `lectura_${sensor?.id ?? nodo.izquierda.sensor}`;
    return `${variable} ${operadorCpp(nodo.operador)} ${nodo.derecha.valor}`;
  }
  const op = nodo.operador === "Y" ? "&&" : "||";
  return `(${exprACpp(nodo.izquierda)}) ${op} (${exprACpp(nodo.derecha)})`;
}

function sentenciaACpp(nodo: Sentencia): string {
  if (nodo.clase === "AccionEstado") {
    const actuador = buscarActuador(nodo.actuador);
    const estado = nodo.accion === "ENCENDER" ? "HIGH" : "LOW";
    return `digitalWrite(PIN_${actuador?.id ?? nodo.actuador}, ${estado});`;
  }
  return `delay(${nodo.segundos * 1000}); // ESPERAR ${nodo.segundos} s`;
}

function reglaACpp(regla: Regla): string {
  const condicion = exprACpp(regla.condicion);
  const cuerpo = regla.acciones.map((s) => `    ${sentenciaACpp(s)}`).join("\n");
  const comentarioHorario = regla.restriccionHoraria
    ? ` // válida entre ${regla.restriccionHoraria.desde} y ${regla.restriccionHoraria.hasta}`
    : "";
  return `  // Regla: ${regla.nombre}${comentarioHorario}\n  if (${condicion}) {\n${cuerpo}\n  }`;
}

export function generarCpp(programa: Programa): string {
  const resultados = verificarPrograma(programa);
  if (!programaValido(programa)) {
    const detalle = resultados
      .filter((r) => r.errores.length > 0)
      .map((r) => `  - ${r.reglaId}: ${r.errores.join("; ")}`)
      .join("\n");
    throw new Error(`No se puede generar código: hay errores de tipos.\n${detalle}`);
  }

  const cultivo = buscarCultivo(programa.cultivo);
  const { sensores, actuadores } = pinesUsados(programa);

  const defsPines = [
    ...sensores.map((s) => `#define PIN_${s.id} ${s.pin}`),
    ...actuadores.map((a) => `#define PIN_${a.id} ${a.pin}`),
  ].join("\n");

  const setupActuadores = actuadores.map((a) => `  pinMode(PIN_${a.id}, OUTPUT);`).join("\n");
  const setupSensores = sensores
    .map((s) => (s.modo === "ANALOGICO" ? `  pinMode(PIN_${s.id}, INPUT);` : `  // ${s.id}: inicializar sensor I2C`))
    .join("\n");

  const lecturas = sensores
    .map((s) =>
      s.modo === "ANALOGICO"
        ? `  int lectura_${s.id} = map(analogRead(PIN_${s.id}), 0, 4095, 0, 100); // ${s.etiqueta} en ${s.unidad || "%"}`
        : `  int lectura_${s.id} = leer_${s.id}(); // ${s.etiqueta} — implementar lectura I2C`
    )
    .join("\n");

  const reglas = programa.reglas.map(reglaACpp).join("\n\n");

  return `// Generado por Agrocode a partir de las reglas del agricultor.
// Cultivo: ${cultivo?.etiqueta ?? programa.cultivo}
// NO editar a mano: los cambios se pierden al recompilar desde la app.

${defsPines}

void setup() {
  Serial.begin(115200);
${setupActuadores}
${setupSensores}
}

void loop() {
${lecturas}

${reglas}

  delay(1000); // ciclo de evaluación
}
`;
}
