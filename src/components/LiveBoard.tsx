import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { parseAgroLine } from "../compiler/agroProtocol";
import { deviceRegistry, type Device } from "../compiler/device";
import { detenerMonitor, escucharMonitor, iniciarMonitor, type Placa } from "./compileEngine";
import { WarningIcon } from "./Icons";
import "./LiveBoard.css";

// Lo que el ESP32 está haciendo ahora mismo, leído por el cable USB: lo que mide
// el sensor, qué reglas se cumplen y qué LED están encendidos.

const STALE_MS = 5000;

// El color de un LED sale de su nombre ("LED 1 rojo"); cualquier otro equipo usa el acento.
function ledColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("roj")) return "#ff5a4d";
  if (n.includes("verd")) return "#5fd35f";
  if (n.includes("azul")) return "#4da3ff";
  if (n.includes("amar")) return "#ffd84d";
  return "var(--color-accent)";
}

type Link = "waiting" | "live" | "lost";

export function LiveBoard({ device, board, paused }: { device: Device; board: Placa | null; paused: boolean }) {
  const registry = useMemo(() => deviceRegistry(device), [device]);
  const [readings, setReadings] = useState<Record<string, number>>({});
  const [holds, setHolds] = useState<Record<string, boolean>>({});
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);

  const port = board?.puerto ?? null;

  useEffect(() => {
    if (!port || paused) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    setProblem(null);
    // Conexión nueva (p. ej. tras subir un programa): se vuelve a esperar el primer dato.
    setLastSeen(null);
    (async () => {
      try {
        stop = await escucharMonitor({
          onLinea: (line) => {
            const event = parseAgroLine(line);
            if (!event) return;
            setLastSeen(Date.now());
            if (event.kind === "LEER") setReadings((p) => ({ ...p, [event.id]: event.value }));
            else if (event.kind === "REGLA") setHolds((p) => ({ ...p, [event.id]: event.holds }));
            else if (event.kind === "ENCENDER") setOn((p) => ({ ...p, [event.id]: true }));
            else if (event.kind === "APAGAR") setOn((p) => ({ ...p, [event.id]: false }));
            else if (event.kind === "ERROR") setProblem(event.message);
          },
          onError: setProblem,
        });
        if (cancelled) return stop();
        await iniciarMonitor(port);
      } catch (e) {
        setProblem(typeof e === "string" ? e : ((e as Error).message ?? String(e)));
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
      void detenerMonitor().catch(() => {});
    };
  }, [port, paused]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const link: Link = lastSeen === null ? "waiting" : now - lastSeen > STALE_MS ? "lost" : "live";
  // Equipos que alguna regla enciende/apaga: los demás no se dibujan.
  const usedActuators = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of device.rules) for (const a of rule.actions) if (a.kind === "StateAction") ids.add(a.actuator);
    return registry.actuators.filter((a) => ids.has(a.id));
  }, [device, registry]);

  if (!board) {
    return <p className="live__empty">Conecta el ESP32 con el cable USB para ver aquí lo que está pasando en vivo.</p>;
  }

  return (
    <div className="live">
      <div className={`live__link live__link--${link}`} role="status">
        <span className="live__dot" />
        {problem ? (
          <>
            <WarningIcon size={16} /> {problem}
          </>
        ) : link === "live" ? (
          "En vivo desde el ESP32"
        ) : link === "waiting" ? (
          paused ? "Subiendo el programa…" : "Esperando datos de la placa… (si BOOT sigue pulsado, suéltalo y pulsa EN)"
        ) : (
          "Sin señal del ESP32 (revisa el cable)"
        )}
      </div>

      <div className="live__grid">
        <section>
          <h3>Lo que mide</h3>
          <div className="live__sensors">
            {registry.sensors.map((s) => (
              <div key={s.id} className="live__sensor">
                <span className="live__value">{s.id in readings ? readings[s.id].toFixed(1) : "—"}</span>
                <span className="live__unit">{s.unit}</span>
                <span className="live__name">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Reglas</h3>
          <ul className="live__rules">
            {device.rules.map((r) => (
              <li key={r.id} className={holds[r.id] ? "holds" : ""}>
                <span className="live__check">{r.id in holds ? (holds[r.id] ? "✓" : "✗") : "·"}</span>
                <span>{r.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Lo que enciende</h3>
          <div className="live__leds">
            {usedActuators.map((a) => (
              <div key={a.id} className={`live__led ${on[a.id] ? "live__led--on" : ""}`} style={{ "--c": ledColor(a.label) } as CSSProperties}>
                <span className="live__bulb" />
                <span>{a.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
