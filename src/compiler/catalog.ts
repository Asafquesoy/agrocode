// Sistema de tipos del lenguaje, según Actividad 5:
// "Reglas de tipos de datos en el código del proyecto".
//
// Tipos fundamentales del lenguaje.
export type DataType =
  | "ENTERO"
  | "DECIMAL"
  | "BOOLEANO"
  | "SENSOR"
  | "ACTUADOR"
  | "ACCION_ESTADO"
  | "ACCION_TIEMPO";

export type RelationalOperator = "<" | ">" | "=" | "<=" | ">=";
export type LogicalOperator = "Y" | "O";

// --- Tipos de aparato ---
//
// Esto NO es el catálogo de lo que tiene el agricultor: sus sensores y equipos
// concretos los registra él (ver device.ts). Aquí solo viven las *clases* de
// aparato que el sistema sabe leer o accionar, y de ellas salen el modo de
// lectura, la unidad y el rango. El pin nunca viene de aquí: lo asigna pins.ts.

export type SensorKindId = "SOIL_MOISTURE" | "RAIN" | "TEMPERATURE" | "AIR_HUMIDITY";
export type ActuatorKindId = "PUMP" | "VALVE" | "ALARM" | "OTHER";

export interface SensorKind {
  id: SensorKindId;
  label: string;
  unit: string;
  min: number;
  max: number;
  mode: "ANALOG" | "I2C";
}

export interface ActuatorKind {
  id: ActuatorKindId;
  label: string;
}

export const SENSOR_KINDS: SensorKind[] = [
  { id: "SOIL_MOISTURE", label: "Humedad del suelo", unit: "%", min: 0, max: 100, mode: "ANALOG" },
  { id: "RAIN", label: "Sensor de lluvia", unit: "", min: 0, max: 100, mode: "ANALOG" },
  { id: "TEMPERATURE", label: "Temperatura", unit: "°C", min: -10, max: 60, mode: "I2C" },
  { id: "AIR_HUMIDITY", label: "Humedad del aire", unit: "%", min: 0, max: 100, mode: "I2C" },
];

export const ACTUATOR_KINDS: ActuatorKind[] = [
  { id: "PUMP", label: "Bomba de riego" },
  { id: "VALVE", label: "Válvula" },
  { id: "ALARM", label: "Alarma / notificación" },
  { id: "OTHER", label: "Otro equipo" },
];

export function findSensorKind(id: string): SensorKind | undefined {
  return SENSOR_KINDS.find((k) => k.id === id);
}

export function findActuatorKind(id: string): ActuatorKind | undefined {
  return ACTUATOR_KINDS.find((k) => k.id === id);
}
