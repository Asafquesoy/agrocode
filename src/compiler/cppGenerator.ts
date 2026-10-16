// Código intermedio (cuádruplos) -> sketch .ino para ESP32 (Arduino framework).
// El generador no lee el AST: solo traduce la lista de cuádruplos que produce
// intermediateCode.ts, que ya pasó por el gate semántico. Pines, nombres y
// unidades salen del registro del dispositivo (device.ts).
import type { Program } from "./ast.ts";
import type { DeviceRegistry, RegistrySensor } from "./device.ts";
import type { SensorValueType } from "./inferTypes.ts";
import { generateIntermediateCode, type IRProgram, type IRRuleBlock, type Quadruple } from "./intermediateCode.ts";

const C_TYPES: Record<SensorValueType, string> = { ENTERO: "int", DECIMAL: "float", BOOLEANO: "bool" };

// Los nombres los escribe el agricultor: nunca pueden romper una línea de comentario.
function commentSafe(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

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
  return `  // Regla: ${commentSafe(block.name)}${windowComment}\n${body}`;
}

// Línea de lectura de un sensor según su modo y el tipo inferido de sus reglas:
//   ENTERO   -> int   + map(analogRead, 0, 4095, min, max)
//   DECIMAL  -> float + min + analogRead * (max - min) / 4095.0
//   BOOLEANO -> bool  + digitalRead
function readingToCpp(sensor: RegistrySensor, type: SensorValueType): string {
  const name = commentSafe(sensor.label);
  if (sensor.mode === "I2C") {
    return `  ${C_TYPES[type]} lectura_${sensor.id} = leer_${sensor.id}(); // ${name} — implementar lectura I2C`;
  }
  const unit = sensor.unit || "%";
  if (type === "BOOLEANO") {
    return `  bool lectura_${sensor.id} = digitalRead(PIN_${sensor.id}) == HIGH; // ${name}`;
  }
  if (type === "DECIMAL") {
    const span = sensor.max - sensor.min;
    return `  float lectura_${sensor.id} = ${sensor.min} + analogRead(PIN_${sensor.id}) * ${span} / 4095.0; // ${name} en ${unit}`;
  }
  return `  int lectura_${sensor.id} = map(analogRead(PIN_${sensor.id}), 0, 4095, ${sensor.min}, ${sensor.max}); // ${name} en ${unit}`;
}

export function irToCpp(ir: IRProgram, registry: DeviceRegistry): string {
  // Sensores en uso (y su tipo inferido) salen de los LEER del IR; así no se
  // declaran pines que ninguna regla usa.
  const sensors: { def: RegistrySensor; type: SensorValueType }[] = [];
  for (const q of ir.quadruples) {
    if (q.op !== "LEER") continue;
    const def = registry.sensors.find((s) => s.id === q.arg1);
    if (def) sensors.push({ def, type: (q.arg2 as SensorValueType | null) ?? "ENTERO" });
  }

  const actuatorIds: string[] = [];
  for (const q of ir.quadruples) {
    if ((q.op === "ENCENDER" || q.op === "APAGAR") && q.arg1 && !actuatorIds.includes(q.arg1)) {
      actuatorIds.push(q.arg1);
    }
  }
  const actuators = actuatorIds
    .map((id) => registry.actuators.find((a) => a.id === id))
    .filter((a) => a !== undefined);

  const pinDefs = [
    ...sensors.map(({ def }) => `#define PIN_${def.id} ${def.pin} // ${commentSafe(def.label)}`),
    ...actuators.map((a) => `#define PIN_${a.id} ${a.pin} // ${commentSafe(a.label)}`),
  ].join("\n");

  const actuatorSetup = actuators.map((a) => `  pinMode(PIN_${a.id}, OUTPUT);`).join("\n");
  const sensorSetup = sensors
    .map(({ def }) => (def.mode === "ANALOG" ? `  pinMode(PIN_${def.id}, INPUT);` : `  // ${def.id}: inicializar sensor I2C`))
    .join("\n");

  const readings = sensors.map(({ def, type }) => readingToCpp(def, type)).join("\n");

  const rules = ir.rules.map((b) => ruleToCpp(ir, b)).join("\n\n");

  // Las lecturas I2C llaman a leer_X(); sin una definición el sketch no compila,
  // así que se emite un esqueleto que devuelve 0 hasta implementar el sensor.
  const i2cStubs = sensors
    .filter(({ def }) => def.mode === "I2C")
    .map(({ def, type }) => `${C_TYPES[type]} leer_${def.id}() {\n  return 0; // TODO: lectura I2C de ${commentSafe(def.label)}\n}`)
    .join("\n\n");

  return `// Generado por Agrocode a partir de las reglas del agricultor.
// Cultivo: ${commentSafe(registry.cropLabel)}
// NO editar a mano: los cambios se pierden al recompilar desde la app.

${pinDefs}
${i2cStubs ? `\n${i2cStubs}\n` : ""}
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
export function generateCpp(program: Program, registry: DeviceRegistry): string {
  return irToCpp(generateIntermediateCode(program, registry), registry);
}
