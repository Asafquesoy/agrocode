import { useMemo, useState } from "react";
import type { Programa } from "../core/ast";
import { verificarPrograma } from "../core/analizadorTipos";
import { programaATexto } from "../core/lenguaje";
import { generarCpp } from "../core/generadorCpp";
import { IconoAdvertencia, IconoVerificado } from "./Iconos";
import "./PanelSalida.css";

type Pestana = "lenguaje" | "tipos" | "cpp";

export function PanelSalida({ programa }: { programa: Programa | null }) {
  const [pestana, setPestana] = useState<Pestana>("lenguaje");

  const analisis = useMemo(() => (programa ? verificarPrograma(programa) : []), [programa]);
  const hayErrores = analisis.some((r) => r.errores.length > 0);

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

  if (!programa) {
    return (
      <div className="panel-salida panel-salida--vacio">
        <p>Arma una regla para ver aquí el lenguaje, el análisis de tipos y el código C++.</p>
      </div>
    );
  }

  const lineasLenguaje = textoLenguaje.split("\n");
  const lineasCpp = textoCpp.split("\n");

  return (
    <div className="panel-salida">
      <div className="panel-salida__pestanas">
        <button className={pestana === "lenguaje" ? "activa" : ""} onClick={() => setPestana("lenguaje")}>
          Lenguaje
        </button>
        <button className={pestana === "tipos" ? "activa" : ""} onClick={() => setPestana("tipos")}>
          Análisis de tipos {hayErrores ? <IconoAdvertencia size={15} /> : <IconoVerificado size={15} />}
        </button>
        <button className={pestana === "cpp" ? "activa" : ""} onClick={() => setPestana("cpp")}>
          C++ (ESP32)
        </button>
      </div>

      <div className="panel-salida__contenido">
        {pestana === "lenguaje" && (
          <pre className="panel-salida__codigo">
            {lineasLenguaje.map((linea, i) => (
              <span key={i} className="panel-salida__linea">
                {linea}
              </span>
            ))}
          </pre>
        )}

        {pestana === "tipos" && (
          <ul className="panel-salida__lista-tipos">
            {analisis.map((r) => (
              <li key={r.reglaId} className={r.errores.length ? "error" : "ok"}>
                <strong>{r.reglaId}</strong>
                {r.errores.length === 0 ? (
                  <span> — todas las expresiones fueron verificadas contra la matriz de tipos.</span>
                ) : (
                  <ul>
                    {r.errores.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {pestana === "cpp" &&
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
      </div>
    </div>
  );
}
