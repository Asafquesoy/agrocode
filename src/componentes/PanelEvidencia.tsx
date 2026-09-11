// Pestaña "Evidencia": muestra, dentro de la misma interfaz que usará el
// agricultor, las reglas del analizador semántico (Actividad 5) y los casos
// de prueba que las ejercitan. Nada de lo que se ve aquí está precalculado:
// cada caso se vuelve a parsear y analizar en el render, con el mismo
// parsearPrograma/verificarPrograma que usan las demás pestañas y el CLI
// (scripts/analizar.ts) — así la evidencia se autoverifica.
import type { Programa } from "../core/ast";
import { MATRIZ_TIPOS, verificarPrograma } from "../core/analizadorTipos";
import { REGLAS_IDENTIFICADORES } from "../core/tablaSimbolos";
import { CATEGORIAS_ERROR } from "../core/errores";
import { CASOS_PRUEBA, type CasoPrueba } from "../core/casosPrueba";
import { parsearPrograma } from "../core/parser";
import { programaATexto } from "../core/lenguaje";
import { IconoAdvertencia, IconoVerificado } from "./Iconos";

interface ResultadoCaso {
  entrada: string;
  obtenido: "VALIDO" | "RECHAZADO";
  reglasAplicadas: string[];
  mensaje?: string;
  programa?: Programa;
}

function analizarCaso(caso: CasoPrueba): ResultadoCaso {
  const fuenteSinCabecera = caso.fuente
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .trim();

  try {
    const programa = parsearPrograma(caso.fuente);
    const analisis = verificarPrograma(programa);
    const erroresBloqueantes = analisis.flatMap((r) => r.errores.filter((e) => e.categoria !== "ADVERTENCIA"));
    const obtenido: "VALIDO" | "RECHAZADO" = erroresBloqueantes.length === 0 ? "VALIDO" : "RECHAZADO";
    const reglasAplicadas =
      obtenido === "VALIDO"
        ? [...new Set(analisis.flatMap((r) => r.reglasAplicadas))]
        : [...new Set(erroresBloqueantes.map((e) => e.regla))];
    return {
      entrada: programaATexto(programa),
      obtenido,
      reglasAplicadas,
      mensaje: erroresBloqueantes[0]?.mensaje,
      programa,
    };
  } catch (e) {
    return { entrada: fuenteSinCabecera, obtenido: "RECHAZADO", reglasAplicadas: [], mensaje: (e as Error).message };
  }
}

export function PanelEvidencia({ onCargarPrograma }: { onCargarPrograma?: (p: Programa) => void }) {
  return (
    <div className="panel-evidencia">
      <section>
        <h4>Reglas de comprobación de tipos (Matriz de la Actividad 5)</h4>
        <div className="panel-evidencia__tabla-scroll">
          <table className="panel-evidencia__tabla">
            <thead>
              <tr>
                <th>Regla</th>
                <th>Tipo 1</th>
                <th>Operador</th>
                <th>Tipo 2</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ_TIPOS.map((fila) => (
                <tr key={fila.id} className={fila.resultado === "ERROR" ? "panel-evidencia__fila-error" : undefined}>
                  <td>{fila.id}</td>
                  <td>{fila.tipo1}</td>
                  <td>{fila.operador}</td>
                  <td>{fila.tipo2}</td>
                  <td>{fila.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4>Reglas de declaración y uso de identificadores</h4>
        <div className="panel-evidencia__tabla-scroll">
          <table className="panel-evidencia__tabla">
            <thead>
              <tr>
                <th>Regla</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {REGLAS_IDENTIFICADORES.map((r) => (
                <tr key={r.id} className={r.categoria === "ADVERTENCIA" ? undefined : "panel-evidencia__fila-error"}>
                  <td>{r.id}</td>
                  <td>{r.nombre}</td>
                  <td>{r.categoria}</td>
                  <td>{r.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4>Categorías de error semántico</h4>
        <ul className="panel-evidencia__categorias">
          {CATEGORIAS_ERROR.map((c) => (
            <li key={c.categoria}>
              <strong>{c.categoria}</strong> — {c.descripcion}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Casos de prueba</h4>
        <p className="panel-evidencia__nota">
          Cada fila se vuelve a analizar al mostrar esta página: "obtenido" es lo que el analizador dice hoy, no un valor guardado.
        </p>
        <div className="panel-evidencia__tabla-scroll">
          <table className="panel-evidencia__tabla panel-evidencia__tabla--casos">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Esperado</th>
                <th>Obtenido</th>
                <th>Regla aplicada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {CASOS_PRUEBA.map((caso) => {
                const resultado = analizarCaso(caso);
                const coincide = resultado.obtenido === caso.esperado;
                return (
                  <tr key={caso.archivo}>
                    <td>
                      <pre className="panel-evidencia__entrada">{resultado.entrada}</pre>
                    </td>
                    <td>{caso.esperado}</td>
                    <td>
                      <span className={coincide ? "panel-evidencia__badge-ok" : "panel-evidencia__badge-error"}>
                        {coincide ? <IconoVerificado size={14} /> : <IconoAdvertencia size={14} />}
                        {resultado.obtenido}
                      </span>
                      {resultado.mensaje && <p className="panel-evidencia__mensaje">{resultado.mensaje}</p>}
                    </td>
                    <td>{resultado.reglasAplicadas.join(", ") || caso.reglaEsperada}</td>
                    <td>
                      {onCargarPrograma && resultado.programa && (
                        <button className="panel-evidencia__cargar" onClick={() => onCargarPrograma(resultado.programa!)}>
                          Cargar en mi receta
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
