// Sistema de tipos del lenguaje, según Actividad 5:
// "Reglas de tipos de datos en el código del proyecto".
//
// Tipos fundamentales del lenguaje.
export type TipoDato =
  | "ENTERO"
  | "DECIMAL"
  | "BOOLEANO"
  | "SENSOR"
  | "ACTUADOR"
  | "ACCION_ESTADO"
  | "ACCION_TIEMPO"
  | "TEXTO";

export type OperadorRelacional = "<" | ">" | "=" | "<=" | ">=";
export type OperadorLogico = "Y" | "O";
export type OperadorAritmetico = "+" | "-" | "*" | "/";

// --- Catálogo del dominio agrícola de El Mante ---

export interface DefinicionSensor {
  id: string;
  etiqueta: string;
  unidad: string;
  pin: number;
  modo: "ANALOGICO" | "I2C";
}

export interface DefinicionActuador {
  id: string;
  etiqueta: string;
  pin: number;
}

export interface DefinicionCultivo {
  id: string;
  etiqueta: string;
  icono: "CANA" | "CITRICOS" | "MAIZ" | "SORGO";
  humedadMinima: number;
  humedadMaxima: number;
}

export const SENSORES: DefinicionSensor[] = [
  { id: "HUMEDAD_SUELO", etiqueta: "Humedad del suelo", unidad: "%", pin: 34, modo: "ANALOGICO" },
  { id: "TEMPERATURA", etiqueta: "Temperatura", unidad: "°C", pin: 4, modo: "I2C" },
  { id: "HUMEDAD_AIRE", etiqueta: "Humedad del aire", unidad: "%", pin: 4, modo: "I2C" },
  { id: "LLUVIA", etiqueta: "Sensor de lluvia", unidad: "", pin: 35, modo: "ANALOGICO" },
];

export const ACTUADORES: DefinicionActuador[] = [
  { id: "BOMBA_PRINCIPAL", etiqueta: "Bomba de riego principal", pin: 26 },
  { id: "VALVULA_NORTE", etiqueta: "Válvula norte", pin: 27 },
  { id: "VALVULA_SUR", etiqueta: "Válvula sur", pin: 14 },
  { id: "ALARMA", etiqueta: "Alarma / notificación", pin: 25 },
];

export const ACCIONES_ESTADO = ["ENCENDER", "APAGAR"] as const;
export const ACCIONES_TIEMPO = ["ESPERAR"] as const;

export const CULTIVOS: DefinicionCultivo[] = [
  { id: "CANA", etiqueta: "Caña de azúcar", icono: "CANA", humedadMinima: 30, humedadMaxima: 80 },
  { id: "CITRICOS", etiqueta: "Cítricos", icono: "CITRICOS", humedadMinima: 35, humedadMaxima: 75 },
  { id: "MAIZ", etiqueta: "Maíz", icono: "MAIZ", humedadMinima: 40, humedadMaxima: 85 },
  { id: "SORGO", etiqueta: "Sorgo", icono: "SORGO", humedadMinima: 25, humedadMaxima: 70 },
];

export function buscarSensor(id: string): DefinicionSensor | undefined {
  return SENSORES.find((s) => s.id === id);
}

export function buscarActuador(id: string): DefinicionActuador | undefined {
  return ACTUADORES.find((a) => a.id === id);
}

export function buscarCultivo(id: string): DefinicionCultivo | undefined {
  return CULTIVOS.find((c) => c.id === id);
}
