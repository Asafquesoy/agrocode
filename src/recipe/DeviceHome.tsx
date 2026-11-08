import { useCallback, useEffect, useState } from "react";
import { newStoredDevice, type StoredDevice } from "../compiler/deviceFile";
import { deleteDevice, listDevices, saveDevice, type StoredEntry } from "../storage/deviceStore";
import { ArrowIcon, ConnectIcon, CropIcon, PlusIcon, RemoveIcon, RulesIcon, WarningIcon } from "../components/Icons";
import { RecipeEditor } from "./RecipeEditor";
// Foto de Marc Pell en Unsplash (licencia Unsplash: uso libre, sin atribución obligatoria).
import fieldPhoto from "../assets/inicio-campo.jpg";
import "./DeviceHome.css";

const STEPS = [
  {
    Icon: CropIcon,
    title: "Cuéntanos qué cultivas",
    text: "Indica el cultivo o proceso agrícola que quieres controlar. Será el punto de partida de tu dispositivo.",
    example: "Por ejemplo: un cultivo de tomates",
  },
  {
    Icon: ConnectIcon,
    title: "Agrega tus sensores y equipos",
    text: "Elige sensores para medir las condiciones del entorno y equipos que puedas activar o desactivar.",
    example: "Por ejemplo: humedad y riego",
  },
  {
    Icon: RulesIcon,
    title: "Arma tus reglas",
    text: "Define condiciones para automatizar acciones: cuándo regar, encender un equipo o emitir una alerta.",
    example: "Si baja la humedad, activa el riego",
  },
];

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

// Pantalla inicial: la bienvenida sale siempre al abrir la app (y mientras no haya
// dispositivos); desde ahí se pasa a la lista de dispositivos guardados. Elegir uno
// (o crear uno nuevo) abre su editor; al volver, la lista se recarga con lo último guardado.
export function DeviceHome() {
  const [entries, setEntries] = useState<StoredEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<StoredDevice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(true);

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
    // Al volver del editor se llega a la lista, no otra vez a la bienvenida.
    setWelcome(false);
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

  const showWelcome = entries !== null && !loadError && (welcome || entries.length === 0);
  const count = entries?.length ?? 0;

  return (
    <div className="device-home">
      <div className="device-home__top">
        <div className="device-home__heading">
          <h1>Mis dispositivos</h1>
          <p>Un lugar para conectar tu cultivo, monitorear su entorno y automatizar su cuidado.</p>
        </div>
        {!showWelcome && entries && entries.length > 0 && (
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

      {showWelcome && (
        <>
          <section className="device-home__hero" aria-labelledby="device-home-welcome">
            <div className="device-home__hero-text">
              <p className="device-home__eyebrow">Tu campo, más conectado</p>
              {count === 0 ? (
                <>
                  <h2 id="device-home-welcome">Aún no tienes dispositivos</h2>
                  <p className="device-home__lead">
                    Crea tu primer dispositivo para registrar tu cultivo, conectar sensores y equipos, y empezar a cuidar
                    de tu campo desde un solo lugar.
                  </p>
                  <button className="device-home__new" onClick={() => void createDevice()}>
                    <PlusIcon size={16} /> Crear mi primer dispositivo
                  </button>
                </>
              ) : (
                <>
                  <h2 id="device-home-welcome">Qué gusto verte de nuevo</h2>
                  <p className="device-home__lead">
                    Tienes {count} {count === 1 ? "dispositivo guardado" : "dispositivos guardados"}. Entra para revisar
                    tu cultivo, tus sensores y tus reglas, o crea uno nuevo.
                  </p>
                  <div className="device-home__actions">
                    <button className="device-home__new" onClick={() => setWelcome(false)}>
                      Ver mis dispositivos <ArrowIcon size={16} />
                    </button>
                    <button className="device-home__secondary" onClick={() => void createDevice()}>
                      <PlusIcon size={16} /> Nuevo dispositivo
                    </button>
                  </div>
                </>
              )}
            </div>
            <img className="device-home__photo" src={fieldPhoto} alt="" />
          </section>

          <section className="device-home__guide" aria-labelledby="device-home-steps">
            <div className="device-home__guide-head">
              <h2 id="device-home-steps">De tu cultivo a la automatización</h2>
              <p>Tres pasos para empezar, a tu ritmo.</p>
            </div>
            <ol className="device-home__steps">
              {STEPS.map(({ Icon, title, text, example }, i) => (
                <li key={title}>
                  <div className="device-home__step-top">
                    <span className="device-home__step-icon">
                      <Icon size={20} />
                    </span>
                    <span className="device-home__step-number">Paso {i + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <p className="device-home__step-example">{example}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {!showWelcome && entries && entries.length > 0 && (
        <ul className="device-home__list">
          {entries.map((entry) =>
            entry.ok ? (
              <li key={entry.stored.id} className="device-home__card">
                <button className="device-home__open" onClick={() => setOpen(entry.stored)}>
                  <span className="device-home__name">{entry.stored.device.name.trim() || "Mi dispositivo"}</span>
                  <span className="device-home__crop">
                    <CropIcon size={14} />
                    <span>{entry.stored.device.crop.trim() || "Sin cultivo todavía"}</span>
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
          <li className="device-home__add">
            <button onClick={() => void createDevice()}>
              <PlusIcon size={20} /> Nuevo dispositivo
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
