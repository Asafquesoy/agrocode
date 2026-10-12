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

// --- Catálogo del dominio agrícola de El Mante ---

export interface SensorDef {
  id: string;
  label: string;
  unit: string;
  pin: number;
  mode: "ANALOG" | "I2C";
}

export interface ActuatorDef {
  id: string;
  label: string;
  pin: number;
}

export interface CropDef {
  id: string;
  label: string;
  icon: "CANA" | "CITRICOS" | "MAIZ" | "SORGO";
  minMoisture: number;
  maxMoisture: number;
}

export const SENSORS: SensorDef[] = [
  { id: "HUMEDAD_SUELO", label: "Humedad del suelo", unit: "%", pin: 34, mode: "ANALOG" },
  { id: "TEMPERATURA", label: "Temperatura", unit: "°C", pin: 4, mode: "I2C" },
  { id: "HUMEDAD_AIRE", label: "Humedad del aire", unit: "%", pin: 4, mode: "I2C" },
  { id: "LLUVIA", label: "Sensor de lluvia", unit: "", pin: 35, mode: "ANALOG" },
];

export const ACTUATORS: ActuatorDef[] = [
  { id: "BOMBA_PRINCIPAL", label: "Bomba de riego principal", pin: 26 },
  { id: "VALVULA_NORTE", label: "Válvula norte", pin: 27 },
  { id: "VALVULA_SUR", label: "Válvula sur", pin: 14 },
  { id: "ALARMA", label: "Alarma / notificación", pin: 25 },
];

export const CROPS: CropDef[] = [
  { id: "CANA", label: "Caña de azúcar", icon: "CANA", minMoisture: 30, maxMoisture: 80 },
  { id: "CITRICOS", label: "Cítricos", icon: "CITRICOS", minMoisture: 35, maxMoisture: 75 },
  { id: "MAIZ", label: "Maíz", icon: "MAIZ", minMoisture: 40, maxMoisture: 85 },
  { id: "SORGO", label: "Sorgo", icon: "SORGO", minMoisture: 25, maxMoisture: 70 },
];

export function findSensor(id: string): SensorDef | undefined {
  return SENSORS.find((s) => s.id === id);
}

export function findActuator(id: string): ActuatorDef | undefined {
  return ACTUATORS.find((a) => a.id === id);
}

export function findCrop(id: string): CropDef | undefined {
  return CROPS.find((c) => c.id === id);
}
