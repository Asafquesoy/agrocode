// Imprime el sketch .ino del "Kit de la clase" (para compilarlo/subirlo sin la app).
import { deviceRegistry, deviceToProgram } from "../src/compiler/device.ts";
import { generateCpp } from "../src/compiler/cppGenerator.ts";
import { kitDevice } from "../src/compiler/kit.ts";

const device = kitDevice();
console.log(generateCpp(deviceToProgram(device), deviceRegistry(device)));
