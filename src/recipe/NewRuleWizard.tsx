import { useMemo, useState } from "react";
import type { LogicalOperator, RelationalOperator } from "../compiler/catalog";
import { ACTUATORS, SENSORS } from "../compiler/catalog";
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
import {
  ACTUATOR_ICONS,
  AlarmIcon,
  CheckIcon,
  ArrowIcon,
  DropIcon,
  PlusIcon,
  TimerIcon,
  ValveIcon,
  VerifiedIcon,
} from "../components/Icons";
import "./NewRuleWizard.css";

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

function initialCondition(): ConditionState {
  return {
    sensor: SENSORS[0].id,
    operator: "<",
    mode: "INTEGER",
    integerValue: 30,
    decimalValue: 30,
  };
}

function buildComparison(c: ConditionState): Comparison {
  if (c.mode === "INTEGER") return comparisonWith(c.sensor, c.operator, integerLiteral(c.integerValue));
  return comparisonWith(c.sensor, c.operator, decimalLiteral(c.decimalValue));
}

function actuatorLabel(id: string): string {
  return ACTUATORS.find((a) => a.id === id)?.label ?? id;
}

function operatorText(op: RelationalOperator): string {
  return op === "<" ? "baja de" : op === ">" ? "sube de" : "es igual a";
}

function describeCondition(c: ConditionState): string {
  const sensor = SENSORS.find((s) => s.id === c.sensor);
  const name = sensor?.label.toLowerCase() ?? c.sensor;
  const value = c.mode === "INTEGER" ? c.integerValue : c.decimalValue;
  return `${name} ${operatorText(c.operator)} ${value}${sensor?.unit ?? ""}`;
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

const initialState: WizardState = {
  condition: initialCondition(),
  useSecondCondition: false,
  logicalOperator: "Y",
  condition2: initialCondition(),
  actionType: "STATE",
  stateActionType: "ENCENDER",
  targetActuator: ACTUATORS[0].id,
  seconds: 15,
};

// Selector de condición: medición, operador y un número (entero o con
// decimales). Se usa dos veces: para la condición principal y para la
// condición opcional que se agrega con "Y además" / "O también".
function ConditionSelector({
  condition,
  onChange,
}: {
  condition: ConditionState;
  onChange: (c: ConditionState) => void;
}) {
  const selectedSensor = SENSORS.find((s) => s.id === condition.sensor)!;
  return (
    <div className="wizard__condition">
      <div className="wizard__big-options">
        {SENSORS.map((s) => (
          <button
            key={s.id}
            className={s.id === condition.sensor ? "selected" : ""}
            onClick={() => onChange({ ...condition, sensor: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label>
        Cuando {selectedSensor.label.toLowerCase()}{" "}
        <select value={condition.operator} onChange={(e) => onChange({ ...condition, operator: e.target.value as RelationalOperator })}>
          <option value="<">baje de</option>
          <option value=">">suba de</option>
          <option value="=">sea igual a</option>
        </select>
      </label>

      <p className="wizard__sublabel">¿Con qué lo comparo?</p>
      <div className="wizard__big-options wizard__big-options--compact">
        <button className={condition.mode === "INTEGER" ? "selected" : ""} onClick={() => onChange({ ...condition, mode: "INTEGER" })}>
          Un número
        </button>
        <button className={condition.mode === "DECIMAL" ? "selected" : ""} onClick={() => onChange({ ...condition, mode: "DECIMAL" })}>
          Un número con decimales
        </button>
      </div>

      {condition.mode === "INTEGER" && (
        <>
          <input
            type="range"
            min={0}
            max={100}
            value={condition.integerValue}
            className="wizard__slider"
            style={{ "--fill": `${condition.integerValue}%` } as React.CSSProperties}
            onChange={(e) => onChange({ ...condition, integerValue: Number(e.target.value) })}
          />
          <p className="wizard__value">
            {condition.integerValue}
            {selectedSensor.unit}
          </p>
        </>
      )}

      {condition.mode === "DECIMAL" && (
        <p className="wizard__value">
          <input
            type="number"
            step="0.1"
            value={condition.decimalValue}
            onChange={(e) => onChange({ ...condition, decimalValue: Number(e.target.value) })}
          />{" "}
          {selectedSensor.unit}
        </p>
      )}
    </div>
  );
}

export function NewRuleWizard({
  cropId,
  onComplete,
  onCancel,
}: {
  cropId: string;
  onComplete: (rule: Rule) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("WHEN");
  const [state, setState] = useState<WizardState>(initialState);

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
      ? `${describeCondition(state.condition)} ${state.logicalOperator === "Y" ? "y" : "o"} ${describeCondition(state.condition2)}`
      : describeCondition(state.condition);
    return { id: "regla-candidata", name, condition, actions: [action] };
  }, [state]);

  // Resguardo silencioso: con las opciones del asistente la regla siempre
  // debería ser válida; si no lo fuera, no se deja guardar.
  const isRuleValid = useMemo(() => {
    const candidateProgram: Program = {
      crop: cropId,
      declarations: usedDeclarations([candidateRule]),
      rules: [candidateRule],
    };
    return blockingErrors(checkProgram(candidateProgram)).length === 0;
  }, [candidateRule, cropId]);

  function finish() {
    onComplete({ ...candidateRule, id: `regla-${Date.now()}` });
  }

  return (
    <div className="wizard">
      <ol className="wizard__progress">
        {visibleSteps.map((s, i) => (
          <li key={s.id} className={i === currentIndex ? "current" : i < currentIndex ? "done" : "pending"}>
            <span className="wizard__progress-circle">{i < currentIndex ? <CheckIcon size={12} /> : i + 1}</span>
            <span className="wizard__progress-label">
              Paso {i + 1} de {visibleSteps.length} · {s.label}
            </span>
          </li>
        ))}
      </ol>

      {step === "WHEN" && (
        <div className="wizard__step">
          <h3>¿Cuándo quieres que actúe el sistema?</h3>
          <ConditionSelector condition={state.condition} onChange={(condition) => setState((s) => ({ ...s, condition }))} />

          {state.useSecondCondition ? (
            <div className="wizard__second-condition">
              <div className="wizard__nav">
                <p className="wizard__sublabel">
                  <select
                    value={state.logicalOperator}
                    onChange={(e) => setState((s) => ({ ...s, logicalOperator: e.target.value as LogicalOperator }))}
                  >
                    <option value="Y">Y además…</option>
                    <option value="O">O también…</option>
                  </select>
                </p>
                <button onClick={() => setState((s) => ({ ...s, useSecondCondition: false }))}>Quitar esta condición</button>
              </div>
              <ConditionSelector condition={state.condition2} onChange={(condition2) => setState((s) => ({ ...s, condition2 }))} />
            </div>
          ) : (
            <button className="wizard__add-condition" onClick={() => setState((s) => ({ ...s, useSecondCondition: true }))}>
              <PlusIcon size={14} /> Agregar otra condición (Y / O)
            </button>
          )}

          <button className="wizard__next" onClick={() => setStep("WHAT")}>
            Siguiente <ArrowIcon size={16} />
          </button>
        </div>
      )}

      {step === "WHAT" && (
        <div className="wizard__step">
          <h3>¿Qué debe hacer el sistema?</h3>
          <div className="wizard__big-options">
            <button
              className={state.actionType === "STATE" && state.stateActionType === "ENCENDER" ? "selected" : ""}
              onClick={() => setState((s) => ({ ...s, actionType: "STATE", stateActionType: "ENCENDER" }))}
            >
              <DropIcon size={22} /> Encender un equipo
            </button>
            <button
              className={state.actionType === "STATE" && state.stateActionType === "APAGAR" ? "selected" : ""}
              onClick={() => setState((s) => ({ ...s, actionType: "STATE", stateActionType: "APAGAR" }))}
            >
              <ValveIcon size={22} /> Apagar un equipo
            </button>
            <button
              className={state.actionType === "WAIT" ? "selected" : ""}
              onClick={() => setState((s) => ({ ...s, actionType: "WAIT" }))}
            >
              <TimerIcon size={22} /> Solo esperar
            </button>
          </div>

          {state.actionType === "STATE" && (
            <>
              <p className="wizard__sublabel">Equipos</p>
              <div className="wizard__big-options">
                {ACTUATORS.map((a) => {
                  const ActuatorIcon = ACTUATOR_ICONS[a.id] ?? AlarmIcon;
                  return (
                    <button
                      key={a.id}
                      className={a.id === state.targetActuator ? "selected" : ""}
                      onClick={() => setState((s) => ({ ...s, targetActuator: a.id }))}
                    >
                      <ActuatorIcon size={20} /> {a.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="wizard__nav">
            <button onClick={() => setStep("WHEN")}>
              <ArrowIcon size={16} className="wizard__back-arrow" /> Atrás
            </button>
            <button className="wizard__next" onClick={() => setStep(state.actionType === "WAIT" ? "DURATION" : "SUMMARY")}>
              Siguiente <ArrowIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {step === "DURATION" && (
        <div className="wizard__step">
          <h3>¿Cuánto tiempo esperar?</h3>
          <input
            type="number"
            min={1}
            step={1}
            value={state.seconds}
            onChange={(e) => setState((s) => ({ ...s, seconds: Math.max(1, Math.round(Number(e.target.value))) }))}
          />
          <span> segundos</span>
          <div className="wizard__nav">
            <button onClick={() => setStep("WHAT")}>
              <ArrowIcon size={16} className="wizard__back-arrow" /> Atrás
            </button>
            <button className="wizard__next" onClick={() => setStep("SUMMARY")}>
              Siguiente <ArrowIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {step === "SUMMARY" && (
        <div className="wizard__step">
          <h3>Así quedaría tu regla:</h3>
          <p className="wizard__summary">
            <span className="wizard__summary-key">SI</span> {candidateRule.name},{" "}
            <span className="wizard__summary-key">ENTONCES</span>{" "}
            {state.actionType === "STATE" ? (
              <>
                {state.stateActionType === "ENCENDER" ? "enciende" : "apaga"}{" "}
                <strong>{actuatorLabel(state.targetActuator)}</strong>
              </>
            ) : (
              <>
                espera <strong>{state.seconds} segundos</strong>
              </>
            )}
            .
          </p>

          <div className="wizard__nav">
            <button onClick={() => setStep(state.actionType === "WAIT" ? "DURATION" : "WHAT")}>
              <ArrowIcon size={16} className="wizard__back-arrow" /> Atrás
            </button>
            <button className="wizard__next" onClick={finish} disabled={!isRuleValid}>
              Guardar regla <VerifiedIcon size={16} />
            </button>
          </div>
        </div>
      )}

      <button className="wizard__cancel" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
