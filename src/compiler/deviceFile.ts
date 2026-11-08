// Formato en disco de un dispositivo guardado y su validación. Es código puro
// (sin Tauri ni DOM): lo usa src/storage/deviceStore.ts para leer/escribir
// archivos y se puede probar con node. Un archivo puede venir dañado o de una
// versión distinta, así que al leerlo se sanea todo en vez de confiar en él.
import type { Expr, Rule, Statement } from "./ast.ts";
import { findActuatorKind, findSensorKind } from "./catalog.ts";
import {
  emptyDevice,
  toIdentifier,
  type Device,
  type RegisteredActuator,
  type RegisteredSensor,
} from "./device.ts";
import { resolvePinConflicts } from "./pins.ts";

// Subir al cambiar el formato; un archivo con versión mayor se rechaza en vez
// de interpretarlo mal.
export const DEVICE_FILE_VERSION = 1;

export interface StoredDevice {
  version: number;
  id: string; // nombre del archivo (sin .json); identifica al dispositivo
  updatedAt: string; // ISO 8601
  device: Device;
}

export function newStoredDevice(name: string): StoredDevice {
  return {
    version: DEVICE_FILE_VERSION,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    device: emptyDevice(name),
  };
}

export function serializeDevice(stored: StoredDevice): string {
  return JSON.stringify(stored, null, 2);
}

// --- Lectura defensiva ---

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const VALID_IDENTIFIER = /^[A-Z_][A-Z0-9_]*$/;

function parseExpr(raw: unknown): Expr | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "Logical") {
    if (raw.operator !== "Y" && raw.operator !== "O") return null;
    const left = parseExpr(raw.left);
    const right = parseExpr(raw.right);
    return left && right ? { kind: "Logical", operator: raw.operator, left, right } : null;
  }
  if (raw.kind !== "Comparison") return null;
  const operators = ["<", ">", "=", "<=", ">="];
  if (typeof raw.operator !== "string" || !operators.includes(raw.operator)) return null;
  if (!isObject(raw.left) || raw.left.kind !== "SensorRef" || str(raw.left.sensor) === null) return null;
  if (!isObject(raw.right)) return null;

  const operator = raw.operator as "<" | ">" | "=" | "<=" | ">=";
  const left = { kind: "SensorRef" as const, sensor: raw.left.sensor as string };
  const r = raw.right;
  if (r.kind === "Literal") {
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) return null;
    if (r.type !== "ENTERO" && r.type !== "DECIMAL") return null;
    return { kind: "Comparison", operator, left, right: { kind: "Literal", value: r.value, type: r.type } };
  }
  if (r.kind === "SensorRef" && str(r.sensor) !== null) {
    return { kind: "Comparison", operator, left, right: { kind: "SensorRef", sensor: r.sensor as string } };
  }
  if (r.kind === "ActuatorRef" && str(r.actuator) !== null) {
    return { kind: "Comparison", operator, left, right: { kind: "ActuatorRef", actuator: r.actuator as string } };
  }
  return null;
}

function parseStatement(raw: unknown): Statement | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "StateAction") {
    if (raw.action !== "ENCENDER" && raw.action !== "APAGAR") return null;
    const actuator = str(raw.actuator);
    return actuator === null ? null : { kind: "StateAction", action: raw.action, actuator };
  }
  if (raw.kind === "WaitAction") {
    if (typeof raw.seconds !== "number" || !Number.isFinite(raw.seconds)) return null;
    return { kind: "WaitAction", action: "ESPERAR", seconds: raw.seconds };
  }
  return null;
}

function parseRule(raw: unknown): Rule | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const condition = parseExpr(raw.condition);
  if (!id || name === null || !condition || !Array.isArray(raw.actions) || raw.actions.length === 0) return null;
  const actions = raw.actions.map(parseStatement);
  if (actions.some((a) => a === null)) return null;

  const rule: Rule = { id, name, condition, actions: actions as Statement[] };
  const tw = raw.timeWindow;
  if (isObject(tw) && str(tw.from) !== null && str(tw.to) !== null) {
    rule.timeWindow = { from: tw.from as string, to: tw.to as string };
  }
  return rule;
}

function sensorsUsed(expr: Expr, into: Set<string>) {
  if (expr.kind === "Logical") {
    sensorsUsed(expr.left, into);
    sensorsUsed(expr.right, into);
    return;
  }
  into.add(expr.left.sensor);
  if (expr.right.kind === "SensorRef") into.add(expr.right.sensor);
}

function actuatorsUsed(expr: Expr, into: Set<string>) {
  if (expr.kind === "Logical") {
    actuatorsUsed(expr.left, into);
    actuatorsUsed(expr.right, into);
    return;
  }
  if (expr.right.kind === "ActuatorRef") into.add(expr.right.actuator);
}

// Lanza Error con un mensaje que se le puede mostrar al agricultor.
export function parseStoredDevice(text: string, fileId: string): StoredDevice {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El archivo está dañado y no se puede leer.");
  }
  if (!isObject(raw) || typeof raw.version !== "number" || !isObject(raw.device)) {
    throw new Error("El archivo no tiene el formato de un dispositivo de Agrocode.");
  }
  if (raw.version > DEVICE_FILE_VERSION) {
    throw new Error("Este dispositivo se guardó con una versión más nueva de Agrocode. Actualiza la app para abrirlo.");
  }

  const d = raw.device;
  const taken: string[] = [];

  const sensors: RegisteredSensor[] = [];
  for (const item of Array.isArray(d.sensors) ? d.sensors : []) {
    if (!isObject(item) || typeof item.kind !== "string" || !findSensorKind(item.kind)) continue;
    const name = str(item.name)?.trim() || findSensorKind(item.kind)!.label;
    const given = str(item.id);
    const id = given && VALID_IDENTIFIER.test(given) && !taken.includes(given) ? given : toIdentifier(name, taken);
    taken.push(id);
    sensors.push({ id, name, kind: item.kind as RegisteredSensor["kind"], pin: typeof item.pin === "number" ? item.pin : -1 });
  }

  const actuators: RegisteredActuator[] = [];
  for (const item of Array.isArray(d.actuators) ? d.actuators : []) {
    if (!isObject(item) || typeof item.kind !== "string" || !findActuatorKind(item.kind)) continue;
    const name = str(item.name)?.trim() || findActuatorKind(item.kind)!.label;
    const given = str(item.id);
    const id = given && VALID_IDENTIFIER.test(given) && !taken.includes(given) ? given : toIdentifier(name, taken);
    taken.push(id);
    actuators.push({ id, name, kind: item.kind as RegisteredActuator["kind"], pin: typeof item.pin === "number" ? item.pin : -1 });
  }

  // Reglas: solo las bien formadas, con id único y que usan aparatos que existen.
  const sensorIds = new Set(sensors.map((s) => s.id));
  const actuatorIds = new Set(actuators.map((a) => a.id));
  const ruleIds = new Set<string>();
  const rules: Rule[] = [];
  for (const item of Array.isArray(d.rules) ? d.rules : []) {
    const rule = parseRule(item);
    if (!rule) continue;
    const usedSensors = new Set<string>();
    const usedActuators = new Set<string>();
    sensorsUsed(rule.condition, usedSensors);
    actuatorsUsed(rule.condition, usedActuators);
    if (![...usedSensors].every((s) => sensorIds.has(s))) continue;
    if (![...usedActuators].every((a) => actuatorIds.has(a))) continue;
    // Lo que se enciende/apaga suele ser un equipo, pero el asistente también
    // deja elegir un sensor a propósito (error I4/T8): basta con que exista.
    const targets = rule.actions.flatMap((a) => (a.kind === "StateAction" ? [a.actuator] : []));
    if (!targets.every((t) => actuatorIds.has(t) || sensorIds.has(t))) continue;

    let id = rule.id;
    for (let n = 2; ruleIds.has(id); n++) id = `${rule.id}-${n}`;
    ruleIds.add(id);
    rules.push({ ...rule, id });
  }

  const device = resolvePinConflicts({
    name: str(d.name) ?? "Mi dispositivo",
    crop: str(d.crop) ?? "",
    sensors,
    actuators,
    rules,
  });

  return {
    version: DEVICE_FILE_VERSION,
    id: fileId,
    updatedAt: str(raw.updatedAt) ?? new Date(0).toISOString(),
    device,
  };
}
