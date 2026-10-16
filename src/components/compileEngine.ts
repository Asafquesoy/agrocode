// Motor de compilación (Fase 2): puente al backend de Rust (src-tauri/src/
// compilador.rs), que descarga arduino-cli y compila el sketch para ESP32.
// Solo existe en la app de escritorio; en `npm run dev` no está disponible.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Entorno = { herramienta: boolean; esp32: boolean };
// Uso de memoria del ESP32: `bytes`/`porcentaje` es el programa (flash) y
// `ram_*` los datos en ejecución (RAM).
export type ResultadoCompilacion = {
  bytes: number | null;
  porcentaje: number | null;
  ram_bytes: number | null;
  ram_porcentaje: number | null;
};
export type Etapa = "descargando" | "instalando" | "compilando";
export type Progreso = { hecho: number; total: number };

export const compilerAvailable = isTauri;

export function verificarEntorno(): Promise<Entorno> {
  return invoke<Entorno>("verificar_entorno");
}

export function prepararEntorno(): Promise<void> {
  return invoke<void>("preparar_entorno");
}

export function compilar(codigo: string): Promise<ResultadoCompilacion> {
  return invoke<ResultadoCompilacion>("compilar", { codigo });
}

// Se suscribe a los eventos de la operación en curso; devuelve la función que
// cancela las tres suscripciones.
export async function escucharCompilacion(handlers: {
  onEtapa: (etapa: Etapa) => void;
  onProgreso: (progreso: Progreso) => void;
  onLinea: (linea: string) => void;
}): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<Etapa>("compilacion-etapa", (e) => handlers.onEtapa(e.payload)),
    listen<Progreso>("compilacion-progreso", (e) => handlers.onProgreso(e.payload)),
    listen<string>("compilacion-linea", (e) => handlers.onLinea(e.payload)),
  ]);
  // Cancelar una suscripción nunca debe tapar el resultado de la compilación.
  // `un()` es asíncrona: su fallo es una promesa rechazada, no una excepción.
  return () => unlisteners.forEach((un) => void Promise.resolve().then(un).catch(() => {}));
}
