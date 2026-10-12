// Código intermedio (cuádruplos) -> sketch .ino para ESP32 (Arduino framework).
// El generador no lee el AST: solo traduce la lista de cuádruplos que produce
// codigoIntermedio.ts, que ya pasó por el gate semántico.
import type { Programa } from "./ast.ts";
import { generarCodigoIntermedio, type BloqueReglaIR, type Cuadruplo, type ProgramaIR } from "./codigoIntermedio.ts";
import { buscarActuador, buscarCultivo, buscarSensor } from "./tipos.ts";

function operadorCpp(op: string): string {
  return op === "=" ? "==" : op;
}

function instruccionACpp(c: Cuadruplo): string {
  switch (c.op) {
    case "<":
    case ">":
    case "=":
    case "<=":
    case ">=":
      return `  bool ${c.resultado} = lectura_${c.arg1} ${operadorCpp(c.op)} ${c.arg2};`;
    case "Y":
      return `  bool ${c.resultado} = ${c.arg1} && ${c.arg2};`;
    case "O":
      return `  bool ${c.resultado} = ${c.arg1} || ${c.arg2};`;
    case "SALTARF":
      // Cada regla es un único SALTARF/ETIQUETA bien anidado: se emite como if.
      return `  if (${c.arg1}) {`;
    case "ENCENDER":
      return `    digitalWrite(PIN_${c.arg1}, HIGH);`;
    case "APAGAR":
      return `    digitalWrite(PIN_${c.arg1}, LOW);`;
    case "ESPERAR":
      return `    delay(${Number(c.arg1) * 1000}); // ESPERAR ${c.arg1} s`;
    case "ETIQUETA":
      return `  }`;
    case "LEER":
      throw new Error("LEER solo aparece antes de la primera regla.");
  }
}

function reglaACpp(ir: ProgramaIR, bloque: BloqueReglaIR): string {
  const comentarioHorario = bloque.restriccionHoraria
    ? ` // válida entre ${bloque.restriccionHoraria.desde} y ${bloque.restriccionHoraria.hasta}`
    : "";
  const cuerpo = ir.cuadruplos
    .slice(bloque.desde, bloque.hasta + 1)
    .map(instruccionACpp)
    .join("\n");
  return `  // Regla: ${bloque.nombre}${comentarioHorario}\n${cuerpo}`;
}

export function irACpp(ir: ProgramaIR): string {
  const sensores = ir.cuadruplos
    .filter((c) => c.op === "LEER")
    .map((c) => buscarSensor(c.arg1 ?? ""))
    .filter((s) => s !== undefined);

  const idsActuadores: string[] = [];
  for (const c of ir.cuadruplos) {
    if ((c.op === "ENCENDER" || c.op === "APAGAR") && c.arg1 && !idsActuadores.includes(c.arg1)) {
      idsActuadores.push(c.arg1);
    }
  }
  const actuadores = idsActuadores.map((id) => buscarActuador(id)).filter((a) => a !== undefined);

  const cultivo = buscarCultivo(ir.cultivo);

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

  const reglas = ir.reglas.map((b) => reglaACpp(ir, b)).join("\n\n");

  return `// Generado por Agrocode a partir de las reglas del agricultor.
// Cultivo: ${cultivo?.etiqueta ?? ir.cultivo}
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

// Lanza excepción si el programa tiene errores bloqueantes (el gate está en
// generarCodigoIntermedio): nunca se genera C++ de un programa inválido.
export function generarCpp(programa: Programa): string {
  return irACpp(generarCodigoIntermedio(programa));
}
