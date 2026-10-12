import { useState } from "react";
import { ACTUATOR_KINDS, SENSOR_KINDS, findActuatorKind, findSensorKind } from "../compiler/catalog";
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
import { ACTUATOR_KIND_ICONS, ArrowIcon, CropIcon, PlusIcon, RemoveIcon, SENSOR_KIND_ICONS } from "../components/Icons";
import "./DeviceSetup.css";

// Pantalla de registro: el agricultor da nombre al dispositivo, dice qué cultiva
// y da de alta sus sensores y equipos eligiendo de qué tipo son. Nunca ve ni
// elige un pin: los asigna pins.ts y los conflictos se corrigen solos.
export function DeviceSetup({
  device,
  onChange,
  onDone,
}: {
  device: Device;
  onChange: (device: Device) => void;
  onDone: () => void;
}) {
  // Quitar un aparato que usan reglas pide confirmación en línea (sin diálogos
  // del navegador) porque también se borran esas reglas.
  const [pendingRemoval, setPendingRemoval] = useState<{ role: "SENSOR" | "ACTUADOR"; id: string } | null>(null);

  // Cualquier cambio pasa por resolvePinConflicts como resguardo.
  const update = (next: Device | null) => {
    if (next) onChange(resolvePinConflicts(next));
  };

  function requestRemoval(role: "SENSOR" | "ACTUADOR", id: string) {
    if (rulesUsing(device, id).length === 0) {
      confirmRemoval(role, id);
    } else {
      setPendingRemoval({ role, id });
    }
  }

  function confirmRemoval(role: "SENSOR" | "ACTUADOR", id: string) {
    update(role === "SENSOR" ? removeSensor(device, id) : removeActuator(device, id));
    setPendingRemoval(null);
  }

  const canContinue = device.crop.trim() !== "";

  return (
    <div className="device-setup">
      <section className="device-setup__section">
        <h2>Tu dispositivo</h2>
        <label className="device-setup__field">
          <span>Nombre del dispositivo</span>
          <input
            type="text"
            value={device.name}
            placeholder="Ej. Parcela del fondo"
            onChange={(e) => onChange({ ...device, name: e.target.value })}
          />
        </label>
        <label className="device-setup__field">
          <span>
            <CropIcon size={16} /> ¿Qué cultivas o qué proceso quieres controlar?
          </span>
          <input
            type="text"
            value={device.crop}
            placeholder="Ej. Caña de azúcar, invernadero de chile…"
            onChange={(e) => onChange({ ...device, crop: e.target.value })}
          />
        </label>
      </section>

      <section className="device-setup__section">
        <h2>Mis sensores</h2>
        <p className="device-setup__hint">Lo que mide tu terreno. Elige qué tipo de sensor tienes y ponle el nombre que quieras.</p>

        {device.sensors.length > 0 && (
          <ul className="device-setup__list">
            {device.sensors.map((s) => {
              const kind = findSensorKind(s.kind);
              const Icon = SENSOR_KIND_ICONS[s.kind] ?? CropIcon;
              const used = rulesUsing(device, s.id).length;
              return (
                <li key={s.id} className="device-setup__item">
                  <Icon size={18} className="device-setup__item-icon" />
                  <input
                    type="text"
                    value={s.name}
                    aria-label={`Nombre del sensor ${kind?.label ?? ""}`}
                    onChange={(e) => onChange(renameSensor(device, s.id, e.target.value))}
                    onBlur={(e) => {
                      if (e.target.value.trim() === "") onChange(renameSensor(device, s.id, suggestedName(device, "SENSOR", s.kind)));
                    }}
                  />
                  <span className="device-setup__kind">{kind?.label}</span>
                  <button className="device-setup__remove" onClick={() => requestRemoval("SENSOR", s.id)} aria-label={`Quitar ${s.name}`}>
                    <RemoveIcon size={16} />
                  </button>
                  {pendingRemoval?.id === s.id && (
                    <div className="device-setup__confirm">
                      También se {used === 1 ? "borrará 1 regla que lo usa" : `borrarán ${used} reglas que lo usan`}.
                      <button onClick={() => confirmRemoval("SENSOR", s.id)}>Quitar de todos modos</button>
                      <button onClick={() => setPendingRemoval(null)}>Cancelar</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="device-setup__kinds">
          {SENSOR_KINDS.map((k) => {
            const Icon = SENSOR_KIND_ICONS[k.id] ?? CropIcon;
            const available = canRegister(device, { role: "SENSOR", kind: k.id });
            return (
              <button
                key={k.id}
                disabled={!available}
                title={available ? undefined : "Este dispositivo ya no tiene espacio para otro sensor de este tipo."}
                onClick={() => update(addSensor(device, k.id, suggestedName(device, "SENSOR", k.id)))}
              >
                <Icon size={20} />
                <span>{k.label}</span>
                <PlusIcon size={14} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="device-setup__section">
        <h2>Mis equipos</h2>
        <p className="device-setup__hint">Lo que enciende o apaga tu dispositivo: bombas, válvulas, alarmas…</p>

        {device.actuators.length > 0 && (
          <ul className="device-setup__list">
            {device.actuators.map((a) => {
              const kind = findActuatorKind(a.kind);
              const Icon = ACTUATOR_KIND_ICONS[a.kind] ?? CropIcon;
              const used = rulesUsing(device, a.id).length;
              return (
                <li key={a.id} className="device-setup__item">
                  <Icon size={18} className="device-setup__item-icon" />
                  <input
                    type="text"
                    value={a.name}
                    aria-label={`Nombre del equipo ${kind?.label ?? ""}`}
                    onChange={(e) => onChange(renameActuator(device, a.id, e.target.value))}
                    onBlur={(e) => {
                      if (e.target.value.trim() === "") onChange(renameActuator(device, a.id, suggestedName(device, "ACTUADOR", a.kind)));
                    }}
                  />
                  <span className="device-setup__kind">{kind?.label}</span>
                  <button className="device-setup__remove" onClick={() => requestRemoval("ACTUADOR", a.id)} aria-label={`Quitar ${a.name}`}>
                    <RemoveIcon size={16} />
                  </button>
                  {pendingRemoval?.id === a.id && (
                    <div className="device-setup__confirm">
                      También se {used === 1 ? "borrará 1 regla que lo usa" : `borrarán ${used} reglas que lo usan`}.
                      <button onClick={() => confirmRemoval("ACTUADOR", a.id)}>Quitar de todos modos</button>
                      <button onClick={() => setPendingRemoval(null)}>Cancelar</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="device-setup__kinds">
          {ACTUATOR_KINDS.map((k) => {
            const Icon = ACTUATOR_KIND_ICONS[k.id] ?? CropIcon;
            const available = canRegister(device, { role: "ACTUADOR" });
            return (
              <button
                key={k.id}
                disabled={!available}
                title={available ? undefined : "Este dispositivo ya no tiene espacio para otro equipo."}
                onClick={() => update(addActuator(device, k.id, suggestedName(device, "ACTUADOR", k.id)))}
              >
                <Icon size={20} />
                <span>{k.label}</span>
                <PlusIcon size={14} />
              </button>
            );
          })}
        </div>
      </section>

      <div className="device-setup__footer">
        {!canContinue && <p className="device-setup__hint">Escribe qué cultivas para continuar.</p>}
        <button className="device-setup__done" onClick={onDone} disabled={!canContinue}>
          Continuar a mis reglas <ArrowIcon size={16} />
        </button>
      </div>
    </div>
  );
}
