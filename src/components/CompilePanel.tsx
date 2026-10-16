import { useEffect, useRef, useState } from "react";
import {
  compilar,
  compilerAvailable,
  escucharCompilacion,
  prepararEntorno,
  verificarEntorno,
  type Etapa,
  type Progreso,
  type ResultadoCompilacion,
} from "./compileEngine";
import { VerifiedIcon, WarningIcon } from "./Icons";
import "./CompilePanel.css";

const MAX_LOG_LINES = 400;

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; result: ResultadoCompilacion }
  | { kind: "error"; message: string };

function stageText(stage: Etapa | null, progress: Progreso | null): string {
  switch (stage) {
    case "descargando": {
      const pct = progress && progress.total > 0 ? ` ${Math.round((progress.hecho / progress.total) * 100)}%` : "";
      return `Descargando herramientas…${pct}`;
    }
    case "instalando":
      return "Instalando el soporte para ESP32… (puede tardar varios minutos)";
    default:
      return "Compilando…";
  }
}

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Resumen corto de cuánto del ESP32 usa el programa: la memoria donde se guarda
// el programa y la RAM (memoria de trabajo). Los KB van en `detail`, que se ve
// como texto emergente.
function sizeSummary(result: ResultadoCompilacion): { text: string; detail: string } {
  const parts: string[] = [];
  const details: string[] = [];
  if (result.porcentaje !== null) parts.push(`${result.porcentaje}% de la memoria del ESP32`);
  if (result.bytes !== null) details.push(`Programa: ${kb(result.bytes)}`);
  if (result.ram_porcentaje !== null) parts.push(`${result.ram_porcentaje}% de la RAM`);
  if (result.ram_bytes !== null) details.push(`RAM: ${kb(result.ram_bytes)}`);
  return {
    text: parts.length > 0 ? `Listo · el programa usa ${parts.join(" y ")}` : "Listo · el programa compila sin errores",
    detail: details.join(" · "),
  };
}

export function CompilePanel({ code }: { code: string }) {
  const available = compilerAvailable();
  // null = todavía no se sabe; false = falta descargar herramientas.
  const [ready, setReady] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Código con el que se hizo la última compilación: si el agricultor cambia
  // algo después, el resultado ya no corresponde al programa actual.
  const [compiledCode, setCompiledCode] = useState<string | null>(null);
  const [stage, setStage] = useState<Etapa | null>(null);
  const [progress, setProgress] = useState<Progreso | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    verificarEntorno()
      .then((env) => !cancelled && setReady(env.herramienta && env.esp32))
      .catch(() => !cancelled && setReady(false));
    return () => {
      cancelled = true;
    };
  }, [available]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const working = status.kind === "working";
  // Ya hay un resultado, pero de un programa distinto al de ahora (también
  // cubre cambios hechos mientras compilaba).
  const stale = (status.kind === "done" || status.kind === "error") && compiledCode !== code;

  const run = async () => {
    setCompiledCode(code);
    setStatus({ kind: "working" });
    setStage(ready ? "compilando" : "descargando");
    setProgress(null);
    setLog([]);
    let stop: (() => void) | null = null;
    try {
      stop = await escucharCompilacion({
        onEtapa: setStage,
        onProgreso: setProgress,
        onLinea: (line) => setLog((prev) => [...prev, line].slice(-MAX_LOG_LINES)),
      });
      if (!ready) {
        await prepararEntorno();
        setReady(true);
      }
      const result = await compilar(code);
      setStatus({ kind: "done", result });
    } catch (e) {
      setStatus({ kind: "error", message: typeof e === "string" ? e : ((e as Error).message ?? String(e)) });
    } finally {
      stop?.();
    }
  };

  const hasLog = log.length > 0;

  return (
    <div className="compile-panel">
      <div className="compile-panel__bar">
        <button className="compile-panel__button" onClick={run} disabled={!available || working || !code}>
          {ready === false ? "Descargar y compilar" : stale ? "Volver a compilar" : "Compilar para ESP32"}
        </button>

        {!available && <span className="compile-panel__hint">Disponible en la app de escritorio.</span>}
        {available && ready === false && status.kind === "idle" && (
          <span className="compile-panel__hint">
            La primera vez hay que descargar las herramientas del ESP32 (unos 2 GB y 6 GB en disco; puede tardar bastante).
          </span>
        )}
        {working && (
          <span className="compile-panel__hint" role="status">
            {stageText(stage, progress)}
          </span>
        )}
        {stale && (
          <span className="compile-panel__stale" role="status">
            <WarningIcon size={16} /> Hiciste cambios: hay que volver a compilar el programa.
          </span>
        )}
        {!stale && status.kind === "done" && (
          <span className="compile-panel__ok" role="status" title={sizeSummary(status.result).detail}>
            <VerifiedIcon size={16} /> {sizeSummary(status.result).text}
          </span>
        )}
        {!stale && status.kind === "error" && (
          <span className="compile-panel__error" role="status">
            <WarningIcon size={16} /> No se pudo compilar.
          </span>
        )}
      </div>

      {working && stage === "descargando" && progress && progress.total > 0 && (
        <progress className="compile-panel__progress" value={progress.hecho} max={progress.total} />
      )}

      {!stale && (hasLog || status.kind === "error") && (
        <details className="compile-panel__details" open={status.kind === "error"}>
          <summary>Ver detalles</summary>
          <pre className="compile-panel__log">
            {status.kind === "error" && !hasLog ? status.message.trim() : log.join("\n").trim()}
            <div ref={logEnd} />
          </pre>
        </details>
      )}
    </div>
  );
}
