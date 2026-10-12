// El antiguo catálogo fijo (caña, humedad, lluvia, bomba…) expresado como un
// dispositivo registrado. Lo usa el CLI (scripts/analyze.ts) para analizar los
// .agro de examples/; la app no lo carga: arranca con un dispositivo vacío.
import { deviceRegistry, type Device } from "./device.ts";

export const EXAMPLE_DEVICE: Device = {
  name: "Ejemplo",
  crop: "Caña",
  sensors: [
    { id: "HUMEDAD_SUELO", name: "Humedad del suelo", kind: "SOIL_MOISTURE", pin: 34 },
    { id: "TEMPERATURA", name: "Temperatura", kind: "TEMPERATURE", pin: 21 },
    { id: "HUMEDAD_AIRE", name: "Humedad del aire", kind: "AIR_HUMIDITY", pin: 21 },
    { id: "LLUVIA", name: "Sensor de lluvia", kind: "RAIN", pin: 35 },
  ],
  actuators: [
    { id: "BOMBA_PRINCIPAL", name: "Bomba de riego principal", kind: "PUMP", pin: 26 },
    { id: "VALVULA_NORTE", name: "Válvula norte", kind: "VALVE", pin: 27 },
    { id: "VALVULA_SUR", name: "Válvula sur", kind: "VALVE", pin: 14 },
    { id: "ALARMA", name: "Alarma / notificación", kind: "ALARM", pin: 25 },
  ],
  rules: [],
};

export const EXAMPLE_REGISTRY = deviceRegistry(EXAMPLE_DEVICE);
