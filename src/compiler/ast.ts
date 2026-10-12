// AST común: la interfaz (src/recipe/) construye este árbol. El analizador de
// tipos y el generador de C++ solo conocen este AST, nunca la interfaz que lo
// produjo.
import type { LogicalOperator, RelationalOperator } from "./catalog.ts";
import type { DeviceRegistry } from "./device.ts";

export interface SensorRef {
  kind: "SensorRef";
  sensor: string; // id de un sensor registrado
}

export interface ActuatorRef {
  kind: "ActuatorRef";
  actuator: string; // id de un actuador registrado
}

export interface Literal {
  kind: "Literal";
  value: number;
  type: "ENTERO" | "DECIMAL";
}

// El lado derecho de una comparación puede ser un literal (caso normal) o una
// referencia a otro identificador (SENSOR/ACTUADOR). Admitir la referencia es
// lo que permite representar y luego rechazar semánticamente comparaciones
// como "HUMEDAD_SUELO < BOMBA_PRINCIPAL" (SENSOR vs ACTUADOR).
export type Operand = Literal | SensorRef | ActuatorRef;

export interface Comparison {
  kind: "Comparison";
  operator: RelationalOperator;
  left: SensorRef;
  right: Operand;
}

export interface Logical {
  kind: "Logical";
  operator: LogicalOperator;
  left: Expr;
  right: Expr;
}

export type Expr = Comparison | Logical;

export interface StateAction {
  kind: "StateAction";
  action: "ENCENDER" | "APAGAR";
  actuator: string; // id de un actuador registrado
}

export interface WaitAction {
  kind: "WaitAction";
  action: "ESPERAR";
  seconds: number;
}

export type Statement = StateAction | WaitAction;

export interface TimeWindow {
  from: string; // "HH:MM"
  to: string;
}

export interface Rule {
  id: string;
  name: string;
  condition: Expr;
  actions: Statement[];
  timeWindow?: TimeWindow;
}

// Declaraciones explícitas de identificadores. El lenguaje escrito exige
// declarar cada SENSOR/ACTUADOR antes de usarlo (ver src/compiler/symbolTable.ts);
// el AST guarda la línea de origen para poder señalar errores de identificador.
export interface SensorDeclaration {
  kind: "SensorDeclaration";
  id: string;
  line?: number;
}

export interface ActuatorDeclaration {
  kind: "ActuatorDeclaration";
  id: string;
  line?: number;
}

export type Declaration = SensorDeclaration | ActuatorDeclaration;

export interface Program {
  crop: string; // identificador del cultivo (DeviceRegistry.cropId)
  cropLine?: number;
  declarations: Declaration[];
  rules: Rule[];
}

// --- Constructores de conveniencia, usados por la interfaz ---

export function sensorRef(sensor: string): SensorRef {
  return { kind: "SensorRef", sensor };
}

export function actuatorRef(actuator: string): ActuatorRef {
  return { kind: "ActuatorRef", actuator };
}

export function sensorDeclaration(id: string, line?: number): SensorDeclaration {
  return { kind: "SensorDeclaration", id, line };
}

export function actuatorDeclaration(id: string, line?: number): ActuatorDeclaration {
  return { kind: "ActuatorDeclaration", id, line };
}

// El rol se decide por lo que el agricultor registró (el registro del
// dispositivo), no por la posición sintáctica en la que aparece el
// identificador. Si el id no está registrado (o no hay registro) se cae de
// vuelta al rol posicional, para no perder identificadores todavía
// desconocidos (el analizador los reportará como I3).
function roleFromRegistry(
  id: string,
  positionalRole: "SENSOR" | "ACTUADOR",
  registry?: DeviceRegistry
): "SENSOR" | "ACTUADOR" {
  if (registry?.sensors.some((s) => s.id === id)) return "SENSOR";
  if (registry?.actuators.some((a) => a.id === id)) return "ACTUADOR";
  return positionalRole;
}

// Deriva las declaraciones SENSOR/ACTUADOR a partir de los identificadores
// realmente usados en las reglas. La usan tanto deviceToProgram (que no las
// declara a mano) como printer.ts (para emitir un texto que el parser pueda
// releer).
export function usedDeclarations(rules: Rule[], registry?: DeviceRegistry): Declaration[] {
  const roles = new Map<string, "SENSOR" | "ACTUADOR">();
  const mark = (id: string, positionalRole: "SENSOR" | "ACTUADOR") => {
    if (!roles.has(id)) roles.set(id, roleFromRegistry(id, positionalRole, registry));
  };

  const visitExpr = (e: Expr) => {
    if (e.kind === "Comparison") {
      mark(e.left.sensor, "SENSOR");
      if (e.right.kind === "SensorRef") mark(e.right.sensor, "SENSOR");
      if (e.right.kind === "ActuatorRef") mark(e.right.actuator, "ACTUADOR");
    } else {
      visitExpr(e.left);
      visitExpr(e.right);
    }
  };
  for (const rule of rules) {
    visitExpr(rule.condition);
    for (const action of rule.actions) {
      if (action.kind === "StateAction") mark(action.actuator, "ACTUADOR");
    }
  }

  return [...roles.entries()].map(([id, role]) =>
    role === "SENSOR" ? sensorDeclaration(id) : actuatorDeclaration(id)
  );
}

export function integerLiteral(value: number): Literal {
  return { kind: "Literal", value, type: "ENTERO" };
}

export function decimalLiteral(value: number): Literal {
  return { kind: "Literal", value, type: "DECIMAL" };
}

export function comparison(
  sensor: string,
  operator: RelationalOperator,
  value: number,
  valueType: "ENTERO" | "DECIMAL" = "ENTERO"
): Comparison {
  return {
    kind: "Comparison",
    operator,
    left: sensorRef(sensor),
    right: { kind: "Literal", value, type: valueType },
  };
}

// Variante de comparison() que acepta cualquier Operand del lado derecho (no
// solo un número), p. ej. un entero o un decimal ya construido.
export function comparisonWith(sensor: string, operator: RelationalOperator, right: Operand): Comparison {
  return { kind: "Comparison", operator, left: sensorRef(sensor), right };
}

export function logical(operator: LogicalOperator, left: Expr, right: Expr): Logical {
  return { kind: "Logical", operator, left, right };
}

export function stateAction(action: "ENCENDER" | "APAGAR", actuator: string): StateAction {
  return { kind: "StateAction", action, actuator };
}

export function waitAction(seconds: number): WaitAction {
  return { kind: "WaitAction", action: "ESPERAR", seconds };
}
