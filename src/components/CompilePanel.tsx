import { useEffect, useRef, useState } from "react";
import {
  compilar,
  compilerAvailable,
  detectarPlacas,
  escucharCompilacion,
  prepararEntorno,
  subir,
  verificarEntorno,
  type Etapa,
  type Placa,
  type Progreso,
  type ResultadoCompilacion,
} from "./compileEngine";
import { VerifiedIcon, WarningIcon } from "./Icons";
import "./CompilePanel.css";

const MAX_LOG_LINES = 400;
const BOARD_POLL_MS = 3000;

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "uploaded" }
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
    case "librerias":
      return "Instalando la librería del sensor…";
    case "subiendo":
      return "Subiendo el programa al ESP32… no lo desconectes";
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

// esptool no puede entrar al modo de descarga si BOOT no está pulsado.
function isBootProblem(message: string): boolean {
  return /wrong boot mode|failed to connect|no serial data received|timed out waiting for packet/i.test(message);
}

export function CompilePanel({
  code,
  onBoardChange,
  onBusyChange,
}: {
  code: string;
  // Avisan al contenedor de la placa detectada y de cuándo el puerto está ocupado
  // (compilando o subiendo), para que el monitor en vivo se aparte del camino.
  onBoardChange?: (board: Placa | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
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
  // Placas ESP32 conectadas por USB (se revisa solo cada pocos segundos).
  const [boards, setBoards] = useState<Placa[]>([]);
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

  const working = status.kind === "working";

  useEffect(() => {
    if (!available || !ready || working) return;
    let cancelled = false;
    const poll = () =>
      detectarPlacas()
        .then((found) => !cancelled && setBoards((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found)))
        .catch(() => !cancelled && setBoards([]));
    poll();
    const timer = setInterval(poll, BOARD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [available, ready, working]);

  const board = boards[0] ?? null;
  useEffect(() => {
    onBoardChange?.(board);
  }, [board, onBoardChange]);
  useEffect(() => {
    onBusyChange?.(working);
  }, [working, onBusyChange]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log]);

  // Fase de la subida según lo que imprime esptool: mientras conecta hay que
  // mantener BOOT; en cuanto empieza a escribir ya se puede soltar.
  const writing = log.some((l) => l.includes("Writing at"));

  // Ya hay un resultado, pero de un programa distinto al de ahora (también
  // cubre cambios hechos mientras compilaba).
  const stale = (status.kind === "done" || status.kind === "uploaded" || status.kind === "error") && compiledCode !== code;

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

  const upload = async () => {
    if (!board) return;
    setCompiledCode(code);
    setStatus({ kind: "working" });
    setStage("compilando");
    setProgress(null);
    setLog([]);
    let stop: (() => void) | null = null;
    try {
      stop = await escucharCompilacion({
        onEtapa: setStage,
        onProgreso: setProgress,
        onLinea: (line) => setLog((prev) => [...prev, line].slice(-MAX_LOG_LINES)),
      });
      await subir(code, board);
      setStatus({ kind: "uploaded" });
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

        {available && ready && (
          <button className="compile-panel__button" onClick={upload} disabled={working || !code || boards.length === 0}>
            Subir al ESP32
          </button>
        )}

        {!available && <span className="compile-panel__hint">Disponible en la app de escritorio.</span>}
        {available && ready === false && status.kind === "idle" && (
          <span className="compile-panel__hint">
            La primera vez hay que descargar las herramientas del ESP32 (unos 2 GB y 6 GB en disco; puede tardar bastante).
          </span>
        )}
        {available && ready && !working && (
          <span className="compile-panel__hint" role="status">
            {boards.length > 0
              ? `${boards[0].nombre} conectado (${boards[0].puerto})`
              : "Conecta el ESP32 con el cable USB"}
          </span>
        )}
        {working && (
          <span className="compile-panel__hint" role="status">
            {stage === "subiendo"
              ? writing
                ? "Subiendo… ya puedes soltar BOOT"
                : "Conectando con la placa… mantén pulsado BOOT"
              : stageText(stage, progress)}
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
        {!stale && status.kind === "uploaded" && (
          <span className="compile-panel__ok" role="status">
            <VerifiedIcon size={16} /> Programa cargado en el ESP32 · suelta BOOT para que arranque
          </span>
        )}
        {!stale && status.kind === "error" && (
          <span className="compile-panel__error" role="status">
            <WarningIcon size={16} />{" "}
            {stage === "subiendo" && isBootProblem(status.message)
              ? "No se pudo conectar con la placa. Mantén pulsado BOOT y vuelve a pulsar «Subir al ESP32»."
              : `No se pudo ${stage === "subiendo" ? "subir al ESP32" : "compilar"}.`}
          </span>
        )}
      </div>

      {available && ready && board && !working && status.kind !== "uploaded" && (
        <p className="compile-panel__boot">
          <strong>Para subir:</strong> mantén pulsado el botón <strong>BOOT</strong> de la placa, pulsa «Subir al ESP32» y suéltalo cuando
          empiece a subir.
        </p>
      )}

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
