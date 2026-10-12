import { useCallback, useEffect, useState } from "react";
import { newStoredDevice, type StoredDevice } from "../compiler/deviceFile";
import { deleteDevice, listDevices, saveDevice, type StoredEntry } from "../storage/deviceStore";
import { CropIcon, PlusIcon, RemoveIcon, WarningIcon } from "../components/Icons";
import { RecipeEditor } from "./RecipeEditor";
import "./DeviceHome.css";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then) || then <= 0) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Editado hace un momento";
  if (minutes < 60) return `Editado hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Editado hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Editado hace ${days} ${days === 1 ? "día" : "días"}`;
  return `Editado el ${new Date(then).toLocaleDateString("es-MX")}`;
}

function uniqueName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const base = "Mi dispositivo";
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Pantalla inicial: la lista de dispositivos guardados. Elegir uno (o crear uno
// nuevo) abre su editor; al volver, la lista se recarga con lo último guardado.
export function DeviceHome() {
  const [entries, setEntries] = useState<StoredEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<StoredDevice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await listDevices();
      list.sort((a, b) => {
        const ta = a.ok ? a.stored.updatedAt : "";
        const tb = b.ok ? b.stored.updatedAt : "";
        return tb.localeCompare(ta);
      });
      setEntries(list);
      setLoadError(null);
    } catch (e) {
      setEntries([]);
      setLoadError(`No se pudieron cargar tus dispositivos: ${(e as Error).message ?? e}`);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createDevice() {
    const names = (entries ?? []).flatMap((e) => (e.ok ? [e.stored.device.name] : []));
    const stored = newStoredDevice(uniqueName(names));
    try {
      // Se guarda al crearlo para que ya aparezca en la lista aunque se cierre sin tocar nada.
      await saveDevice(stored);
      setNotice(null);
    } catch (e) {
      setNotice(`No se pudo guardar el dispositivo nuevo: ${(e as Error).message ?? e}`);
    }
    setOpen(stored);
  }

  async function confirmDelete(id: string) {
    try {
      await deleteDevice(id);
      setNotice(null);
    } catch (e) {
      setNotice(`No se pudo eliminar: ${(e as Error).message ?? e}`);
    }
    setPendingDelete(null);
    await reload();
  }

  function backToList() {
    setOpen(null);
    setEntries(null);
    void reload();
  }

  if (open) {
    return <RecipeEditor key={open.id} stored={open} onBack={backToList} />;
  }

  return (
    <div className="device-home">
      <div className="device-home__top">
        <h1>Mis dispositivos</h1>
        {entries && entries.length > 0 && (
          <button className="device-home__new" onClick={() => void createDevice()}>
            <PlusIcon size={16} /> Nuevo dispositivo
          </button>
        )}
      </div>

      {notice && (
        <p className="device-home__notice">
          <WarningIcon size={16} /> {notice}
        </p>
      )}
      {loadError && (
        <p className="device-home__notice">
          <WarningIcon size={16} /> {loadError}
        </p>
      )}

      {entries === null && <p className="device-home__empty">Cargando…</p>}

      {entries && entries.length === 0 && !loadError && (
        <div className="device-home__welcome">
          <CropIcon size={36} />
          <p>Aquí aparecerán tus dispositivos. Crea el primero para registrar tu cultivo, tus sensores y tus equipos.</p>
          <button className="device-home__new device-home__new--big" onClick={() => void createDevice()}>
            <PlusIcon size={18} /> Crear mi primer dispositivo
          </button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="device-home__list">
          {entries.map((entry) =>
            entry.ok ? (
              <li key={entry.stored.id} className="device-home__card">
                <button className="device-home__open" onClick={() => setOpen(entry.stored)}>
                  <span className="device-home__name">{entry.stored.device.name.trim() || "Mi dispositivo"}</span>
                  <span className="device-home__crop">
                    <CropIcon size={14} /> {entry.stored.device.crop.trim() || "Sin cultivo todavía"}
                  </span>
                  <span className="device-home__meta">
                    {entry.stored.device.sensors.length} sensores · {entry.stored.device.actuators.length} equipos ·{" "}
                    {entry.stored.device.rules.length} reglas
                  </span>
                  <span className="device-home__meta">{timeAgo(entry.stored.updatedAt)}</span>
                </button>
                <button
                  className="device-home__remove"
                  aria-label={`Eliminar ${entry.stored.device.name}`}
                  onClick={() => setPendingDelete(entry.stored.id)}
                >
                  <RemoveIcon size={16} />
                </button>
                {pendingDelete === entry.stored.id && (
                  <div className="device-home__confirm">
                    Se borrará "{entry.stored.device.name}" y sus {entry.stored.device.rules.length} reglas. No se puede
                    deshacer.
                    <button onClick={() => void confirmDelete(entry.stored.id)}>Eliminar</button>
                    <button onClick={() => setPendingDelete(null)}>Cancelar</button>
                  </div>
                )}
              </li>
            ) : (
              <li key={entry.id} className="device-home__card device-home__card--broken">
                <div className="device-home__open">
                  <span className="device-home__name">
                    <WarningIcon size={16} /> No se pudo abrir un dispositivo
                  </span>
                  <span className="device-home__meta">{entry.error}</span>
                </div>
                <button className="device-home__remove" aria-label="Eliminar este archivo" onClick={() => setPendingDelete(entry.id)}>
                  <RemoveIcon size={16} />
                </button>
                {pendingDelete === entry.id && (
                  <div className="device-home__confirm">
                    Se eliminará este archivo dañado. No se puede deshacer.
                    <button onClick={() => void confirmDelete(entry.id)}>Eliminar</button>
                    <button onClick={() => setPendingDelete(null)}>Cancelar</button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
