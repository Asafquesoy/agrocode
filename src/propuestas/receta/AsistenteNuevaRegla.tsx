import { useMemo, useState } from "react";
import type { OperadorLogico, OperadorRelacional } from "../../core/tipos";
import { ACTUADORES, SENSORES } from "../../core/tipos";
import type { Comparacion, Expr, Programa, Regla } from "../../core/ast";
import {
  accionEstado,
  accionTiempo,
  comparacionCon,
  declaracionesUsadas,
  literalDecimal,
  literalEntero,
  logica,
  refActuador,
  refSensor,
} from "../../core/ast";
import { verificarPrograma } from "../../core/analizadorTipos";
import {
  ICONOS_ACTUADOR,
  IconoAlarma,
  IconoCheck,
  IconoFlecha,
  IconoGota,
  IconoMarca,
  IconoReloj,
  IconoValvula,
  IconoVerificado,
  IconoAdvertencia,
} from "../../componentes/Iconos";
import "./AsistenteNuevaRegla.css";

type Paso = "CUANDO" | "QUE_HAGO" | "CUANTO_TIEMPO" | "RESUMEN";

const PASOS: { id: Paso; etiqueta: string }[] = [
  { id: "CUANDO", etiqueta: "¿Cuándo?" },
  { id: "QUE_HAGO", etiqueta: "¿Qué hago?" },
  { id: "CUANTO_TIEMPO", etiqueta: "¿Por cuánto?" },
  { id: "RESUMEN", etiqueta: "Confirmar" },
];

// Con qué se compara la medición elegida. VALOR/VALOR_DECIMAL son el caso
// normal (T1/T2); MEDICION y EQUIPO son las equivocaciones que un agricultor
// puede cometer de verdad — comparar dos mediciones entre sí (T9) o comparar
// una medición con un equipo (T6) — y que el analizador debe poder rechazar.
type ModoComparacion = "VALOR" | "VALOR_DECIMAL" | "MEDICION" | "EQUIPO";

interface EstadoCondicion {
  sensor: string;
  operador: OperadorRelacional;
  modo: ModoComparacion;
  valor: number;
  valorDecimal: number;
  otraMedicion: string;
  otroEquipo: string;
}

function condicionInicial(): EstadoCondicion {
  return {
    sensor: SENSORES[0].id,
    operador: "<",
    modo: "VALOR",
    valor: 30,
    valorDecimal: 30,
    otraMedicion: SENSORES[1]?.id ?? SENSORES[0].id,
    otroEquipo: ACTUADORES[0].id,
  };
}

function construirComparacion(c: EstadoCondicion): Comparacion {
  if (c.modo === "VALOR") return comparacionCon(c.sensor, c.operador, literalEntero(c.valor));
  if (c.modo === "VALOR_DECIMAL") return comparacionCon(c.sensor, c.operador, literalDecimal(c.valorDecimal));
  if (c.modo === "MEDICION") return comparacionCon(c.sensor, c.operador, refSensor(c.otraMedicion));
  return comparacionCon(c.sensor, c.operador, refActuador(c.otroEquipo));
}

// El objetivo de ENCENDER/APAGAR normalmente es un ACTUADOR, pero el paso
// QUE_HAGO también permite elegir una medición (a propósito, para poder
// provocar I4/T8) — busca la etiqueta legible en el catálogo que corresponda.
function etiquetaObjetivo(id: string): string {
  return ACTUADORES.find((a) => a.id === id)?.etiqueta ?? SENSORES.find((s) => s.id === id)?.etiqueta ?? id;
}

function textoOperador(op: OperadorRelacional): string {
  return op === "<" ? "baja de" : op === ">" ? "sube de" : "es igual a";
}

function descripcionCondicion(c: EstadoCondicion): string {
  const sensor = SENSORES.find((s) => s.id === c.sensor);
  const nombre = sensor?.etiqueta.toLowerCase() ?? c.sensor;
  if (c.modo === "VALOR") return `${nombre} ${textoOperador(c.operador)} ${c.valor}${sensor?.unidad ?? ""}`;
  if (c.modo === "VALOR_DECIMAL") return `${nombre} ${textoOperador(c.operador)} ${c.valorDecimal}${sensor?.unidad ?? ""}`;
  if (c.modo === "MEDICION") {
    const otra = SENSORES.find((s) => s.id === c.otraMedicion);
    return `${nombre} ${textoOperador(c.operador)} ${otra?.etiqueta.toLowerCase() ?? c.otraMedicion}`;
  }
  const equipo = ACTUADORES.find((a) => a.id === c.otroEquipo);
  return `${nombre} ${textoOperador(c.operador)} ${equipo?.etiqueta.toLowerCase() ?? c.otroEquipo}`;
}

interface EstadoAsistente {
  condicion: EstadoCondicion;
  usarSegundaCondicion: boolean;
  operadorLogico: OperadorLogico;
  condicion2: EstadoCondicion;
  tipoAccion: "ESTADO" | "TIEMPO";
  accionEstadoTipo: "ENCENDER" | "APAGAR";
  objetivoAccion: string; // id de un ACTUADOR o, por error, de un SENSOR
  segundos: number;
}

const estadoInicial: EstadoAsistente = {
  condicion: condicionInicial(),
  usarSegundaCondicion: false,
  operadorLogico: "Y",
  condicion2: condicionInicial(),
  tipoAccion: "ESTADO",
  accionEstadoTipo: "ENCENDER",
  objetivoAccion: ACTUADORES[0].id,
  segundos: 15,
};

// Selector "¿con qué lo comparo?": un número (T1), un número con decimales
// (T2), otra medición (T9 si se equivoca) o un equipo (T6 si se equivoca).
// Se usa dos veces: para la condición principal y para la condición opcional
// que se agrega con "Y además" / "O también".
function SelectorComparacion({
  cond,
  onCambiar,
}: {
  cond: EstadoCondicion;
  onCambiar: (c: EstadoCondicion) => void;
}) {
  const sensorSel = SENSORES.find((s) => s.id === cond.sensor)!;
  return (
    <div className="asistente__condicion">
      <div className="asistente__opciones-grandes">
        {SENSORES.map((s) => (
          <button
            key={s.id}
            className={s.id === cond.sensor ? "seleccionado" : ""}
            onClick={() => onCambiar({ ...cond, sensor: s.id })}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>
      <label>
        Cuando {sensorSel.etiqueta.toLowerCase()}{" "}
        <select value={cond.operador} onChange={(e) => onCambiar({ ...cond, operador: e.target.value as OperadorRelacional })}>
          <option value="<">baje de</option>
          <option value=">">suba de</option>
          <option value="=">sea igual a</option>
        </select>
      </label>

      <p className="asistente__submodo-etiqueta">¿Con qué lo comparo?</p>
      <div className="asistente__opciones-grandes asistente__opciones-grandes--compacto">
        <button className={cond.modo === "VALOR" ? "seleccionado" : ""} onClick={() => onCambiar({ ...cond, modo: "VALOR" })}>
          Un número
        </button>
        <button
          className={cond.modo === "VALOR_DECIMAL" ? "seleccionado" : ""}
          onClick={() => onCambiar({ ...cond, modo: "VALOR_DECIMAL" })}
        >
          Un número con decimales
        </button>
        <button className={cond.modo === "MEDICION" ? "seleccionado" : ""} onClick={() => onCambiar({ ...cond, modo: "MEDICION" })}>
          Otra medición
        </button>
        <button className={cond.modo === "EQUIPO" ? "seleccionado" : ""} onClick={() => onCambiar({ ...cond, modo: "EQUIPO" })}>
          Un equipo
        </button>
      </div>

      {cond.modo === "VALOR" && (
        <>
          <input
            type="range"
            min={0}
            max={100}
            value={cond.valor}
            className="asistente__slider"
            style={{ "--relleno": `${cond.valor}%` } as React.CSSProperties}
            onChange={(e) => onCambiar({ ...cond, valor: Number(e.target.value) })}
          />
          <p className="asistente__valor">
            {cond.valor}
            {sensorSel.unidad}
          </p>
        </>
      )}

      {cond.modo === "VALOR_DECIMAL" && (
        <p className="asistente__valor">
          <input
            type="number"
            step="0.1"
            value={cond.valorDecimal}
            onChange={(e) => onCambiar({ ...cond, valorDecimal: Number(e.target.value) })}
          />{" "}
          {sensorSel.unidad}
        </p>
      )}

      {cond.modo === "MEDICION" && (
        <div className="asistente__opciones-grandes">
          {SENSORES.filter((s) => s.id !== cond.sensor).map((s) => (
            <button
              key={s.id}
              className={s.id === cond.otraMedicion ? "seleccionado" : ""}
              onClick={() => onCambiar({ ...cond, otraMedicion: s.id })}
            >
              {s.etiqueta}
            </button>
          ))}
        </div>
      )}

      {cond.modo === "EQUIPO" && (
        <div className="asistente__opciones-grandes">
          {ACTUADORES.map((a) => {
            const Icono = ICONOS_ACTUADOR[a.id] ?? IconoAlarma;
            return (
              <button
                key={a.id}
                className={a.id === cond.otroEquipo ? "seleccionado" : ""}
                onClick={() => onCambiar({ ...cond, otroEquipo: a.id })}
              >
                <Icono size={18} /> {a.etiqueta}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AsistenteNuevaRegla({
  cultivoId,
  onCompletar,
  onCancelar,
}: {
  cultivoId: string;
  onCompletar: (regla: Regla) => void;
  onCancelar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>("CUANDO");
  const [estado, setEstado] = useState<EstadoAsistente>(estadoInicial);

  // El paso CUANTO_TIEMPO solo existe cuando la acción elegida es "esperar";
  // el indicador de progreso debe contar 3 o 4 pasos según corresponda, no
  // siempre 4.
  const pasosVisibles = PASOS.filter((p) => p.id !== "CUANTO_TIEMPO" || estado.tipoAccion === "TIEMPO");
  const pasoActualIdx = pasosVisibles.findIndex((p) => p.id === paso);

  const reglaCandidata = useMemo<Regla>(() => {
    const cond1 = construirComparacion(estado.condicion);
    const condicion: Expr = estado.usarSegundaCondicion
      ? logica(estado.operadorLogico, cond1, construirComparacion(estado.condicion2))
      : cond1;
    const accion =
      estado.tipoAccion === "ESTADO"
        ? accionEstado(estado.accionEstadoTipo, estado.objetivoAccion)
        : accionTiempo(estado.segundos);
    const descripcion = estado.usarSegundaCondicion
      ? `${descripcionCondicion(estado.condicion)} ${estado.operadorLogico === "Y" ? "y" : "o"} ${descripcionCondicion(estado.condicion2)}`
      : descripcionCondicion(estado.condicion);
    return { id: "regla-candidata", nombre: descripcion, condicion, acciones: [accion] };
  }, [estado]);

  // Revisión en vivo con el analizador real: el mismo verificarPrograma que
  // usa PanelSalida, sobre un programa de un solo renglón con este cultivo y
  // esta regla. No es una simulación aparte del analizador semántico.
  //
  // verificarPrograma() devuelve un resultado por regla y, si hay errores de
  // identificador, antepone uno extra con reglaId "(declaraciones)" — hay que
  // recorrer TODOS los resultados, no solo el primero, porque un mismo error
  // (p. ej. "encender una medición") produce a la vez un error de
  // identificador (I4, en "(declaraciones)") y un error de tipos (T8, en la
  // regla); quedarse con el primero perdería el segundo.
  const revision = useMemo(() => {
    const programaCandidato: Programa = {
      cultivo: cultivoId,
      declaraciones: declaracionesUsadas([reglaCandidata]),
      reglas: [reglaCandidata],
    };
    const resultados = verificarPrograma(programaCandidato);
    const errores = resultados.flatMap((r) => r.errores.filter((e) => e.categoria !== "ADVERTENCIA"));
    const advertencias = resultados.flatMap((r) => r.errores.filter((e) => e.categoria === "ADVERTENCIA"));
    const resultadoRegla = resultados.find((r) => r.reglaId === reglaCandidata.id);
    return {
      errores,
      advertencias,
      reglasAplicadas: resultadoRegla?.reglasAplicadas ?? [],
      tipoInferido: resultadoRegla?.tipoInferido,
    };
  }, [reglaCandidata, cultivoId]);

  function finalizar() {
    onCompletar({ ...reglaCandidata, id: `regla-${Date.now()}` });
  }

  return (
    <div className="asistente">
      <ol className="asistente__progreso">
        {pasosVisibles.map((p, i) => (
          <li key={p.id} className={i === pasoActualIdx ? "actual" : i < pasoActualIdx ? "completado" : "pendiente"}>
            <span className="asistente__progreso-circulo">{i < pasoActualIdx ? <IconoCheck size={12} /> : i + 1}</span>
            <span className="asistente__progreso-etiqueta">
              Paso {i + 1} de {pasosVisibles.length} · {p.etiqueta}
            </span>
          </li>
        ))}
      </ol>

      {paso === "CUANDO" && (
        <div className="asistente__paso">
          <h3>¿Cuándo quieres que actúe el sistema?</h3>
          <SelectorComparacion cond={estado.condicion} onCambiar={(condicion) => setEstado((s) => ({ ...s, condicion }))} />

          {estado.usarSegundaCondicion ? (
            <div className="asistente__segunda-condicion">
              <div className="asistente__nav">
                <p className="asistente__submodo-etiqueta">
                  <select
                    value={estado.operadorLogico}
                    onChange={(e) => setEstado((s) => ({ ...s, operadorLogico: e.target.value as OperadorLogico }))}
                  >
                    <option value="Y">Y además…</option>
                    <option value="O">O también…</option>
                  </select>
                </p>
                <button onClick={() => setEstado((s) => ({ ...s, usarSegundaCondicion: false }))}>Quitar esta condición</button>
              </div>
              <SelectorComparacion cond={estado.condicion2} onCambiar={(condicion2) => setEstado((s) => ({ ...s, condicion2 }))} />
            </div>
          ) : (
            <button className="asistente__agregar-condicion" onClick={() => setEstado((s) => ({ ...s, usarSegundaCondicion: true }))}>
              <IconoMarca size={14} /> Agregar otra condición (Y / O)
            </button>
          )}

          <button className="asistente__siguiente" onClick={() => setPaso("QUE_HAGO")}>
            Siguiente <IconoFlecha size={16} />
          </button>
        </div>
      )}

      {paso === "QUE_HAGO" && (
        <div className="asistente__paso">
          <h3>¿Qué debe hacer el sistema?</h3>
          <div className="asistente__opciones-grandes">
            <button
              className={estado.tipoAccion === "ESTADO" && estado.accionEstadoTipo === "ENCENDER" ? "seleccionado" : ""}
              onClick={() => setEstado((s) => ({ ...s, tipoAccion: "ESTADO", accionEstadoTipo: "ENCENDER" }))}
            >
              <IconoGota size={22} /> Encender un equipo
            </button>
            <button
              className={estado.tipoAccion === "ESTADO" && estado.accionEstadoTipo === "APAGAR" ? "seleccionado" : ""}
              onClick={() => setEstado((s) => ({ ...s, tipoAccion: "ESTADO", accionEstadoTipo: "APAGAR" }))}
            >
              <IconoValvula size={22} /> Apagar un equipo
            </button>
            <button
              className={estado.tipoAccion === "TIEMPO" ? "seleccionado" : ""}
              onClick={() => setEstado((s) => ({ ...s, tipoAccion: "TIEMPO" }))}
            >
              <IconoReloj size={22} /> Solo esperar
            </button>
          </div>

          {estado.tipoAccion === "ESTADO" && (
            <>
              <p className="asistente__submodo-etiqueta">Equipos</p>
              <div className="asistente__opciones-grandes">
                {ACTUADORES.map((a) => {
                  const IconoActuador = ICONOS_ACTUADOR[a.id] ?? IconoAlarma;
                  return (
                    <button
                      key={a.id}
                      className={a.id === estado.objetivoAccion ? "seleccionado" : ""}
                      onClick={() => setEstado((s) => ({ ...s, objetivoAccion: a.id }))}
                    >
                      <IconoActuador size={20} /> {a.etiqueta}
                    </button>
                  );
                })}
              </div>
              <p className="asistente__submodo-etiqueta">Mediciones (no son equipos)</p>
              <div className="asistente__opciones-grandes">
                {SENSORES.map((s) => (
                  <button
                    key={s.id}
                    className={s.id === estado.objetivoAccion ? "seleccionado" : ""}
                    onClick={() => setEstado((st) => ({ ...st, objetivoAccion: s.id }))}
                  >
                    {s.etiqueta}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="asistente__nav">
            <button onClick={() => setPaso("CUANDO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            <button
              className="asistente__siguiente"
              onClick={() => setPaso(estado.tipoAccion === "TIEMPO" ? "CUANTO_TIEMPO" : "RESUMEN")}
            >
              Siguiente <IconoFlecha size={16} />
            </button>
          </div>
        </div>
      )}

      {paso === "CUANTO_TIEMPO" && (
        <div className="asistente__paso">
          <h3>¿Cuánto tiempo esperar?</h3>
          <input
            type="number"
            step="any"
            value={estado.segundos}
            onChange={(e) => setEstado((s) => ({ ...s, segundos: Number(e.target.value) }))}
          />
          <span> segundos</span>
          <div className="asistente__nav">
            <button onClick={() => setPaso("QUE_HAGO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            <button className="asistente__siguiente" onClick={() => setPaso("RESUMEN")}>
              Siguiente <IconoFlecha size={16} />
            </button>
          </div>
        </div>
      )}

      {paso === "RESUMEN" && (
        <div className="asistente__paso">
          <h3>Así quedaría tu regla:</h3>
          <p className="asistente__resumen">
            <span className="asistente__resumen-clave">SI</span> {reglaCandidata.nombre},{" "}
            <span className="asistente__resumen-clave">ENTONCES</span>{" "}
            {estado.tipoAccion === "ESTADO" ? (
              <>
                {estado.accionEstadoTipo === "ENCENDER" ? "enciende" : "apaga"}{" "}
                <strong>{etiquetaObjetivo(estado.objetivoAccion)}</strong>
              </>
            ) : (
              <>
                espera <strong>{estado.segundos} segundos</strong>
              </>
            )}
            .
          </p>

          {revision.errores.length === 0 ? (
            <div className="asistente__revision asistente__revision--ok">
              <p className="asistente__revision-mensaje">
                <IconoVerificado size={18} /> Revisado por el analizador semántico: la regla tiene sentido.
              </p>
              {revision.tipoInferido && (
                <p className="asistente__revision-detalle">
                  Resultado: <strong>{revision.tipoInferido}</strong> · reglas aplicadas: {revision.reglasAplicadas.join(", ")}
                </p>
              )}
            </div>
          ) : (
            <div className="asistente__revision asistente__revision--error">
              {revision.errores.map((err, i) => (
                <p className="asistente__revision-mensaje" key={i}>
                  <IconoAdvertencia size={18} /> {err.mensaje}
                  <span className="asistente__revision-detalle"> [{err.categoria}] · regla {err.regla}</span>
                </p>
              ))}
            </div>
          )}

          <div className="asistente__nav">
            <button onClick={() => setPaso(estado.tipoAccion === "TIEMPO" ? "CUANTO_TIEMPO" : "QUE_HAGO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            {revision.errores.length === 0 ? (
              <button className="asistente__siguiente" onClick={finalizar}>
                Guardar regla <IconoVerificado size={16} />
              </button>
            ) : (
              <div className="asistente__nav">
                <button onClick={() => setPaso("CUANDO")}>Corregir</button>
                <button className="asistente__siguiente" onClick={finalizar}>
                  Guardar de todos modos
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <button className="asistente__cancelar" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}
