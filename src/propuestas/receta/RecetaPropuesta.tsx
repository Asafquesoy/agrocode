import { useMemo, useState } from "react";
import { CULTIVOS } from "../../core/tipos";
import type { Expr, Programa, Regla } from "../../core/ast";
import { declaracionesUsadas } from "../../core/ast";
import { verificarPrograma } from "../../core/analizadorTipos";
import { recetaParaCultivo } from "./recetas";
import { AsistenteNuevaRegla } from "./AsistenteNuevaRegla";
import { PanelSalida } from "../../componentes/PanelSalida";
import { ICONOS_CULTIVO, IconoMarca, IconoQuitar } from "../../componentes/Iconos";
import "./RecetaPropuesta.css";

// La receta usa Comparacion directa o Logica(Comparacion, Comparacion).
// Para el slider, siempre editamos el valor de la primera comparación que aparezca.
// El slider solo tiene sentido cuando el lado derecho es un Literal (un número);
// las recetas pre-armadas siempre lo son, pero el AST también admite referencias
// a otro SENSOR/ACTUADOR (ver ast.ts), que el slider no sabe editar.
function valorEditable(expr: Expr): number {
  if (expr.clase === "Comparacion") {
    return expr.derecha.clase === "Literal" ? expr.derecha.valor : 0;
  }
  return valorEditable(expr.izquierda);
}

function conValorActualizado(expr: Expr, nuevoValor: number): Expr {
  if (expr.clase === "Comparacion") {
    if (expr.derecha.clase !== "Literal") return expr;
    return { ...expr, derecha: { ...expr.derecha, valor: nuevoValor } };
  }
  return { ...expr, izquierda: conValorActualizado(expr.izquierda, nuevoValor) };
}

export function RecetaPropuesta() {
  const [cultivo, setCultivo] = useState<string | null>(null);
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [mostrarAsistente, setMostrarAsistente] = useState(false);

  const cultivoInfo = useMemo(() => CULTIVOS.find((c) => c.id === cultivo), [cultivo]);

  // Barra de estado inferior, estilo salida de compilador: reusa el mismo
  // verificarPrograma que consulta PanelSalida — nada se recalcula a mano.
  const estadoCompilacion = useMemo(() => {
    if (!programa) return null;
    const analisis = verificarPrograma(programa);
    const errores = analisis.flatMap((r) => r.errores.filter((e) => e.categoria !== "ADVERTENCIA"));
    const reglasAplicadas = [...new Set(analisis.flatMap((r) => r.reglasAplicadas))];
    return { errores: errores.length, reglasAplicadas };
  }, [programa]);

  function elegirCultivo(id: string) {
    setCultivo(id);
    setPrograma(recetaParaCultivo(id));
  }

  function ajustarUmbral(reglaId: string, nuevoValor: number) {
    setPrograma((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        reglas: prev.reglas.map((r) => (r.id === reglaId ? { ...r, condicion: conValorActualizado(r.condicion, nuevoValor) } : r)),
      };
    });
  }

  function eliminarRegla(reglaId: string) {
    setPrograma((prev) => {
      if (!prev) return prev;
      const reglas = prev.reglas.filter((r) => r.id !== reglaId);
      return { ...prev, reglas, declaraciones: declaracionesUsadas(reglas) };
    });
  }

  function agregarRegla(regla: Regla) {
    setPrograma((prev) => {
      if (!prev) return prev;
      const reglas = [...prev.reglas, regla];
      return { ...prev, reglas, declaraciones: declaracionesUsadas(reglas) };
    });
    setMostrarAsistente(false);
  }

  if (!cultivo || !programa) {
    return (
      <div className="receta-propuesta">
        <p className="receta-propuesta__intro">
          Elige tu cultivo.
        </p>
        <div className="receta-propuesta__cultivos">
          {CULTIVOS.map((c, i) => {
            const Icono = ICONOS_CULTIVO[c.icono];
            return (
              <button
                key={c.id}
                className="receta-propuesta__cultivo-boton"
                style={{ "--i": i } as React.CSSProperties}
                onClick={() => elegirCultivo(c.id)}
              >
                <Icono size={30} className="receta-propuesta__icono" />
                <span className="receta-propuesta__cultivo-nombre">{c.etiqueta}</span>
                <span className="receta-propuesta__cultivo-rango">
                  humedad ideal {c.humedadMinima}–{c.humedadMaxima}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="receta-propuesta">
      <div className="receta-propuesta__cabecera">
        <p>
          {cultivoInfo && (
            <span className="receta-propuesta__cabecera-icono">
              {(() => {
                const Icono = ICONOS_CULTIVO[cultivoInfo.icono];
                return <Icono size={18} />;
              })()}
            </span>
          )}
          Cultivo: <strong>{cultivoInfo?.etiqueta}</strong>
        </p>
        <button onClick={() => setCultivo(null)}>Cambiar cultivo</button>
      </div>

      <div className="receta-propuesta__layout">
        <div className="receta-propuesta__panel-izq">
          <p className="receta-propuesta__panel-titulo">Mi receta</p>
          <div className="receta-propuesta__reglas">
            {programa.reglas.map((regla, i) => {
              const valor = valorEditable(regla.condicion);
              return (
                <div key={regla.id} className="receta-propuesta__regla" style={{ "--i": i } as React.CSSProperties}>
                  <div className="receta-propuesta__regla-cabecera">
                    <span className="receta-propuesta__regla-numero">{String(i + 1).padStart(2, "0")}</span>
                    <span className="receta-propuesta__regla-nombre">{regla.nombre}</span>
                    <button onClick={() => eliminarRegla(regla.id)} aria-label="Quitar esta regla" className="receta-propuesta__quitar">
                      <IconoQuitar size={16} />
                    </button>
                  </div>
                  <div className="receta-propuesta__regla-cuerpo">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={valor}
                      className="receta-propuesta__slider"
                      style={{ "--relleno": `${valor}%` } as React.CSSProperties}
                      onChange={(e) => ajustarUmbral(regla.id, Number(e.target.value))}
                    />
                    <span className="receta-propuesta__valor">{valor}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {mostrarAsistente ? (
            <AsistenteNuevaRegla cultivoId={cultivo} onCompletar={agregarRegla} onCancelar={() => setMostrarAsistente(false)} />
          ) : (
            <button className="receta-propuesta__agregar" onClick={() => setMostrarAsistente(true)}>
              <IconoMarca size={16} />
              Nueva regla
            </button>
          )}
        </div>

        <div className="receta-propuesta__panel-der">
          <PanelSalida programa={programa} />
        </div>
      </div>

      {estadoCompilacion && (
        <div className={`receta-propuesta__estado ${estadoCompilacion.errores > 0 ? "receta-propuesta__estado--error" : ""}`}>
          <span>
            {estadoCompilacion.errores > 0
              ? `${estadoCompilacion.errores} error${estadoCompilacion.errores === 1 ? "" : "es"}`
              : "Sin errores"}
          </span>
          <span>
            {programa.reglas.length} regla{programa.reglas.length === 1 ? "" : "s"}
          </span>
          {estadoCompilacion.reglasAplicadas.length > 0 && (
            <span>
              reglas aplicadas: <span className="receta-propuesta__estado-codigo">{estadoCompilacion.reglasAplicadas.join(" ")}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
