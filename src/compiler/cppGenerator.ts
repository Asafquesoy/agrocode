// Código intermedio (cuádruplos) -> sketch .ino para ESP32 (Arduino framework).
// El generador no lee el AST: solo traduce la lista de cuádruplos que produce
// intermediateCode.ts, que ya pasó por el gate semántico.
import type { Program } from "./ast.ts";
import { generateIntermediateCode, type IRProgram, type IRRuleBlock, type Quadruple } from "./intermediateCode.ts";
import { findActuator, findCrop, findSensor } from "./catalog.ts";

function cppOperator(op: string): string {
  return op === "=" ? "==" : op;
}

function quadrupleToCpp(q: Quadruple): string {
  switch (q.op) {
    case "<":
    case ">":
    case "=":
    case "<=":
    case ">=":
      return `  bool ${q.result} = lectura_${q.arg1} ${cppOperator(q.op)} ${q.arg2};`;
    case "Y":
      return `  bool ${q.result} = ${q.arg1} && ${q.arg2};`;
    case "O":
      return `  bool ${q.result} = ${q.arg1} || ${q.arg2};`;
    case "SALTARF":
      // Cada regla es un único SALTARF/ETIQUETA bien anidado: se emite como if.
      return `  if (${q.arg1}) {`;
    case "ENCENDER":
      return `    digitalWrite(PIN_${q.arg1}, HIGH);`;
    case "APAGAR":
      return `    digitalWrite(PIN_${q.arg1}, LOW);`;
    case "ESPERAR":
      return `    delay(${Number(q.arg1) * 1000}); // ESPERAR ${q.arg1} s`;
    case "ETIQUETA":
      return `  }`;
    case "LEER":
      throw new Error("LEER solo aparece antes de la primera regla.");
  }
}

function ruleToCpp(ir: IRProgram, block: IRRuleBlock): string {
  const windowComment = block.timeWindow
    ? ` // válida entre ${block.timeWindow.from} y ${block.timeWindow.to}`
    : "";
  const body = ir.quadruples
    .slice(block.from, block.to + 1)
    .map(quadrupleToCpp)
    .join("\n");
  return `  // Regla: ${block.name}${windowComment}\n${body}`;
}

export function irToCpp(ir: IRProgram): string {
  const sensors = ir.quadruples
    .filter((q) => q.op === "LEER")
    .map((q) => findSensor(q.arg1 ?? ""))
    .filter((s) => s !== undefined);

  const actuatorIds: string[] = [];
  for (const q of ir.quadruples) {
    if ((q.op === "ENCENDER" || q.op === "APAGAR") && q.arg1 && !actuatorIds.includes(q.arg1)) {
      actuatorIds.push(q.arg1);
    }
  }
  const actuators = actuatorIds.map((id) => findActuator(id)).filter((a) => a !== undefined);

  const crop = findCrop(ir.crop);

  const pinDefs = [
    ...sensors.map((s) => `#define PIN_${s.id} ${s.pin}`),
    ...actuators.map((a) => `#define PIN_${a.id} ${a.pin}`),
  ].join("\n");

  const actuatorSetup = actuators.map((a) => `  pinMode(PIN_${a.id}, OUTPUT);`).join("\n");
  const sensorSetup = sensors
    .map((s) => (s.mode === "ANALOG" ? `  pinMode(PIN_${s.id}, INPUT);` : `  // ${s.id}: inicializar sensor I2C`))
    .join("\n");

  const readings = sensors
    .map((s) =>
      s.mode === "ANALOG"
        ? `  int lectura_${s.id} = map(analogRead(PIN_${s.id}), 0, 4095, 0, 100); // ${s.label} en ${s.unit || "%"}`
        : `  int lectura_${s.id} = leer_${s.id}(); // ${s.label} — implementar lectura I2C`
    )
    .join("\n");

  const rules = ir.rules.map((b) => ruleToCpp(ir, b)).join("\n\n");

  return `// Generado por Agrocode a partir de las reglas del agricultor.
// Cultivo: ${crop?.label ?? ir.crop}
// NO editar a mano: los cambios se pierden al recompilar desde la app.

${pinDefs}

void setup() {
  Serial.begin(115200);
${actuatorSetup}
${sensorSetup}
}

void loop() {
${readings}

${rules}

  delay(1000); // ciclo de evaluación
}
`;
}

// Lanza excepción si el programa tiene errores bloqueantes (el gate está en
// generateIntermediateCode): nunca se genera C++ de un programa inválido.
export function generateCpp(program: Program): string {
  return irToCpp(generateIntermediateCode(program));
}
