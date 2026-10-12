// Persistencia de dispositivos: un archivo JSON por dispositivo en la carpeta
// de datos de la app (compartida entre `tauri dev` y la app instalada). Fuera
// de Tauri (`npm run dev` en el navegador) cae a localStorage para poder seguir
// iterando la interfaz.
import { isTauri } from "@tauri-apps/api/core";
import { parseStoredDevice, serializeDevice, type StoredDevice } from "../compiler/deviceFile";

const DIR = "devices";
const BROWSER_KEY = "agrocode.devices";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// Un archivo ilegible no tumba la lista: se devuelve como entrada con error.
export type StoredEntry = { ok: true; stored: StoredDevice } | { ok: false; id: string; error: string };

function assertSafeId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error(`Identificador de dispositivo no válido: "${id}"`);
}

function toEntry(text: string, id: string): StoredEntry {
  try {
    return { ok: true, stored: parseStoredDevice(text, id) };
  } catch (e) {
    return { ok: false, id, error: (e as Error).message };
  }
}

// --- Navegador (localStorage) ---

function readBrowser(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BROWSER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeBrowser(files: Record<string, string>) {
  localStorage.setItem(BROWSER_KEY, JSON.stringify(files));
}

// --- API ---

export async function listDevices(): Promise<StoredEntry[]> {
  if (!isTauri()) {
    return Object.entries(readBrowser()).map(([id, text]) => toEntry(text, id));
  }

  const { BaseDirectory, exists, readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
  const baseDir = BaseDirectory.AppData;
  if (!(await exists(DIR, { baseDir }))) return [];

  const entries: StoredEntry[] = [];
  for (const file of await readDir(DIR, { baseDir })) {
    if (!file.isFile || !file.name.endsWith(".json")) continue;
    const id = file.name.slice(0, -".json".length);
    if (!SAFE_ID.test(id)) continue;
    try {
      entries.push(toEntry(await readTextFile(`${DIR}/${file.name}`, { baseDir }), id));
    } catch (e) {
      entries.push({ ok: false, id, error: `No se pudo leer el archivo: ${(e as Error).message ?? e}` });
    }
  }
  return entries;
}

export async function saveDevice(stored: StoredDevice): Promise<void> {
  assertSafeId(stored.id);
  const text = serializeDevice(stored);

  if (!isTauri()) {
    writeBrowser({ ...readBrowser(), [stored.id]: text });
    return;
  }

  const { BaseDirectory, mkdir, rename, writeTextFile } = await import("@tauri-apps/plugin-fs");
  const baseDir = BaseDirectory.AppData;
  await mkdir(DIR, { baseDir, recursive: true });
  // Escritura atómica: primero a un temporal y luego se reemplaza el definitivo,
  // para que un cierre brusco no deje el archivo a medias.
  const tmp = `${DIR}/${stored.id}.json.tmp`;
  await writeTextFile(tmp, text, { baseDir });
  await rename(tmp, `${DIR}/${stored.id}.json`, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
}

export async function deleteDevice(id: string): Promise<void> {
  assertSafeId(id);

  if (!isTauri()) {
    const files = readBrowser();
    delete files[id];
    writeBrowser(files);
    return;
  }

  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  const baseDir = BaseDirectory.AppData;
  const path = `${DIR}/${id}.json`;
  if (await exists(path, { baseDir })) await remove(path, { baseDir });
}
