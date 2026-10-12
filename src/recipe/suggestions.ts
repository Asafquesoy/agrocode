// Reglas sugeridas según lo que el agricultor registró (reemplaza a las recetas
// pre-armadas por cultivo). Cada sugerencia usa solo aparatos que existen en el
// dispositivo y tiene un id estable, para poder ocultarla cuando ya se agregó.
import type { Rule } from "../compiler/ast";
import { comparison, logical, stateAction } from "../compiler/ast";
import type { Device } from "../compiler/device";

const MIN_MOISTURE = 30;
const MAX_MOISTURE = 80;
const HIGH_TEMPERATURE = 35;

export function suggestedRules(device: Device): Rule[] {
  const soil = device.sensors.find((s) => s.kind === "SOIL_MOISTURE");
  const rain = device.sensors.find((s) => s.kind === "RAIN");
  const temperature = device.sensors.find((s) => s.kind === "TEMPERATURE");
  // Para regar se prefiere una bomba; si no hay, una válvula.
  const irrigation =
    device.actuators.find((a) => a.kind === "PUMP") ?? device.actuators.find((a) => a.kind === "VALVE");
  const alarm = device.actuators.find((a) => a.kind === "ALARM");

  const rules: Rule[] = [];

  if (soil && irrigation) {
    rules.push({
      id: `sug-riego-bajo-${soil.id}-${irrigation.id}`,
      name: "Regar cuando la tierra está seca",
      condition: comparison(soil.id, "<", MIN_MOISTURE),
      actions: [stateAction("ENCENDER", irrigation.id)],
      timeWindow: { from: "06:00", to: "18:00" },
    });
    rules.push({
      id: `sug-riego-alto-${soil.id}-${irrigation.id}`,
      name: "Cortar el riego cuando la tierra está encharcada",
      condition: comparison(soil.id, ">", MAX_MOISTURE),
      actions: [stateAction("APAGAR", irrigation.id)],
    });
    if (rain) {
      rules.push({
        id: `sug-pausa-lluvia-${soil.id}-${rain.id}-${irrigation.id}`,
        name: "No regar si ya está lloviendo",
        condition: logical("Y", comparison(soil.id, "<", MIN_MOISTURE), comparison(rain.id, "=", 0)),
        actions: [stateAction("ENCENDER", irrigation.id)],
      });
    }
  }

  if (temperature && alarm) {
    rules.push({
      id: `sug-calor-${temperature.id}-${alarm.id}`,
      name: "Avisar cuando hace demasiado calor",
      condition: comparison(temperature.id, ">", HIGH_TEMPERATURE),
      actions: [stateAction("ENCENDER", alarm.id)],
    });
  }

  return rules;
}

// Las que todavía no están en el dispositivo.
export function pendingSuggestions(device: Device): Rule[] {
  const existing = new Set(device.rules.map((r) => r.id));
  return suggestedRules(device).filter((r) => !existing.has(r.id));
}
