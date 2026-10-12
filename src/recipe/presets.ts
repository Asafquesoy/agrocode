// Recetas pre-armadas por cultivo: el AST ya está construido y verificado.
// El agricultor no arma la regla desde cero, la reconoce y ajusta con sliders.
import type { Program, Rule } from "../compiler/ast";
import { stateAction, comparison, usedDeclarations, logical } from "../compiler/ast";
import { findCrop, CROPS, type CropDef } from "../compiler/catalog";

function baseRules(crop: CropDef): Rule[] {
  return [
    {
      id: "riego-bajo",
      name: "Regar cuando la tierra está seca",
      condition: comparison("HUMEDAD_SUELO", "<", crop.minMoisture),
      actions: [stateAction("ENCENDER", "BOMBA_PRINCIPAL")],
      timeWindow: { from: "06:00", to: "18:00" },
    },
    {
      id: "riego-alto",
      name: "Cortar el riego cuando la tierra está encharcada",
      condition: comparison("HUMEDAD_SUELO", ">", crop.maxMoisture),
      actions: [stateAction("APAGAR", "BOMBA_PRINCIPAL")],
    },
    {
      id: "pausa-lluvia",
      name: "No regar si ya está lloviendo",
      condition: logical("Y", comparison("HUMEDAD_SUELO", "<", crop.minMoisture), comparison("LLUVIA", "=", 0)),
      actions: [stateAction("ENCENDER", "BOMBA_PRINCIPAL")],
    },
  ];
}

export function presetForCrop(cropId: string): Program {
  const crop = findCrop(cropId) ?? CROPS[0];
  const rules = baseRules(crop);
  return { crop: crop.id, declarations: usedDeclarations(rules), rules };
}
