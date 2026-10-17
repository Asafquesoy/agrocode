import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
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
  sensorRef,
  actuatorRef,
} from "../compiler/ast";
import { blockingErrors, checkProgram } from "../compiler/typeChecker";
import {
  ACTUATOR_KIND_ICONS,
  CheckIcon,
  ChevronIcon,
  CropIcon,
  EditIcon,
  PlugIcon,
  PlusIcon,
  SENSOR_KIND_ICONS,
  WarningIcon,
} from "../components/Icons";
import "./RuleWizard.css";

type Step = "WHEN" | "WHAT" | "DURATION" | "SUMMARY";//Que hace el asistente: paso 1 (condición), paso 2 (acción), paso 3 (duración, si aplica) y paso 4 (resumen).

const STEPS: { id: Step; label: string }[] = [
  { id: "WHEN", label: "¿Cuándo?" },
  { id: "WHAT", label: "¿Qué hago?" },
  { id: "DURATION", label: "¿Por cuánto?" },
  { id: "SUMMARY", label: "Confirmar" },
];

// Con qué se compara la medición elegida. INTEGER/DECIMAL son el caso normal
// (T1/T2); SENSOR y ACTUATOR son equivocaciones que un agricultor puede
// cometer de verdad — comparar dos mediciones entre sí (T9) o una medición con
// un equipo (T6) — y que el analizador semántico debe poder rechazar.
type ComparisonMode = "INTEGER" | "DECIMAL" | "SENSOR" | "ACTUATOR";

const COMPARISON_MODES: { id: ComparisonMode; label: string }[] = [
  { id: "INTEGER", label: "Un número" },
  { id: "DECIMAL", label: "Un número con decimales" },
  { id: "SENSOR", label: "Otra medición" },
  { id: "ACTUATOR", label: "Un equipo" },
];

interface ConditionState {
  sensor: string;
  operator: RelationalOperator;
  mode: ComparisonMode;
  integerValue: number;
  decimalValue: number;
  otherSensor: string;
  otherActuator: string;
}

interface WizardState {
  condition: ConditionState;
  useSecondCondition: boolean;
  logicalOperator: LogicalOperator;
  condition2: ConditionState;
  actionType: "STATE" | "WAIT";
  stateActionType: "ENCENDER" | "APAGAR";
  targetActuator: string; // id de un equipo o, por error, de un sensor (I4/T8)
  seconds: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Para "Otra medición": un sensor distinto del elegido, si lo hay.
function otherSensorThan(registry: DeviceRegistry, sensorId: string): string {
  return registry.sensors.find((s) => s.id !== sensorId)?.id ?? sensorId;
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
    otherSensor: otherSensorThan(registry, sensor?.id ?? ""),
    otherActuator: registry.actuators[0]?.id ?? "",
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
  // El asistente solo ofrece <, > e =.
  if (c.operator === "<=" || c.operator === ">=") return null;
  if (!registry.sensors.some((s) => s.id === c.left.sensor)) return null;
  const base = { ...initialCondition(registry, c.left.sensor), operator: c.operator };
  const right = c.right;
  if (right.kind === "Literal") {
    return {
      ...base,
      mode: right.type === "ENTERO" ? "INTEGER" : "DECIMAL",
      integerValue: right.value,
      decimalValue: right.value,
    };
  }
  if (right.kind === "SensorRef" && registry.sensors.some((s) => s.id === right.sensor)) {
    return { ...base, mode: "SENSOR", otherSensor: right.sensor };
  }
  if (right.kind === "ActuatorRef" && registry.actuators.some((a) => a.id === right.actuator)) {
    return { ...base, mode: "ACTUATOR", otherActuator: right.actuator };
  }
  return null;
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
    const exists = (id: string) => registry.actuators.some((a) => a.id === id) || registry.sensors.some((s) => s.id === id);
    if (!exists(action.actuator)) return null;
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
  if (c.mode === "DECIMAL") return comparisonWith(c.sensor, c.operator, decimalLiteral(c.decimalValue));
  if (c.mode === "SENSOR") return comparisonWith(c.sensor, c.operator, sensorRef(c.otherSensor));
  return comparisonWith(c.sensor, c.operator, actuatorRef(c.otherActuator));
}

function operatorText(op: RelationalOperator): string {
  return op === "<" ? "baja de" : op === ">" ? "sube de" : "es igual a";
}

// Lo que va después de "baja de / sube de": el número con su unidad, o el
// nombre de la otra medición o del equipo.
function comparedWithText(c: ConditionState, registry: DeviceRegistry): string {
  if (c.mode === "SENSOR") return registry.sensors.find((s) => s.id === c.otherSensor)?.label ?? c.otherSensor;
  if (c.mode === "ACTUATOR") return registry.actuators.find((a) => a.id === c.otherActuator)?.label ?? c.otherActuator;
  const unit = registry.sensors.find((s) => s.id === c.sensor)?.unit ?? "";
  return `${c.mode === "INTEGER" ? c.integerValue : c.decimalValue}${unit}`;
}

function describeCondition(c: ConditionState, registry: DeviceRegistry): string {
  const sensor = registry.sensors.find((s) => s.id === c.sensor);
  const name = sensor?.label.toLowerCase() ?? c.sensor;
  const target = comparedWithText(c, registry);
  return `${name} ${operatorText(c.operator)} ${c.mode === "SENSOR" || c.mode === "ACTUATOR" ? target.toLowerCase() : target}`;
}

// Los operadores que ofrece el asistente, en el orden del menú.
const OPERATORS: RelationalOperator[] = ["<", ">", "="];

interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

// Menú con forma de chip (sensor / condición). La lista es propia, con la
// superficie, el borde y el verde de la app, en vez del desplegable del
// sistema; se monta en document.body para que el scroll del paso no la corte.
// Esc cierra solo el menú, no la ventana del asistente.
function ChipSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[currentIndex];
  const CurrentIcon = current?.icon;

  function openMenu() {
    setActive(currentIndex);
    setPosition(null);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close(true);
  }

  // Abre debajo del chip, o encima si abajo no cabe; nunca se sale de la ventana.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const chip = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = 6;
    const below = chip.bottom + gap;
    const fitsBelow = below + menu.height <= window.innerHeight - 8;
    const top = fitsBelow || chip.top - gap - menu.height < 8 ? below : chip.top - gap - menu.height;
    const left = Math.min(chip.left, window.innerWidth - Math.max(menu.width, chip.width) - 8);
    setPosition({ top, left: Math.max(8, left), minWidth: chip.width });
  }, [open]);

  // El foco pasa a la lista ya colocada (oculta no lo acepta) para usarla con el teclado.
  useLayoutEffect(() => {
    if (open && position) menuRef.current?.focus();
  }, [open, position]);

  // Un clic fuera, cambiar el tamaño de la ventana o desplazar el paso lo cierran.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${menuId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, menuId]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape" || e.key === "Tab") close(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="wizard__chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          } else if (open && e.key === "Escape") {
            e.stopPropagation();
            close(true);
          }
        }}
      >
        {CurrentIcon && <CurrentIcon size={15} />}
        <span className="wizard__chip-text">{current?.label}</span>
        <ChevronIcon size={14} className="wizard__chip-chevron" />
      </button>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            className="wizard__menu"
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${menuId}-${active}`}
            tabIndex={-1}
            style={
              position
                ? { top: position.top, left: position.left, minWidth: position.minWidth }
                : { visibility: "hidden" }
            }
            onKeyDown={onMenuKeyDown}
          >
            {options.map((option, i) => {
              const Icon = option.icon;
              const selected = i === currentIndex;
              return (
                <li
                  key={option.value}
                  id={`${menuId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={`wizard__menu-option${selected ? " selected" : ""}${i === active ? " active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  {Icon && <Icon size={15} />}
                  <span className="wizard__menu-label">{option.label}</span>
                  {selected && <CheckIcon size={14} className="wizard__menu-check" />}
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </>
  );
}

// Selector de condición: medición, operador y con qué se compara (un número
// entero o con decimales, otra medición o un equipo), dentro de la caja verde
// que abre con "SI" (o con "Y"/"O" en la segunda condición). Se usa dos veces:
// para la condición principal y para la condición opcional que se agrega con
// "Y también" / "O también".
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

  return (
    <div className="wizard__condition">
      <div className="wizard__condition-row">
        <span className="wizard__badge">{badge}</span>
        <ChipSelect
          label="Sensor"
          value={condition.sensor}
          options={registry.sensors.map((s) => ({
            value: s.id,
            label: s.label,
            icon: SENSOR_KIND_ICONS[s.kind] ?? CropIcon,
          }))}
          onChange={(id) => {
            const s = registry.sensors.find((x) => x.id === id);
            if (!s) return;
            onChange({
              ...condition,
              sensor: s.id,
              // El slider de otro sensor tiene otro rango: no se deja el valor fuera de él.
              integerValue: clamp(condition.integerValue, s.min, s.max),
              otherSensor: condition.otherSensor === s.id ? otherSensorThan(registry, s.id) : condition.otherSensor,
            });
          }}
        />
        <ChipSelect
          label="Condición"
          value={condition.operator}
          options={OPERATORS.map((op) => ({ value: op, label: operatorText(op) }))}
          onChange={(operator) => onChange({ ...condition, operator })}
        />
      </div>

      <div className="wizard__type">
        <span>Comparar con</span>
        <div className="wizard__segmented" role="group" aria-label="Comparar con">
          {COMPARISON_MODES.map((m) => (
            <button
              key={m.id}
              className={condition.mode === m.id ? "selected" : ""}
              aria-pressed={condition.mode === m.id}
              onClick={() => onChange({ ...condition, mode: m.id })}
            >
              {m.label}
            </button>
          ))}
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

      {condition.mode === "SENSOR" && (
        <div className="wizard__value-row">
          <ChipSelect
            label="Otra medición"
            value={condition.otherSensor}
            options={registry.sensors
              // Con un solo sensor no hay "otra": se ofrece el mismo (igual es T9).
              .filter((s) => s.id !== condition.sensor || registry.sensors.length === 1)
              .map((s) => ({ value: s.id, label: s.label, icon: SENSOR_KIND_ICONS[s.kind] ?? CropIcon }))}
            onChange={(otherSensor) => onChange({ ...condition, otherSensor })}
          />
        </div>
      )}

      {condition.mode === "ACTUATOR" && (
        <div className="wizard__value-row">
          <ChipSelect
            label="Equipo"
            value={condition.otherActuator}
            options={registry.actuators.map((a) => ({
              value: a.id,
              label: a.label,
              icon: ACTUATOR_KIND_ICONS[a.kind] ?? PlugIcon,
            }))}
            onChange={(otherActuator) => onChange({ ...condition, otherActuator })}
          />
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
  return (
    <button className="wizard__collapsed" onClick={onEdit} title="Editar esta condición">
      <span>
        {sensor?.label ?? condition.sensor} {operatorText(condition.operator)}{" "}
        <strong>{comparedWithText(condition, registry)}</strong>
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

  // Revisión en vivo con el analizador real (el mismo checkProgram que usa
  // OutputPanel) sobre un programa de una sola regla. Se recorren todos los
  // resultados, no solo el de la regla: "encender un sensor" produce a la vez
  // I4 (bajo "(declaraciones)") y T8 (en la regla).
  const review = useMemo(() => {
    const candidateProgram: Program = {
      crop: registry.cropId,
      declarations: usedDeclarations([candidateRule], registry),
      rules: [candidateRule],
    };
    const results = checkProgram(candidateProgram, registry);
    const ruleResult = results.find((r) => r.ruleId === candidateRule.id);
    return {
      errors: blockingErrors(results),
      appliedRules: ruleResult?.appliedRules ?? [],
      inferredType: ruleResult?.inferredType,
    };
  }, [candidateRule, registry]);
  const hasErrors = review.errors.length > 0;

  function finish() {
    // Al editar se conserva el id (y por tanto el lugar en la lista) y el horario.
    onComplete({
      ...candidateRule,
      id: initialRule?.id ?? `regla-${Date.now()}`,
      ...(initialRule?.timeWindow ? { timeWindow: initialRule.timeWindow } : {}),
    });
  }

  const targetLabel = (id: string) =>
    registry.actuators.find((a) => a.id === id)?.label ?? registry.sensors.find((s) => s.id === id)?.label ?? id;

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
                  {/* Un sensor solo mide: elegirlo aquí es un error a propósito (I4/T8). */}
                  <p className="wizard__sublabel">Sensores (miden, no son equipos)</p>
                  <div className="wizard__choices wizard__choices--equipment">
                    {registry.sensors.map((sensor) => (
                      <ChoiceCard
                        key={sensor.id}
                        selected={sensor.id === state.targetActuator}
                        title={sensor.label}
                        text={sensor.id === state.targetActuator ? "Sensor seleccionado" : "Haz clic para elegirlo"}
                        onClick={() => setState((s) => ({ ...s, targetActuator: sensor.id }))}
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
                {/* Acepta decimales y 0 a propósito: el analizador los rechaza (T7/T5). */}
                <input
                  type="number"
                  step="any"
                  className="wizard__number"
                  value={state.seconds}
                  onChange={(e) => setState((s) => ({ ...s, seconds: Number(e.target.value) }))}
                />
                segundos
              </label>
            </div>
          )}

          {step === "SUMMARY" && (
            <>
              <p className="wizard__summary">
                <span className="wizard__summary-key">SI</span> {candidateRule.name},{" "}
                <span className="wizard__summary-key">ENTONCES</span>{" "}
                {state.actionType === "STATE" ? (
                  <>
                    {state.stateActionType === "ENCENDER" ? "enciende" : "apaga"} {targetLabel(state.targetActuator)}
                  </>
                ) : (
                  <>espera {state.seconds} segundos</>
                )}
                .
              </p>

              {hasErrors ? (
                <div className="wizard__review wizard__review--error" role="alert">
                  <p className="wizard__review-title">
                    <WarningIcon size={16} /> El analizador semántico encontró{" "}
                    {review.errors.length === 1 ? "un error" : `${review.errors.length} errores`}
                  </p>
                  <ul>
                    {review.errors.map((err, i) => (
                      <li key={i}>
                        {err.message}{" "}
                        <span className="wizard__review-detail">
                          [{err.category}] · regla {err.rule}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="wizard__review-detail">
                    Vuelve atrás para corregirla, o guárdala así y verás el error en la pestaña «Análisis».
                  </p>
                </div>
              ) : (
                <div className="wizard__review">
                  <p className="wizard__review-title">
                    <CheckIcon size={16} /> Revisada por el analizador semántico: la regla tiene sentido.
                  </p>
                  {review.inferredType && (
                    <p className="wizard__review-detail">
                      Resultado: <strong>{review.inferredType}</strong> · reglas aplicadas: {review.appliedRules.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </>
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
              <button className={`wizard__next${hasErrors ? " wizard__next--error" : ""}`} onClick={finish}>
                {hasErrors ? "Guardar de todos modos" : "Guardar regla"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
