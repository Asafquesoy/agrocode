// "Kit de la clase": el ESP32 de la demo tal como está cableado en el aula.
// Pines verificados en la placa real (escáner I2C y recorrido de LEDs):
//   AHT20 (temperatura y humedad del aire) por I2C: SDA 21, SCL 22.
//   LED 1 RGB (cátodo común): R 4, G 18, B 5.   LED 2 RGB (cátodo común): R 25, G 27, B 26.
// El agricultor nunca ve estos pines: salen del dispositivo ya armado.
import { comparison, stateAction, type Rule } from "./ast.ts";
import type { Device } from "./device.ts";
import { newStoredDevice, type StoredDevice } from "./deviceFile.ts";

// Umbrales cercanos a lo que mide el sensor en el aula (~33 °C y ~66 %) para que
// el cambio de color se vea al soplarle o taparlo con la mano.
const TEMP_LIMIT = 30;
const HUMIDITY_LIMIT = 70;

const RULES: Rule[] = [
  {
    id: "kit-calor",
    name: "Hace calor: LED 1 en rojo",
    condition: comparison("TEMPERATURA", ">", TEMP_LIMIT, "DECIMAL"),
    actions: [stateAction("ENCENDER", "LED_1_ROJO"), stateAction("APAGAR", "LED_1_VERDE")],
  },
  {
    id: "kit-fresco",
    name: "Temperatura agradable: LED 1 en verde",
    condition: comparison("TEMPERATURA", "<=", TEMP_LIMIT, "DECIMAL"),
    actions: [stateAction("ENCENDER", "LED_1_VERDE"), stateAction("APAGAR", "LED_1_ROJO")],
  },
  {
    id: "kit-humedo",
    name: "Aire húmedo: LED 2 en azul",
    condition: comparison("HUMEDAD_AIRE", ">", HUMIDITY_LIMIT, "DECIMAL"),
    actions: [stateAction("ENCENDER", "LED_2_AZUL"), stateAction("APAGAR", "LED_2_VERDE")],
  },
  {
    id: "kit-seco",
    name: "Aire normal: LED 2 en verde",
    condition: comparison("HUMEDAD_AIRE", "<=", HUMIDITY_LIMIT, "DECIMAL"),
    actions: [stateAction("ENCENDER", "LED_2_VERDE"), stateAction("APAGAR", "LED_2_AZUL")],
  },
];

export function kitDevice(): Device {
  return {
    name: "Kit de la clase",
    crop: "Invernadero de prueba",
    sensors: [
      { id: "TEMPERATURA", name: "Temperatura", kind: "TEMPERATURE", pin: 21 },
      { id: "HUMEDAD_AIRE", name: "Humedad del aire", kind: "AIR_HUMIDITY", pin: 21 },
    ],
    actuators: [
      { id: "LED_1_ROJO", name: "LED 1 rojo", kind: "LED", pin: 4 },
      { id: "LED_1_VERDE", name: "LED 1 verde", kind: "LED", pin: 18 },
      { id: "LED_1_AZUL", name: "LED 1 azul", kind: "LED", pin: 5 },
      { id: "LED_2_ROJO", name: "LED 2 rojo", kind: "LED", pin: 25 },
      { id: "LED_2_VERDE", name: "LED 2 verde", kind: "LED", pin: 27 },
      { id: "LED_2_AZUL", name: "LED 2 azul", kind: "LED", pin: 26 },
    ],
    rules: RULES,
  };
}

export function newStoredKit(): StoredDevice {
  return { ...newStoredDevice("Kit de la clase"), device: kitDevice() };
}
