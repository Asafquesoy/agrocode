import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../compiler/device";
import { DEVICE_FILE_VERSION } from "../compiler/deviceFile";
import { saveDevice } from "../storage/deviceStore";

export type SaveStatus = "saved" | "saving" | "error";

const DEBOUNCE_MS = 600;

// Guarda el dispositivo solo, unos instantes después del último cambio. El
// agricultor no tiene botón "Guardar". `flush` fuerza el guardado pendiente
// (al volver a la lista) y también se dispara al desmontar y al cerrar la
// ventana, para no perder el último cambio.
export function useAutosave(id: string, device: Device) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(device);
  // Último valor ya guardado (al abrir es el que se cargó: no se reescribe
  // ni se mueve `updatedAt` solo por abrir el dispositivo).
  const saved = useRef(device);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los guardados se encadenan: nunca dos escrituras a la vez sobre el mismo archivo.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queue.current = queue.current.then(async () => {
      const snapshot = latest.current;
      if (snapshot === saved.current) return;
      setStatus("saving");
      try {
        await saveDevice({
          version: DEVICE_FILE_VERSION,
          id,
          updatedAt: new Date().toISOString(),
          device: snapshot,
        });
        saved.current = snapshot;
        setStatus(latest.current === snapshot ? "saved" : "saving");
      } catch {
        // El agricultor sigue trabajando; el siguiente cambio reintenta.
        setStatus("error");
      }
    });
    return queue.current;
  }, [id]);

  useEffect(() => {
    latest.current = device;
    if (device === saved.current) return;
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [device, flush]);

  useEffect(() => {
    const onClose = () => void flush();
    window.addEventListener("beforeunload", onClose);
    return () => {
      window.removeEventListener("beforeunload", onClose);
      void flush();
    };
  }, [flush]);

  return { status, flush };
}
