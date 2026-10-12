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
} from "../../componentes/Iconos";
import "./AsistenteNuevaRegla.css";

type Paso = "CUANDO" | "QUE_HAGO" | "CUANTO_TIEMPO" | "RESUMEN";

const PASOS: { id: Paso; etiqueta: string }[] = [
  { id: "CUANDO", etiqueta: "¿Cuándo?" },
  { id: "QUE_HAGO", etiqueta: "¿Qué hago?" },
  { id: "CUANTO_TIEMPO", etiqueta: "¿Por cuánto?" },
  { id: "RESUMEN", etiqueta: "Confirmar" },
];

// Con qué se compara la medición elegida: un número entero (T1) o un número
// con decimales (T2).
type ModoComparacion = "VALOR" | "VALOR_DECIMAL";

interface EstadoCondicion {
  sensor: string;
  operador: OperadorRelacional;
  modo: ModoComparacion;
  valor: number;
  valorDecimal: number;
}

function condicionInicial(): EstadoCondicion {
  return {
    sensor: SENSORES[0].id,
    operador: "<",
    modo: "VALOR",
    valor: 30,
    valorDecimal: 30,
  };
}

function construirComparacion(c: EstadoCondicion): Comparacion {
  if (c.modo === "VALOR") return comparacionCon(c.sensor, c.operador, literalEntero(c.valor));
  return comparacionCon(c.sensor, c.operador, literalDecimal(c.valorDecimal));
}

function etiquetaObjetivo(id: string): string {
  return ACTUADORES.find((a) => a.id === id)?.etiqueta ?? id;
}

function textoOperador(op: OperadorRelacional): string {
  return op === "<" ? "baja de" : op === ">" ? "sube de" : "es igual a";
}

function descripcionCondicion(c: EstadoCondicion): string {
  const sensor = SENSORES.find((s) => s.id === c.sensor);
  const nombre = sensor?.etiqueta.toLowerCase() ?? c.sensor;
  const valor = c.modo === "VALOR" ? c.valor : c.valorDecimal;
  return `${nombre} ${textoOperador(c.operador)} ${valor}${sensor?.unidad ?? ""}`;
}

interface EstadoAsistente {
  condicion: EstadoCondicion;
  usarSegundaCondicion: boolean;
  operadorLogico: OperadorLogico;
  condicion2: EstadoCondicion;
  tipoAccion: "ESTADO" | "TIEMPO";
  accionEstadoTipo: "ENCENDER" | "APAGAR";
  objetivoAccion: string; // id de un ACTUADOR
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

// Selector de condición: medición, operador y un número (entero o con
// decimales). Se usa dos veces: para la condición principal y para la
// condición opcional que se agrega con "Y además" / "O también".
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

  // Resguardo silencioso: con las opciones del asistente la regla siempre
  // debería ser válida; si no lo fuera, no se deja guardar.
  const reglaValida = useMemo(() => {
    const programaCandidato: Programa = {
      cultivo: cultivoId,
      declaraciones: declaracionesUsadas([reglaCandidata]),
      reglas: [reglaCandidata],
    };
    return !verificarPrograma(programaCandidato).some((r) => r.errores.some((e) => e.categoria !== "ADVERTENCIA"));
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
            min={1}
            step={1}
            value={estado.segundos}
            onChange={(e) => setEstado((s) => ({ ...s, segundos: Math.max(1, Math.round(Number(e.target.value))) }))}
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

          <div className="asistente__nav">
            <button onClick={() => setPaso(estado.tipoAccion === "TIEMPO" ? "CUANTO_TIEMPO" : "QUE_HAGO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            <button className="asistente__siguiente" onClick={finalizar} disabled={!reglaValida}>
              Guardar regla <IconoVerificado size={16} />
            </button>
          </div>
        </div>
      )}

      <button className="asistente__cancelar" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}
