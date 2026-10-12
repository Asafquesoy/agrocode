// Registro del dispositivo: lo que el agricultor dio de alta (cultivo, sensores
// y equipos) más sus reglas. Reemplaza al antiguo catálogo fijo: el compilador
// recibe una vista de solo lectura (DeviceRegistry) en vez de leer globales.
import type { Expr, Program, Rule } from "./ast.ts";
import { usedDeclarations } from "./ast.ts";
import {
  SENSOR_KINDS,
  findActuatorKind,
  findSensorKind,
  type ActuatorKindId,
  type SensorKindId,
} from "./catalog.ts";
import { KEYWORDS } from "./lexer.ts";
import { nextFreePin } from "./pins.ts";

export interface RegisteredSensor {
  id: string; // identificador del lenguaje (estable: no cambia al renombrar)
  name: string; // nombre libre que ve el agricultor
  kind: SensorKindId;
  pin: number; // lo asigna pins.ts; la interfaz nunca lo muestra
}

export interface RegisteredActuator {
  id: string;
  name: string;
  kind: ActuatorKindId;
  pin: number;
}

export interface Device {
  name: string;
  crop: string; // texto libre: cultivo o proceso
  sensors: RegisteredSensor[];
  actuators: RegisteredActuator[];
  rules: Rule[];
}

// --- Vista que consume el compilador ---

export interface RegistrySensor {
  id: string;
  label: string;
  kind: SensorKindId;
  unit: string;
  pin: number;
  mode: "ANALOG" | "I2C";
  min: number;
  max: number;
}

export interface RegistryActuator {
  id: string;
  label: string;
  kind: ActuatorKindId;
  pin: number;
}

export interface DeviceRegistry {
  cropId: string; // identificador del lenguaje del cultivo
  cropLabel: string;
  sensors: RegistrySensor[];
  actuators: RegistryActuator[];
}

// Texto libre -> identificador del lenguaje (MAYÚSCULAS, sin acentos, solo
// letras/dígitos/_). Evita palabras clave y los ids de `taken`.
export function toIdentifier(name: string, taken: Iterable<string> = []): string {
  let base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base === "") base = "SIN_NOMBRE";
  if (/^[0-9]/.test(base)) base = `N_${base}`;

  const takenSet = new Set(taken);
  const isFree = (id: string) => !KEYWORDS.has(id) && !takenSet.has(id);
  if (isFree(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (isFree(candidate)) return candidate;
  }
}

export function emptyDevice(name = "Mi dispositivo"): Device {
  return { name, crop: "", sensors: [], actuators: [], rules: [] };
}

export function deviceRegistry(device: Device): DeviceRegistry {
  return {
    cropId: toIdentifier(device.crop),
    cropLabel: device.crop.trim() || "Sin nombre",
    sensors: device.sensors.map((s) => {
      const kind = findSensorKind(s.kind) ?? SENSOR_KINDS[0];
      return { id: s.id, label: s.name, kind: kind.id, unit: kind.unit, pin: s.pin, mode: kind.mode, min: kind.min, max: kind.max };
    }),
    actuators: device.actuators.map((a) => ({ id: a.id, label: a.name, kind: a.kind, pin: a.pin })),
  };
}

export function deviceToProgram(device: Device): Program {
  const registry = deviceRegistry(device);
  return {
    crop: registry.cropId,
    declarations: usedDeclarations(device.rules, registry),
    rules: device.rules,
  };
}

// --- Alta / baja de aparatos ---

function takenIds(device: Device): string[] {
  return [...device.sensors.map((s) => s.id), ...device.actuators.map((a) => a.id)];
}

// Nombre sugerido para un aparato nuevo: "Humedad del suelo", "Humedad del suelo 2"…
export function suggestedName(device: Device, role: "SENSOR" | "ACTUADOR", kindId: string): string {
  const label =
    role === "SENSOR" ? (findSensorKind(kindId)?.label ?? kindId) : (findActuatorKind(kindId)?.label ?? kindId);
  const sameKind =
    role === "SENSOR"
      ? device.sensors.filter((s) => s.kind === kindId).length
      : device.actuators.filter((a) => a.kind === kindId).length;
  return sameKind === 0 ? label : `${label} ${sameKind + 1}`;
}

// Devuelve null si ya no queda pin libre para ese tipo.
export function addSensor(device: Device, kind: SensorKindId, name: string): Device | null {
  const pin = nextFreePin(device, { role: "SENSOR", kind });
  if (pin === null) return null;
  const cleanName = name.trim() || suggestedName(device, "SENSOR", kind);
  const id = toIdentifier(cleanName, takenIds(device));
  return { ...device, sensors: [...device.sensors, { id, name: cleanName, kind, pin }] };
}

export function addActuator(device: Device, kind: ActuatorKindId, name: string): Device | null {
  const pin = nextFreePin(device, { role: "ACTUADOR" });
  if (pin === null) return null;
  const cleanName = name.trim() || suggestedName(device, "ACTUADOR", kind);
  const id = toIdentifier(cleanName, takenIds(device));
  return { ...device, actuators: [...device.actuators, { id, name: cleanName, kind, pin }] };
}

// Renombrar solo cambia lo que ve el agricultor: el id (y por tanto las reglas
// y el C++) no se mueve.
export function renameSensor(device: Device, id: string, name: string): Device {
  const clean = name.trim();
  if (!clean) return device;
  return { ...device, sensors: device.sensors.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
}

export function renameActuator(device: Device, id: string, name: string): Device {
  const clean = name.trim();
  if (!clean) return device;
  return { ...device, actuators: device.actuators.map((a) => (a.id === id ? { ...a, name: clean } : a)) };
}

function exprUses(e: Expr, id: string): boolean {
  if (e.kind === "Comparison") {
    return (
      e.left.sensor === id ||
      (e.right.kind === "SensorRef" && e.right.sensor === id) ||
      (e.right.kind === "ActuatorRef" && e.right.actuator === id)
    );
  }
  return exprUses(e.left, id) || exprUses(e.right, id);
}

export function rulesUsing(device: Device, id: string): Rule[] {
  return device.rules.filter(
    (r) => exprUses(r.condition, id) || r.actions.some((a) => a.kind === "StateAction" && a.actuator === id)
  );
}

// Quitar un aparato borra también las reglas que lo usan (la interfaz pide
// confirmación antes, con rulesUsing). Los pines de los demás no se mueven.
export function removeSensor(device: Device, id: string): Device {
  const using = new Set(rulesUsing(device, id).map((r) => r.id));
  return {
    ...device,
    sensors: device.sensors.filter((s) => s.id !== id),
    rules: device.rules.filter((r) => !using.has(r.id)),
  };
}

export function removeActuator(device: Device, id: string): Device {
  const using = new Set(rulesUsing(device, id).map((r) => r.id));
  return {
    ...device,
    actuators: device.actuators.filter((a) => a.id !== id),
    rules: device.rules.filter((r) => !using.has(r.id)),
  };
}
