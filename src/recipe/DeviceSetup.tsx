import { useRef, useState } from "react";
import { ACTUATOR_KINDS, SENSOR_KINDS } from "../compiler/catalog";
import {
  addActuator,
  addSensor,
  removeActuator,
  removeSensor,
  renameActuator,
  renameSensor,
  rulesUsing,
  suggestedName,
  type Device,
} from "../compiler/device";
import { canRegister, resolvePinConflicts } from "../compiler/pins";
import {
  ACTUATOR_KIND_ICONS,
  ArrowIcon,
  CropIcon,
  PlusIcon,
  RemoveIcon,
  RulesIcon,
  SENSOR_KIND_ICONS,
} from "../components/Icons";
import type { SaveStatus } from "./useAutosave";
import { Breadcrumb, SaveBadge } from "./PageHeader";
import "./DeviceSetup.css";

type Role = "SENSOR" | "ACTUADOR";

// Qué hace cada tipo de aparato (catalog.ts), en palabras del agricultor.
const KIND_DESCRIPTIONS: Record<string, string> = {
  SOIL_MOISTURE: "Mide la humedad de la tierra y ayuda a determinar si es necesario regar.",
  RAIN: "Detecta la presencia de lluvia para usarla en tus reglas de automatización.",
  TEMPERATURE: "Registra la temperatura del entorno o del área supervisada.",
  AIR_HUMIDITY: "Mide la humedad ambiental del cultivo o del espacio supervisado.",
  PUMP: "Suministra agua al cultivo cuando lo necesita.",
  VALVE: "Controla el paso de agua u otro fluido.",
  ALARM: "Te avisa cuando se cumplen determinadas condiciones.",
  OTHER: "Agrega dispositivos no incluidos en las opciones anteriores.",
};

interface KindOption {
  id: string;
  label: string;
  available: boolean;
  add: () => void;
}

interface AddedItem {
  id: string;
  name: string;
  kind: string;
}

// Formulario de creación del dispositivo: el agricultor da nombre al
// dispositivo, dice qué cultiva y da de alta sus sensores y equipos eligiendo
// de qué tipo son; lo que agrega aparece debajo de su tipo para renombrarlo o
// quitarlo. Nunca ve ni elige un pin: los asigna pins.ts y los conflictos se
// corrigen solos.
export function DeviceSetup({
  device,
  creating,
  saveStatus,
  onChange,
  onBack,
  onDone,
}: {
  device: Device;
  creating: boolean;
  saveStatus: SaveStatus;
  onChange: (device: Device) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  // Quitar un aparato que usan reglas pide confirmación en línea (sin diálogos
  // del navegador) porque también se borran esas reglas.
  const [pendingRemoval, setPendingRemoval] = useState<{ role: Role; id: string } | null>(null);
  // "Continuar" no se deshabilita: si falta el cultivo, lo pide en su campo.
  const [cropMissing, setCropMissing] = useState(false);
  const cropInput = useRef<HTMLInputElement>(null);

  // Cualquier cambio pasa por resolvePinConflicts como resguardo.
  const update = (next: Device | null) => {
    if (next) onChange(resolvePinConflicts(next));
  };

  function requestRemoval(role: Role, id: string) {
    if (rulesUsing(device, id).length === 0) {
      confirmRemoval(role, id);
    } else {
      setPendingRemoval({ role, id });
    }
  }

  function confirmRemoval(role: Role, id: string) {
    update(role === "SENSOR" ? removeSensor(device, id) : removeActuator(device, id));
    setPendingRemoval(null);
  }

  function rename(role: Role, id: string, name: string) {
    onChange(role === "SENSOR" ? renameSensor(device, id, name) : renameActuator(device, id, name));
  }

  function continueToRules() {
    if (device.crop.trim() === "") {
      setCropMissing(true);
      cropInput.current?.focus();
      return;
    }
    onDone();
  }

  const showCropError = cropMissing && device.crop.trim() === "";

  const sensorKinds: KindOption[] = SENSOR_KINDS.map((k) => ({
    id: k.id,
    label: k.label,
    available: canRegister(device, { role: "SENSOR", kind: k.id }),
    add: () => update(addSensor(device, k.id, suggestedName(device, "SENSOR", k.id))),
  }));

  const actuatorKinds: KindOption[] = ACTUATOR_KINDS.map((k) => ({
    id: k.id,
    label: k.label,
    available: canRegister(device, { role: "ACTUADOR" }),
    add: () => update(addActuator(device, k.id, suggestedName(device, "ACTUADOR", k.id))),
  }));

  function apparatusCard(role: Role, title: string, hint: string, kinds: KindOption[], items: AddedItem[]) {
    const isSensor = role === "SENSOR";
    const icons = isSensor ? SENSOR_KIND_ICONS : ACTUATOR_KIND_ICONS;
    const full = isSensor
      ? "Este dispositivo ya no tiene espacio para otro sensor de este tipo."
      : "Este dispositivo ya no tiene espacio para otro equipo.";
    const headingId = `device-setup-${isSensor ? "sensors" : "actuators"}`;

    return (
      <section className="device-setup__card" aria-labelledby={headingId}>
        <div className="device-setup__card-head">
          <h2 id={headingId}>{title}</h2>
          <span className="device-setup__count">
            {items.length} {items.length === 1 ? "agregado" : "agregados"}
          </span>
        </div>
        <p className="device-setup__card-hint">{hint}</p>

        <ul className="device-setup__kinds">
          {kinds.map((k) => {
            const Icon = icons[k.id] ?? CropIcon;
            const added = items.filter((item) => item.kind === k.id);
            return (
              <li key={k.id} className="device-setup__kind">
                <span className="device-setup__kind-icon">
                  <Icon size={20} />
                </span>
                <div className="device-setup__kind-text">
                  <h3>{k.label}</h3>
                  <p>{KIND_DESCRIPTIONS[k.id]}</p>
                </div>
                <button
                  className="device-setup__add"
                  disabled={!k.available}
                  title={k.available ? `Agregar ${k.label.toLowerCase()}` : full}
                  aria-label={`Agregar ${k.label.toLowerCase()}`}
                  onClick={k.add}
                >
                  <PlusIcon size={18} />
                </button>

                {added.length > 0 && (
                  <ul className="device-setup__items">
                    {added.map((item) => {
                      const used = rulesUsing(device, item.id).length;
                      return (
                        <li key={item.id} className="device-setup__item">
                          <input
                            type="text"
                            value={item.name}
                            aria-label={`Nombre del ${isSensor ? "sensor" : "equipo"} (${k.label})`}
                            onChange={(e) => rename(role, item.id, e.target.value)}
                            onBlur={(e) => {
                              if (e.target.value.trim() === "") rename(role, item.id, suggestedName(device, role, item.kind));
                            }}
                          />
                          <button
                            className="device-setup__remove"
                            onClick={() => requestRemoval(role, item.id)}
                            aria-label={`Quitar ${item.name}`}
                            title="Quitar"
                          >
                            <RemoveIcon size={16} />
                          </button>
                          {pendingRemoval?.id === item.id && (
                            <div className="device-setup__confirm">
                              También se {used === 1 ? "borrará 1 regla que lo usa" : `borrarán ${used} reglas que lo usan`}.
                              <button onClick={() => confirmRemoval(role, item.id)}>Quitar de todos modos</button>
                              <button onClick={() => setPendingRemoval(null)}>Cancelar</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="device-setup">
      <Breadcrumb current={creating ? "Crear dispositivo" : device.name.trim() || "Mi dispositivo"} onBack={onBack} />

      <div className="page-heading">
        <h1>{creating ? "Formulario de creación del dispositivo" : "Editar dispositivo"}</h1>
        <p>Cuéntanos qué deseas controlar y agrega los sensores y equipos que cuidarán de tu cultivo.</p>
      </div>

      <section className="device-setup__card" aria-labelledby="device-setup-data">
        <div className="device-setup__card-head">
          <h2 id="device-setup-data">Datos del dispositivo</h2>
          <SaveBadge status={saveStatus} />
        </div>
        <div className="device-setup__fields">
          <div className="device-setup__field">
            <label htmlFor="device-setup-name">Nombre del dispositivo</label>
            <input
              id="device-setup-name"
              type="text"
              value={device.name}
              placeholder="Mi dispositivo"
              aria-describedby="device-setup-name-help"
              onChange={(e) => onChange({ ...device, name: e.target.value })}
            />
            <span id="device-setup-name-help" className="device-setup__help">
              Elige un nombre para identificarlo fácilmente.
            </span>
          </div>
          <div className="device-setup__field">
            <label htmlFor="device-setup-crop">Cultivo o proceso que se desea controlar</label>
            <input
              id="device-setup-crop"
              ref={cropInput}
              type="text"
              value={device.crop}
              placeholder="Escribe tu cultivo o proceso agrícola"
              aria-describedby="device-setup-crop-help"
              aria-invalid={showCropError}
              onChange={(e) => onChange({ ...device, crop: e.target.value })}
            />
            <span
              id="device-setup-crop-help"
              className={`device-setup__help${showCropError ? " device-setup__help--error" : ""}`}
            >
              {showCropError
                ? "Escribe tu cultivo o proceso para continuar a tus reglas."
                : "Ejemplos: caña de azúcar o invernadero de chile."}
            </span>
          </div>
        </div>
      </section>

      <div className="device-setup__columns">
        {apparatusCard("SENSOR", "Mis sensores", "Agrega lo que necesitas medir en tu cultivo.", sensorKinds, device.sensors)}
        {apparatusCard(
          "ACTUADOR",
          "Mis equipos",
          "Agrega los equipos que deseas activar o controlar.",
          actuatorKinds,
          device.actuators
        )}
      </div>

      <footer className="device-setup__footer">
        <div className="device-setup__next">
          <span className="device-setup__next-icon">
            <RulesIcon size={20} />
          </span>
          <div className="device-setup__next-text">
            <strong>Después, dale vida a tu automatización</strong>
            <span>Define condiciones para regar, activar equipos o recibir avisos.</span>
          </div>
        </div>
        <button className="device-setup__done" onClick={continueToRules}>
          Continuar a mis reglas <ArrowIcon size={16} />
        </button>
      </footer>
    </div>
  );
}
