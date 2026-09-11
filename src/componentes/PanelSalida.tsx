import { useMemo, useState, type ReactNode } from "react";
import type { Programa } from "../core/ast";
import type { ErrorSemantico } from "../core/errores";
import { verificarPrograma, type ResultadoReglaAnalisis } from "../core/analizadorTipos";
import { programaATexto } from "../core/lenguaje";
import { parsearPrograma } from "../core/parser";
import { generarCpp } from "../core/generadorCpp";
import { IconoAdvertencia } from "./Iconos";
import { LineaCpp, LineaLenguaje } from "./ResaltadoCodigo";
import { PanelEvidencia } from "./PanelEvidencia";
import "./PanelSalida.css";

type Pestana = "lenguaje" | "tipos" | "cpp" | "escribir" | "evidencia";

function hayErroresBloqueantes(analisis: ResultadoReglaAnalisis[]): boolean {
  return analisis.some((r) => r.errores.some((e) => e.categoria !== "ADVERTENCIA"));
}

function contarErrores(analisis: ResultadoReglaAnalisis[]): number {
  return analisis.reduce((total, r) => total + r.errores.filter((e) => e.categoria !== "ADVERTENCIA").length, 0);
}

// Diagnóstico de una regla en el formato que pide la Actividad 5:
// "Expresión válida / Tipos compatibles / Resultado: X" o
// "ERROR SEMÁNTICO [categoría] — mensaje (regla aplicada)".
function ListaDiagnostico({ analisis }: { analisis: ResultadoReglaAnalisis[] }) {
  return (
    <ul className="panel-salida__lista-tipos">
      {analisis.map((r) => {
        const errores = r.errores.filter((e: ErrorSemantico) => e.categoria !== "ADVERTENCIA");
        const advertencias = r.errores.filter((e: ErrorSemantico) => e.categoria === "ADVERTENCIA");
        return (
          <li key={r.reglaId} className={errores.length ? "error" : "ok"}>
            <div className="panel-salida__diag-cabecera">
              <span className="panel-salida__diag-etiqueta">{errores.length ? "Error" : "Bien"}</span>
              <strong>{r.reglaId}</strong>
            </div>
            {errores.length === 0 && (
              <span>
                Expresión válida. Tipos compatibles.
                {r.tipoInferido && (
                  <>
                    {" "}
                    Resultado: <strong>{r.tipoInferido}</strong>.
                  </>
                )}
                {r.reglasAplicadas.length > 0 && <> Regla aplicada: {r.reglasAplicadas.join(", ")}.</>}
              </span>
            )}
            {errores.length > 0 && (
              <ul>
                {errores.map((err, i) => (
                  <li key={i}>
                    <strong>[{err.categoria}]</strong> — {err.mensaje}{" "}
                    <em>
                      (regla {err.regla}
                      {err.linea ? `, línea ${err.linea}` : ""})
                    </em>
                  </li>
                ))}
              </ul>
            )}
            {advertencias.length > 0 && (
              <ul className="panel-salida__advertencias">
                {advertencias.map((adv, i) => (
                  <li key={i}>
                    AVISO — {adv.mensaje} <em>(regla {adv.regla})</em>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BloqueCodigo({ lineas, resaltar }: { lineas: string[]; resaltar: (texto: string) => ReactNode }) {
  return (
    <pre className="panel-salida__codigo">
      {lineas.map((linea, i) => (
        <span key={i} className="panel-salida__linea">
          <span className="panel-salida__num">{i + 1}</span>
          <span className="panel-salida__texto">{resaltar(linea) || " "}</span>
        </span>
      ))}
    </pre>
  );
}

// Pestaña "Escribir": recibe texto suelto del lenguaje intermedio (tecleado a
// mano) y lo pasa por parser + analizador, igual que scripts/analizar.ts.
// Es la demostración en vivo de "el analizador recibe instrucciones escritas".
function PestanaEscribir() {
  const [texto, setTexto] = useState(
    "CULTIVO CANA;\nSENSOR HUMEDAD_SUELO;\nACTUADOR BOMBA_PRINCIPAL;\n\nSI HUMEDAD_SUELO < 30\n  ENCENDER BOMBA_PRINCIPAL;"
  );

  const resultado = useMemo(() => {
    try {
      const programa = parsearPrograma(texto);
      return { ok: true as const, analisis: verificarPrograma(programa) };
    } catch (e) {
      return { ok: false as const, mensaje: (e as Error).message };
    }
  }, [texto]);

  return (
    <div className="panel-salida__escribir">
      <textarea
        className="panel-salida__textarea"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        spellCheck={false}
        rows={10}
      />
      {resultado.ok ? (
        <ListaDiagnostico analisis={resultado.analisis} />
      ) : (
        <p className="panel-salida__bloqueo">
          <IconoAdvertencia size={16} /> {resultado.mensaje}
        </p>
      )}
    </div>
  );
}

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "lenguaje", etiqueta: "Lenguaje" },
  { id: "tipos", etiqueta: "Análisis" },
  { id: "cpp", etiqueta: "C++ (ESP32)" },
  { id: "escribir", etiqueta: "Escribir" },
  { id: "evidencia", etiqueta: "Evidencia" },
];

export function PanelSalida({
  programa,
  onCargarPrograma,
}: {
  programa: Programa | null;
  onCargarPrograma?: (p: Programa) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("lenguaje");

  const analisis = useMemo(() => (programa ? verificarPrograma(programa) : []), [programa]);
  // Solo los errores bloqueantes impiden generar C++; una ADVERTENCIA (p. ej.
  // un sensor declarado y nunca usado) se muestra pero no bloquea nada.
  const hayErrores = hayErroresBloqueantes(analisis);
  const totalErrores = contarErrores(analisis);

  const textoLenguaje = useMemo(() => {
    if (!programa) return "";
    try {
      return programaATexto(programa);
    } catch (e) {
      return `// error al generar texto: ${(e as Error).message}`;
    }
  }, [programa]);

  const textoCpp = useMemo(() => {
    if (!programa || hayErrores) return "";
    try {
      return generarCpp(programa);
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [programa, hayErrores]);

  const lineasLenguaje = textoLenguaje.split("\n");
  const lineasCpp = textoCpp.split("\n");

  const reglasAplicadas = useMemo(() => [...new Set(analisis.flatMap((r) => r.reglasAplicadas))], [analisis]);

  return (
    <div className="panel-salida">
      <div className="panel-salida__pestanas">
        {PESTANAS.map((p) => {
          const deshabilitada = !programa && p.id !== "escribir" && p.id !== "evidencia";
          return (
            <button
              key={p.id}
              className={pestana === p.id ? "activa" : ""}
              onClick={() => setPestana(p.id)}
              disabled={deshabilitada}
            >
              {p.etiqueta}
              {p.id === "tipos" && programa && (
                <span className={`panel-salida__badge ${hayErrores ? "panel-salida__badge--error" : ""}`}>{totalErrores}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="panel-salida__contenido">
        {!programa && pestana !== "escribir" && pestana !== "evidencia" && (
          <p className="panel-salida__vacio">
            Arma una regla para ver aquí el lenguaje, el análisis de tipos y el código C++ — o prueba la pestaña "Escribir".
          </p>
        )}

        {programa && pestana === "lenguaje" && (
          <BloqueCodigo lineas={lineasLenguaje} resaltar={(t) => <LineaLenguaje texto={t} />} />
        )}

        {programa && pestana === "tipos" && <ListaDiagnostico analisis={analisis} />}

        {programa && pestana === "cpp" &&
          (hayErrores ? (
            <p className="panel-salida__bloqueo">
              <IconoAdvertencia size={16} /> Corrige los errores de tipos antes de generar el código para el ESP32.
            </p>
          ) : (
            <BloqueCodigo lineas={lineasCpp} resaltar={(t) => <LineaCpp texto={t} />} />
          ))}

        {pestana === "escribir" && <PestanaEscribir />}

        {pestana === "evidencia" && <PanelEvidencia onCargarPrograma={onCargarPrograma} />}
      </div>

      {programa && (
        <div className={`panel-salida__pie ${hayErrores ? "panel-salida__pie--error" : ""}`}>
          <span>{hayErrores ? `${totalErrores} error${totalErrores === 1 ? "" : "es"}` : "Sin errores"}</span>
          {reglasAplicadas.length > 0 && (
            <span>
              reglas aplicadas: <span className="panel-salida__pie-codigo">{reglasAplicadas.join(" ")}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
