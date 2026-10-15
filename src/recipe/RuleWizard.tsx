import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LogicalOperator, RelationalOperator } from "../compiler/catalog";
import type { DeviceRegistry } from "../compiler/device";
import type { Comparison, Expr, Program, Rule } from "../compiler/ast";
import {
  stateAction,
  waitAction,
  comparisonWith,
  usedDeclarations,
  decimalLiteral,
  integerLiteral,
  logical,
} from "../compiler/ast";
import { blockingErrors, checkProgram } from "../compiler/typeChecker";
import { CheckIcon, ChevronIcon, CropIcon, EditIcon, PlusIcon, SENSOR_KIND_ICONS } from "../components/Icons";
import "./RuleWizard.css";

type Step = "WHEN" | "WHAT" | "DURATION" | "SUMMARY";

const STEPS: { id: Step; label: string }[] = [
  { id: "WHEN", label: "¿Cuándo?" },
  { id: "WHAT", label: "¿Qué hago?" },
  { id: "DURATION", label: "¿Por cuánto?" },
  { id: "SUMMARY", label: "Confirmar" },
];

// Con qué se compara la medición elegida: un número entero (T1) o un número
// con decimales (T2).
type ComparisonMode = "INTEGER" | "DECIMAL";

interface ConditionState {
  sensor: string;
  operator: RelationalOperator;
  mode: ComparisonMode;
  integerValue: number;
  decimalValue: number;
}

interface WizardState {
  condition: ConditionState;
  useSecondCondition: boolean;
  logicalOperator: LogicalOperator;
  condition2: ConditionState;
  actionType: "STATE" | "WAIT";
  stateActionType: "ENCENDER" | "APAGAR";
  targetActuator: string;
  seconds: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function initialCondition(registry: DeviceRegistry, sensorId?: string): ConditionState {
  const sensor = registry.sensors.find((s) => s.id === sensorId) ?? registry.sensors[0];
  const start = sensor ? clamp(30, sensor.min, sensor.max) : 30;
  return {
    sensor: sensor?.id ?? "",
    operator: "<",
    mode: "INTEGER",
    integerValue: start,
    decimalValue: start,
  };
}

function initialState(registry: DeviceRegistry): WizardState {
  return {
    condition: initialCondition(registry),
    useSecondCondition: false,
    logicalOperator: "Y",
    condition2: initialCondition(registry),
    actionType: "STATE",
    stateActionType: "ENCENDER",
    targetActuator: registry.actuators[0]?.id ?? "",
    seconds: 15,
  };
}

function conditionFromComparison(c: Comparison, registry: DeviceRegistry): ConditionState | null {
  if (c.right.kind !== "Literal") return null;
  // El asistente solo ofrece <, > e =.
  if (c.operator === "<=" || c.operator === ">=") return null;
  if (!registry.sensors.some((s) => s.id === c.left.sensor)) return null;
  return {
    sensor: c.left.sensor,
    operator: c.operator,
    mode: c.right.type === "ENTERO" ? "INTEGER" : "DECIMAL",
    integerValue: c.right.value,
    decimalValue: c.right.value,
  };
}

// Reconstruye el estado del asistente a partir de una regla ya guardada, o
// devuelve null si la regla no cabe en lo que el asistente sabe expresar
// (más de 2 condiciones, anidadas, operadores <= / >=, varias acciones…).
export function wizardStateFromRule(rule: Rule, registry: DeviceRegistry): WizardState | null {
  const state = initialState(registry);
  const expr = rule.condition;

  if (expr.kind === "Comparison") {
    const c = conditionFromComparison(expr, registry);
    if (!c) return null;
    state.condition = c;
  } else {
    if (expr.left.kind !== "Comparison" || expr.right.kind !== "Comparison") return null;
    const c1 = conditionFromComparison(expr.left, registry);
    const c2 = conditionFromComparison(expr.right, registry);
    if (!c1 || !c2) return null;
    state.condition = c1;
    state.condition2 = c2;
    state.useSecondCondition = true;
    state.logicalOperator = expr.operator;
  }

  if (rule.actions.length !== 1) return null;
  const action = rule.actions[0];
  if (action.kind === "StateAction") {
    if (!registry.actuators.some((a) => a.id === action.actuator)) return null;
    state.actionType = "STATE";
    state.stateActionType = action.action;
    state.targetActuator = action.actuator;
  } else {
    state.actionType = "WAIT";
    state.seconds = action.seconds;
  }
  return state;
}

export function canEditInWizard(rule: Rule, registry: DeviceRegistry): boolean {
  return wizardStateFromRule(rule, registry) !== null;
}

function buildComparison(c: ConditionState): Comparison {
  if (c.mode === "INTEGER") return comparisonWith(c.sensor, c.operator, integerLiteral(c.integerValue));
  return comparisonWith(c.sensor, c.operator, decimalLiteral(c.decimalValue));
}

function operatorText(op: RelationalOperator): string {
  return op === "<" ? "baja de" : op === ">" ? "sube de" : "es igual a";
}

function describeCondition(c: ConditionState, registry: DeviceRegistry): string {
  const sensor = registry.sensors.find((s) => s.id === c.sensor);
  const name = sensor?.label.toLowerCase() ?? c.sensor;
  const value = c.mode === "INTEGER" ? c.integerValue : c.decimalValue;
  return `${name} ${operatorText(c.operator)} ${value}${sensor?.unit ?? ""}`;
}

// Los operadores que ofrece el asistente, en el orden del menú.
const OPERATORS: RelationalOperator[] = ["<", ">", "="];

// Selector de condición: medición, operador y un número (entero o con
// decimales), dentro de la caja verde que abre con "SI" (o con "Y"/"O" en la
// segunda condición). Se usa dos veces: para la condición principal y para la
// condición opcional que se agrega con "Y también" / "O también".
function ConditionSelector({
  badge,
  condition,
  registry,
  onChange,
}: {
  badge: string;
  condition: ConditionState;
  registry: DeviceRegistry;
  onChange: (c: ConditionState) => void;
}) {
  const selectedSensor = registry.sensors.find((s) => s.id === condition.sensor) ?? registry.sensors[0];
  const min = selectedSensor.min;
  const max = selectedSensor.max;
  const fill = max > min ? ((clamp(condition.integerValue, min, max) - min) / (max - min)) * 100 : 0;
  const SensorIcon = SENSOR_KIND_ICONS[selectedSensor.kind] ?? CropIcon;

  return (
    <div className="wizard__condition">
      <div className="wizard__condition-row">
        <span className="wizard__badge">{badge}</span>
        <label className="wizard__chip">
          <SensorIcon size={15} />
          <select
            aria-label="Sensor"
            value={condition.sensor}
            onChange={(e) => {
              const s = registry.sensors.find((x) => x.id === e.target.value);
              if (!s) return;
              onChange({
                ...condition,
                sensor: s.id,
                // El slider de otro sensor tiene otro rango: no se deja el valor fuera de él.
                integerValue: clamp(condition.integerValue, s.min, s.max),
              });
            }}
          >
            {registry.sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronIcon size={14} className="wizard__chip-chevron" />
        </label>
        <label className="wizard__chip">
          <select
            aria-label="Condición"
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as RelationalOperator })}
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {operatorText(op)}
              </option>
            ))}
          </select>
          <ChevronIcon size={14} className="wizard__chip-chevron" />
        </label>
      </div>

      <div className="wizard__type">
        <span>Tipo de valor</span>
        <div className="wizard__segmented" role="group" aria-label="Tipo de valor">
          <button
            className={condition.mode === "INTEGER" ? "selected" : ""}
            aria-pressed={condition.mode === "INTEGER"}
            onClick={() => onChange({ ...condition, mode: "INTEGER" })}
          >
            Un número
          </button>
          <button
            className={condition.mode === "DECIMAL" ? "selected" : ""}
            aria-pressed={condition.mode === "DECIMAL"}
            onClick={() => onChange({ ...condition, mode: "DECIMAL" })}
          >
            Un número con decimales
          </button>
        </div>
      </div>

      {condition.mode === "INTEGER" && (
        <div className="wizard__value-row">
          <input
            type="range"
            min={min}
            max={max}
            value={clamp(condition.integerValue, min, max)}
            className="wizard__slider"
            aria-label="Valor"
            style={{ "--fill": `${fill}%` } as React.CSSProperties}
            onChange={(e) => onChange({ ...condition, integerValue: Number(e.target.value) })}
          />
          <span className="wizard__value">
            {condition.integerValue}
            {selectedSensor.unit}
          </span>
        </div>
      )}

      {condition.mode === "DECIMAL" && (
        <div className="wizard__value-row">
          <input
            type="number"
            step="0.1"
            className="wizard__number"
            aria-label="Valor"
            value={condition.decimalValue}
            onChange={(e) => onChange({ ...condition, decimalValue: Number(e.target.value) })}
          />
          {selectedSensor.unit && <span className="wizard__unit">{selectedSensor.unit}</span>}
        </div>
      )}
    </div>
  );
}

// Condición plegada: una línea con lo que dice ("Sensor de lluvia sube de 30");
// al hacer clic se despliega para editarla.
function ConditionSummary({
  condition,
  registry,
  onEdit,
}: {
  condition: ConditionState;
  registry: DeviceRegistry;
  onEdit: () => void;
}) {
  const sensor = registry.sensors.find((s) => s.id === condition.sensor);
  const value = condition.mode === "INTEGER" ? condition.integerValue : condition.decimalValue;
  return (
    <button className="wizard__collapsed" onClick={onEdit} title="Editar esta condición">
      <span>
        {sensor?.label ?? condition.sensor} {operatorText(condition.operator)}{" "}
        <strong>
          {value}
          {sensor?.unit ?? ""}
        </strong>
      </span>
      <EditIcon size={14} />
    </button>
  );
}

// Tarjeta de opción con su círculo de selección (acciones y equipos del paso 2).
function ChoiceCard({
  selected,
  title,
  text,
  onClick,
}: {
  selected: boolean;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className={`wizard__choice${selected ? " selected" : ""}`} aria-pressed={selected} onClick={onClick}>
      <span className="wizard__radio">{selected && <CheckIcon size={12} />}</span>
      <span className="wizard__choice-text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </button>
  );
}

export function RuleWizard({
  registry,
  initialRule,
  onComplete,
  onCancel,
}: {
  registry: DeviceRegistry;
  initialRule?: Rule;
  onComplete: (rule: Rule) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("WHEN");
  const [state, setState] = useState<WizardState>(
    () => (initialRule && wizardStateFromRule(initialRule, registry)) || initialState(registry)
  );
  // Con dos condiciones, solo una se ve desplegada; la otra queda en una línea.
  const [expanded, setExpanded] = useState<1 | 2>(1);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Es una ventana sobre "Mi dispositivo": toma el foco al abrirse y Esc la cierra (igual que "Cancelar").
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // El paso DURATION solo existe cuando la acción elegida es "esperar"; el
  // indicador de progreso debe contar 3 o 4 pasos según corresponda.
  const visibleSteps = STEPS.filter((s) => s.id !== "DURATION" || state.actionType === "WAIT");
  const currentIndex = visibleSteps.findIndex((s) => s.id === step);

  const candidateRule = useMemo<Rule>(() => {
    const first = buildComparison(state.condition);
    const condition: Expr = state.useSecondCondition
      ? logical(state.logicalOperator, first, buildComparison(state.condition2))
      : first;
    const action =
      state.actionType === "STATE"
        ? stateAction(state.stateActionType, state.targetActuator)
        : waitAction(state.seconds);
    const name = state.useSecondCondition
      ? `${describeCondition(state.condition, registry)} ${state.logicalOperator === "Y" ? "y" : "o"} ${describeCondition(state.condition2, registry)}`
      : describeCondition(state.condition, registry);
    return { id: "regla-candidata", name, condition, actions: [action] };
  }, [state, registry]);

  // Resguardo silencioso: con las opciones del asistente la regla siempre
  // debería ser válida; si no lo fuera, no se deja guardar.
  const isRuleValid = useMemo(() => {
    const candidateProgram: Program = {
      crop: registry.cropId,
      declarations: usedDeclarations([candidateRule], registry),
      rules: [candidateRule],
    };
    return blockingErrors(checkProgram(candidateProgram, registry)).length === 0;
  }, [candidateRule, registry]);

  function finish() {
    // Al editar se conserva el id (y por tanto el lugar en la lista) y el horario.
    onComplete({
      ...candidateRule,
      id: initialRule?.id ?? `regla-${Date.now()}`,
      ...(initialRule?.timeWindow ? { timeWindow: initialRule.timeWindow } : {}),
    });
  }

  const actuatorLabel = (id: string) => registry.actuators.find((a) => a.id === id)?.label ?? id;

  // A dónde llevan "Atrás" y "Siguiente" en cada paso (DURATION solo existe al elegir "esperar").
  const back: Step | null =
    step === "WHAT" ? "WHEN" : step === "DURATION" ? "WHAT" : step === "SUMMARY" ? (state.actionType === "WAIT" ? "DURATION" : "WHAT") : null;
  const next: Step | null =
    step === "WHEN" ? "WHAT" : step === "WHAT" ? (state.actionType === "WAIT" ? "DURATION" : "SUMMARY") : step === "DURATION" ? "SUMMARY" : null;

  const stepTitle =
    step === "SUMMARY"
      ? "Así quedaría tu regla"
      : `Paso ${currentIndex + 1} de ${visibleSteps.length} · ${visibleSteps[currentIndex]?.label ?? ""}`;

  return createPortal(
    <div className="wizard-overlay">
      <div className="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title" ref={dialogRef} tabIndex={-1}>
        <div className="wizard__head">
          <h2 id="wizard-title">{initialRule ? "Editar regla" : "Nueva regla"}</h2>
          <ol className="wizard__progress">
            {visibleSteps.map((s, i) => (
              <li
                key={s.id}
                className={i === currentIndex ? "current" : i < currentIndex ? "done" : "pending"}
                aria-current={i === currentIndex ? "step" : undefined}
              >
                <span className="wizard__progress-circle">{i + 1}</span>
                <span className="wizard__progress-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="wizard__body">
          <div className="wizard__step-head">
            <h3>{stepTitle}</h3>
            {step === "WHEN" && <p>Elige qué debe medir el sensor para que la regla se active.</p>}
            {step === "DURATION" && <p>¿Cuánto tiempo debe esperar el sistema?</p>}
          </div>

          {step === "WHEN" &&
            (state.useSecondCondition ? (
              <>
                {expanded === 1 ? (
                  <ConditionSelector
                    badge="SI"
                    condition={state.condition}
                    registry={registry}
                    onChange={(condition) => setState((s) => ({ ...s, condition }))}
                  />
                ) : (
                  <ConditionSummary condition={state.condition} registry={registry} onEdit={() => setExpanded(1)} />
                )}

                <div className="wizard__join">
                  <div className="wizard__segmented" role="group" aria-label="Cómo se une la segunda condición">
                    <button
                      className={state.logicalOperator === "Y" ? "selected" : ""}
                      aria-pressed={state.logicalOperator === "Y"}
                      onClick={() => setState((s) => ({ ...s, logicalOperator: "Y" }))}
                    >
                      Y también…
                    </button>
                    <button
                      className={state.logicalOperator === "O" ? "selected" : ""}
                      aria-pressed={state.logicalOperator === "O"}
                      onClick={() => setState((s) => ({ ...s, logicalOperator: "O" }))}
                    >
                      O también…
                    </button>
                  </div>
                  <button
                    className="wizard__link wizard__link--muted"
                    onClick={() => {
                      setState((s) => ({ ...s, useSecondCondition: false }));
                      setExpanded(1);
                    }}
                  >
                    Quitar esta condición
                  </button>
                </div>

                {expanded === 2 ? (
                  <ConditionSelector
                    badge={state.logicalOperator}
                    condition={state.condition2}
                    registry={registry}
                    onChange={(condition2) => setState((s) => ({ ...s, condition2 }))}
                  />
                ) : (
                  <ConditionSummary condition={state.condition2} registry={registry} onEdit={() => setExpanded(2)} />
                )}
              </>
            ) : (
              <>
                <ConditionSelector
                  badge="SI"
                  condition={state.condition}
                  registry={registry}
                  onChange={(condition) => setState((s) => ({ ...s, condition }))}
                />
                <button
                  className="wizard__link"
                  onClick={() => {
                    setState((s) => ({ ...s, useSecondCondition: true }));
                    setExpanded(2);
                  }}
                >
                  <PlusIcon size={14} /> Agregar otra condición (Y/O)
                </button>
              </>
            ))}

          {step === "WHAT" && (
            <>
              <div className="wizard__choices">
                <ChoiceCard
                  selected={state.actionType === "STATE" && state.stateActionType === "ENCENDER"}
                  title="Encender un equipo"
                  text="Activa el equipo elegido."
                  onClick={() => setState((s) => ({ ...s, actionType: "STATE", stateActionType: "ENCENDER" }))}
                />
                <ChoiceCard
                  selected={state.actionType === "STATE" && state.stateActionType === "APAGAR"}
                  title="Apagar un equipo"
                  text="Desactiva el equipo elegido."
                  onClick={() => setState((s) => ({ ...s, actionType: "STATE", stateActionType: "APAGAR" }))}
                />
                <ChoiceCard
                  selected={state.actionType === "WAIT"}
                  title="Solo esperar"
                  text="No enciende ni apaga nada."
                  onClick={() => setState((s) => ({ ...s, actionType: "WAIT" }))}
                />
              </div>

              {state.actionType === "STATE" && (
                <>
                  <p className="wizard__sublabel">Equipos</p>
                  <div className="wizard__choices wizard__choices--equipment">
                    {registry.actuators.map((a) => (
                      <ChoiceCard
                        key={a.id}
                        selected={a.id === state.targetActuator}
                        title={a.label}
                        text={a.id === state.targetActuator ? "Equipo seleccionado" : "Haz clic para elegirlo"}
                        onClick={() => setState((s) => ({ ...s, targetActuator: a.id }))}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === "DURATION" && (
            <div className="wizard__condition wizard__duration">
              <label>
                Esperar
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="wizard__number"
                  value={state.seconds}
                  onChange={(e) => setState((s) => ({ ...s, seconds: Math.max(1, Math.round(Number(e.target.value))) }))}
                />
                segundos
              </label>
            </div>
          )}

          {step === "SUMMARY" && (
            <p className="wizard__summary">
              <span className="wizard__summary-key">SI</span> {candidateRule.name},{" "}
              <span className="wizard__summary-key">ENTONCES</span>{" "}
              {state.actionType === "STATE" ? (
                <>
                  {state.stateActionType === "ENCENDER" ? "enciende" : "apaga"} {actuatorLabel(state.targetActuator)}
                </>
              ) : (
                <>espera {state.seconds} segundos</>
              )}
              .
            </p>
          )}
        </div>

        <div className="wizard__footer">
          <button className="wizard__link wizard__link--muted" onClick={onCancel}>
            Cancelar
          </button>
          <div className="wizard__footer-actions">
            {back && (
              <button className="wizard__back" onClick={() => setStep(back)}>
                Atrás
              </button>
            )}
            {next ? (
              <button className="wizard__next" onClick={() => setStep(next)}>
                Siguiente
              </button>
            ) : (
              <button className="wizard__next" onClick={finish} disabled={!isRuleValid}>
                Guardar regla
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
