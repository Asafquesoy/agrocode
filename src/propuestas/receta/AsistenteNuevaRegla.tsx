import { useState } from "react";
import type { OperadorRelacional } from "../../core/tipos";
import { ACTUADORES, SENSORES } from "../../core/tipos";
import type { Regla } from "../../core/ast";
import { accionEstado, accionTiempo, comparacion } from "../../core/ast";
import { ICONOS_ACTUADOR, IconoAlarma, IconoFlecha, IconoGota, IconoReloj, IconoValvula, IconoVerificado } from "../../componentes/Iconos";

type Paso = "CUANDO" | "QUE_HAGO" | "CUANTO_TIEMPO" | "RESUMEN";

const PASOS: { id: Paso; etiqueta: string }[] = [
  { id: "CUANDO", etiqueta: "¿Cuándo?" },
  { id: "QUE_HAGO", etiqueta: "¿Qué hago?" },
  { id: "CUANTO_TIEMPO", etiqueta: "¿Por cuánto?" },
  { id: "RESUMEN", etiqueta: "Confirmar" },
];

interface EstadoAsistente {
  sensor: string;
  operador: OperadorRelacional;
  valor: number;
  tipoAccion: "ESTADO" | "TIEMPO";
  accionEstadoTipo: "ENCENDER" | "APAGAR";
  actuador: string;
  segundos: number;
}

const estadoInicial: EstadoAsistente = {
  sensor: SENSORES[0].id,
  operador: "<",
  valor: 30,
  tipoAccion: "ESTADO",
  accionEstadoTipo: "ENCENDER",
  actuador: ACTUADORES[0].id,
  segundos: 15,
};

export function AsistenteNuevaRegla({
  onCompletar,
  onCancelar,
}: {
  onCompletar: (regla: Regla) => void;
  onCancelar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>("CUANDO");
  const [estado, setEstado] = useState<EstadoAsistente>(estadoInicial);

  const sensorSel = SENSORES.find((s) => s.id === estado.sensor)!;
  const actuadorSel = ACTUADORES.find((a) => a.id === estado.actuador)!;
  const pasoActualIdx = PASOS.findIndex((p) => p.id === paso);

  function finalizar() {
    const accion =
      estado.tipoAccion === "ESTADO"
        ? accionEstado(estado.accionEstadoTipo, estado.actuador)
        : accionTiempo(estado.segundos);

    const regla: Regla = {
      id: `regla-${Date.now()}`,
      nombre: `${sensorSel.etiqueta} ${estado.operador} ${estado.valor}`,
      condicion: comparacion(estado.sensor, estado.operador, estado.valor),
      acciones: [accion],
    };
    onCompletar(regla);
  }

  return (
    <div className="asistente">
      <ol className="asistente__progreso">
        {PASOS.map((p, i) => (
          <li key={p.id} className={i === pasoActualIdx ? "actual" : i < pasoActualIdx ? "completado" : "pendiente"}>
            <span className="asistente__progreso-circulo">{i < pasoActualIdx ? "✓" : i + 1}</span>
            <span className="asistente__progreso-etiqueta">{p.etiqueta}</span>
          </li>
        ))}
      </ol>

      {paso === "CUANDO" && (
        <div className="asistente__paso">
          <h3>¿Cuándo quieres que actúe el sistema?</h3>
          <div className="asistente__opciones-grandes">
            {SENSORES.map((s) => (
              <button
                key={s.id}
                className={s.id === estado.sensor ? "seleccionado" : ""}
                onClick={() => setEstado((e) => ({ ...e, sensor: s.id }))}
              >
                {s.etiqueta}
              </button>
            ))}
          </div>
          <label>
            Cuando {sensorSel.etiqueta.toLowerCase()}{" "}
            <select
              value={estado.operador}
              onChange={(e) => setEstado((s) => ({ ...s, operador: e.target.value as OperadorRelacional }))}
            >
              <option value="<">baje de</option>
              <option value=">">suba de</option>
              <option value="=">sea igual a</option>
            </select>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={estado.valor}
            className="asistente__slider"
            style={{ "--relleno": `${estado.valor}%` } as React.CSSProperties}
            onChange={(e) => setEstado((s) => ({ ...s, valor: Number(e.target.value) }))}
          />
          <p className="asistente__valor">
            {estado.valor}
            {sensorSel.unidad}
          </p>
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
            <div className="asistente__opciones-grandes">
              {ACTUADORES.map((a) => {
                const IconoActuador = ICONOS_ACTUADOR[a.id] ?? IconoAlarma;
                return (
                  <button
                    key={a.id}
                    className={a.id === estado.actuador ? "seleccionado" : ""}
                    onClick={() => setEstado((s) => ({ ...s, actuador: a.id }))}
                  >
                    <IconoActuador size={20} /> {a.etiqueta}
                  </button>
                );
              })}
            </div>
          )}

          <div className="asistente__nav">
            <button onClick={() => setPaso("CUANDO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            <button className="asistente__siguiente" onClick={() => setPaso("CUANTO_TIEMPO")}>
              Siguiente <IconoFlecha size={16} />
            </button>
          </div>
        </div>
      )}

      {paso === "CUANTO_TIEMPO" && (
        <div className="asistente__paso">
          <h3>{estado.tipoAccion === "TIEMPO" ? "¿Cuánto tiempo esperar?" : "¿Por cuánto tiempo (opcional)?"}</h3>
          <input
            type="number"
            min={1}
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
            <span className="asistente__resumen-clave">SI</span>{" "}
            <strong>{sensorSel.etiqueta.toLowerCase()}</strong>{" "}
            {estado.operador === "<" ? "baja de" : estado.operador === ">" ? "sube de" : "es igual a"}{" "}
            <strong>
              {estado.valor}
              {sensorSel.unidad}
            </strong>
            , <span className="asistente__resumen-clave">ENTONCES</span>{" "}
            {estado.tipoAccion === "ESTADO" ? (
              <>
                {estado.accionEstadoTipo === "ENCENDER" ? "enciende" : "apaga"} <strong>{actuadorSel.etiqueta}</strong>
              </>
            ) : (
              <>
                espera <strong>{estado.segundos} segundos</strong>
              </>
            )}
            .
          </p>
          <div className="asistente__nav">
            <button onClick={() => setPaso("CUANTO_TIEMPO")}>
              <IconoFlecha size={16} className="asistente__flecha-atras" /> Atrás
            </button>
            <button className="asistente__siguiente" onClick={finalizar}>
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
