// Recetas pre-armadas por cultivo: el AST ya está construido y verificado.
// El agricultor no arma la regla desde cero, la reconoce y ajusta con sliders.
import type { Programa, Regla } from "../../core/ast";
import { accionEstado, comparacion, declaracionesUsadas, logica } from "../../core/ast";
import { buscarCultivo, CULTIVOS, type DefinicionCultivo } from "../../core/tipos";

function recetaBase(cultivo: DefinicionCultivo): Regla[] {
  return [
    {
      id: "riego-bajo",
      nombre: "Regar cuando la tierra está seca",
      condicion: comparacion("HUMEDAD_SUELO", "<", cultivo.humedadMinima),
      acciones: [accionEstado("ENCENDER", "BOMBA_PRINCIPAL")],
      restriccionHoraria: { desde: "06:00", hasta: "18:00" },
    },
    {
      id: "riego-alto",
      nombre: "Cortar el riego cuando la tierra está encharcada",
      condicion: comparacion("HUMEDAD_SUELO", ">", cultivo.humedadMaxima),
      acciones: [accionEstado("APAGAR", "BOMBA_PRINCIPAL")],
    },
    {
      id: "pausa-lluvia",
      nombre: "No regar si ya está lloviendo",
      condicion: logica("Y", comparacion("HUMEDAD_SUELO", "<", cultivo.humedadMinima), comparacion("LLUVIA", "=", 0)),
      acciones: [accionEstado("ENCENDER", "BOMBA_PRINCIPAL")],
    },
  ];
}

export function recetaParaCultivo(cultivoId: string): Programa {
  const cultivo = buscarCultivo(cultivoId) ?? CULTIVOS[0];
  const reglas = recetaBase(cultivo);
  return { cultivo: cultivo.id, declaraciones: declaracionesUsadas(reglas), reglas };
}
