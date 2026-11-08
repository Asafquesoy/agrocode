// Asignación automática de pines del ESP32. El agricultor nunca elige ni ve un
// pin: al registrar un aparato se le da el siguiente libre de su grupo, y
// cualquier conflicto (duplicado o pin inválido) se corrige solo.
import { findSensorKind, type SensorKindId } from "./catalog.ts";
import type { Device } from "./device.ts";

// Solo ADC1: son los pines analógicos que no se ven afectados por el Wi-Fi del ESP32.
export const ANALOG_PINS = [34, 35, 32, 33, 36, 39];
// Sin pines de arranque (0, 2, 5, 12, 15) ni de flash.
export const OUTPUT_PINS = [26, 27, 14, 25, 13, 23, 19, 18, 17, 16];
// Bus I2C compartido: varios sensores I2C conviven en el mismo pin SDA.
export const I2C_PIN = 21;

export type PinTarget = { role: "SENSOR"; kind: SensorKindId } | { role: "ACTUADOR" };

function poolFor(target: PinTarget): { pool: number[]; shared: boolean } {
  if (target.role === "ACTUADOR") return { pool: OUTPUT_PINS, shared: false };
  const mode = findSensorKind(target.kind)?.mode ?? "ANALOG";
  return mode === "I2C" ? { pool: [I2C_PIN], shared: true } : { pool: ANALOG_PINS, shared: false };
}

function exclusivePinsInUse(device: Device): Set<number> {
  const used = new Set<number>();
  for (const s of device.sensors) {
    if (!poolFor({ role: "SENSOR", kind: s.kind }).shared) used.add(s.pin);
  }
  for (const a of device.actuators) used.add(a.pin);
  return used;
}

// Siguiente pin libre para un aparato nuevo, o null si ya no queda espacio.
export function nextFreePin(device: Device, target: PinTarget): number | null {
  const { pool, shared } = poolFor(target);
  if (shared) return I2C_PIN;
  const used = exclusivePinsInUse(device);
  return pool.find((p) => !used.has(p)) ?? null;
}

export function canRegister(device: Device, target: PinTarget): boolean {
  return nextFreePin(device, target) !== null;
}

// Reasigna pines duplicados o fuera de su grupo de forma determinista. Dos
// pasadas: primero cada aparato reclama su pin si es válido y nadie lo tiene;
// después los que quedaron sin pin toman el primero libre del grupo. Así un
// aparato con pin válido nunca se mueve por culpa de otro.
export function resolvePinConflicts(device: Device): Device {
  const claimed = new Set<number>();
  const pins: { kind: "sensor" | "actuator"; index: number; pin: number | null; pool: number[] }[] = [];

  device.sensors.forEach((s, index) => {
    const { pool, shared } = poolFor({ role: "SENSOR", kind: s.kind });
    if (shared) {
      pins.push({ kind: "sensor", index, pin: I2C_PIN, pool });
      return;
    }
    const ok = pool.includes(s.pin) && !claimed.has(s.pin);
    if (ok) claimed.add(s.pin);
    pins.push({ kind: "sensor", index, pin: ok ? s.pin : null, pool });
  });
  device.actuators.forEach((a, index) => {
    const ok = OUTPUT_PINS.includes(a.pin) && !claimed.has(a.pin);
    if (ok) claimed.add(a.pin);
    pins.push({ kind: "actuator", index, pin: ok ? a.pin : null, pool: OUTPUT_PINS });
  });

  for (const p of pins) {
    if (p.pin !== null) continue;
    // Si el grupo está agotado (datos corruptos; canRegister lo evita al
    // registrar) se deja el pin original: no hay otra salida honesta.
    const free = p.pool.find((candidate) => !claimed.has(candidate));
    if (free !== undefined) {
      claimed.add(free);
      p.pin = free;
    }
  }

  return {
    ...device,
    sensors: device.sensors.map((s, i) => {
      const p = pins.find((x) => x.kind === "sensor" && x.index === i);
      return p && p.pin !== null && p.pin !== s.pin ? { ...s, pin: p.pin } : s;
    }),
    actuators: device.actuators.map((a, i) => {
      const p = pins.find((x) => x.kind === "actuator" && x.index === i);
      return p && p.pin !== null && p.pin !== a.pin ? { ...a, pin: p.pin } : a;
    }),
  };
}
