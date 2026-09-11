import { useMemo, useState } from "react";
import type { Programa } from "../core/ast";
import type { ErrorSemantico } from "../core/errores";
import { verificarPrograma, type ResultadoReglaAnalisis } from "../core/analizadorTipos";
import { programaATexto } from "../core/lenguaje";
import { parsearPrograma } from "../core/parser";
import { generarCpp } from "../core/generadorCpp";
import { IconoAdvertencia, IconoVerificado } from "./Iconos";
import { PanelEvidencia } from "./PanelEvidencia";
import "./PanelSalida.css";

type Pestana = "lenguaje" | "tipos" | "cpp" | "escribir" | "evidencia";

function hayErroresBloqueantes(analisis: ResultadoReglaAnalisis[]): boolean {
  return analisis.some((r) => r.errores.some((e) => e.categoria !== "ADVERTENCIA"));
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
            <strong>{r.reglaId}</strong>
            {errores.length === 0 && (
              <span>
                {" "}
                — Expresión válida. Tipos compatibles.
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
                    <strong>ERROR SEMÁNTICO [{err.categoria}]</strong> — {err.mensaje}{" "}
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
                    ADVERTENCIA — {adv.mensaje} <em>(regla {adv.regla})</em>
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

  return (
    <div className="panel-salida">
      <div className="panel-salida__pestanas">
        <button className={pestana === "lenguaje" ? "activa" : ""} onClick={() => setPestana("lenguaje")} disabled={!programa}>
          Lenguaje
        </button>
        <button className={pestana === "tipos" ? "activa" : ""} onClick={() => setPestana("tipos")} disabled={!programa}>
          Análisis de tipos {programa && (hayErrores ? <IconoAdvertencia size={15} /> : <IconoVerificado size={15} />)}
        </button>
        <button className={pestana === "cpp" ? "activa" : ""} onClick={() => setPestana("cpp")} disabled={!programa}>
          C++ (ESP32)
        </button>
        <button className={pestana === "escribir" ? "activa" : ""} onClick={() => setPestana("escribir")}>
          Escribir
        </button>
        <button className={pestana === "evidencia" ? "activa" : ""} onClick={() => setPestana("evidencia")}>
          Evidencia
        </button>
      </div>

      <div className="panel-salida__contenido">
        {!programa && pestana !== "escribir" && pestana !== "evidencia" && (
          <p>Arma una regla para ver aquí el lenguaje, el análisis de tipos y el código C++ — o prueba la pestaña "Escribir".</p>
        )}

        {programa && pestana === "lenguaje" && (
          <pre className="panel-salida__codigo">
            {lineasLenguaje.map((linea, i) => (
              <span key={i} className="panel-salida__linea">
                {linea}
              </span>
            ))}
          </pre>
        )}

        {programa && pestana === "tipos" && <ListaDiagnostico analisis={analisis} />}

        {programa && pestana === "cpp" &&
          (hayErrores ? (
            <p className="panel-salida__bloqueo">
              <IconoAdvertencia size={16} /> Corrige los errores de tipos antes de generar el código para el ESP32.
            </p>
          ) : (
            <pre className="panel-salida__codigo">
              {lineasCpp.map((linea, i) => (
                <span key={i} className="panel-salida__linea">
                  {linea}
                </span>
              ))}
            </pre>
          ))}

        {pestana === "escribir" && <PestanaEscribir />}

        {pestana === "evidencia" && <PanelEvidencia onCargarPrograma={onCargarPrograma} />}
      </div>
    </div>
  );
}
