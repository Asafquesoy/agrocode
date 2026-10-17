import { useMemo, useState } from "react";
import type { Comparison, Expr, Rule } from "../compiler/ast";
import { deviceRegistry, deviceToProgram, type Device } from "../compiler/device";
import type { StoredDevice } from "../compiler/deviceFile";
import { blockingErrors, checkProgram } from "../compiler/typeChecker";
import { pendingSuggestions } from "./suggestions";
import { useAutosave } from "./useAutosave";
import { RuleWizard, canEditInWizard } from "./RuleWizard";
import { DeviceSetup } from "./DeviceSetup";
import { Breadcrumb, SaveBadge } from "./PageHeader";
import { OutputPanel } from "../components/OutputPanel";
import { EditIcon, PlusIcon, RemoveIcon, WarningIcon } from "../components/Icons";
import "./RecipeEditor.css";

// El slider siempre edita la primera comparación que aparezca en la regla.
// Solo tiene sentido cuando el lado derecho es un Literal (un número); el AST
// también admite referencias a otro SENSOR/ACTUADOR (ver ast.ts), que el
// slider no sabe editar.
function firstComparison(expr: Expr): Comparison {
  return expr.kind === "Comparison" ? expr : firstComparison(expr.left);
}

function editableValue(expr: Expr): number {
  const c = firstComparison(expr);
  return c.right.kind === "Literal" ? c.right.value : 0;
}

function withUpdatedValue(expr: Expr, value: number): Expr {
  if (expr.kind === "Comparison") {
    if (expr.right.kind !== "Literal") return expr;
    return { ...expr, right: { ...expr.right, value } };
  }
  return { ...expr, left: withUpdatedValue(expr.left, value) };
}

type View = "SETUP" | "RULES";

export function RecipeEditor({ stored, onBack }: { stored: StoredDevice; onBack: () => void }) {
  const [device, setDevice] = useState<Device>(stored.device);
  // Un dispositivo nuevo (sin cultivo) arranca en Configurar; uno ya armado, en sus reglas.
  const [view, setView] = useState<View>(() => (stored.device.crop.trim() ? "RULES" : "SETUP"));
  // Mientras el dispositivo nuevo no pasa a sus reglas, Configurar es "Crear dispositivo"; después, "Editar".
  const [creating, setCreating] = useState(() => !stored.device.crop.trim());
  const { status, flush } = useAutosave(stored.id, device);
  // null = asistente cerrado; { rule: undefined } = regla nueva; { rule } = editar.
  const [wizard, setWizard] = useState<{ rule?: Rule } | null>(null);

  const registry = useMemo(() => deviceRegistry(device), [device]);
  const program = useMemo(() => deviceToProgram(device), [device]);
  const suggestions = useMemo(() => pendingSuggestions(device), [device]);
  // Reglas guardadas con un error semántico (el asistente permite guardarlas
  // a propósito); el detalle se ve en la pestaña "Análisis".
  const rulesWithErrors = useMemo(
    () =>
      new Set(
        checkProgram(program, registry)
          .filter((r) => blockingErrors([r]).length > 0)
          .map((r) => r.ruleId)
      ),
    [program, registry]
  );

  const canBuildRules = device.sensors.length > 0 && device.actuators.length > 0;

  function setRules(update: (rules: Rule[]) => Rule[]) {
    setDevice((prev) => ({ ...prev, rules: update(prev.rules) }));
  }

  function adjustThreshold(ruleId: string, value: number) {
    setRules((rules) =>
      rules.map((r) => (r.id === ruleId ? { ...r, condition: withUpdatedValue(r.condition, value) } : r))
    );
  }

  function removeRule(ruleId: string) {
    setRules((rules) => rules.filter((r) => r.id !== ruleId));
  }

  function saveRule(rule: Rule) {
    setRules((rules) => (rules.some((r) => r.id === rule.id) ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]));
    setWizard(null);
  }

  function addSuggestion(rule: Rule) {
    setRules((rules) => [...rules, rule]);
  }

  // Se espera al guardado pendiente antes de volver, para que la lista ya
  // muestre lo último que el agricultor cambió.
  async function goBack() {
    await flush();
    onBack();
  }

  if (view === "SETUP") {
    return (
      <DeviceSetup
        device={device}
        creating={creating}
        saveStatus={status}
        onChange={setDevice}
        onBack={() => void goBack()}
        onDone={() => {
          setCreating(false);
          setView("RULES");
        }}
      />
    );
  }

  const deviceName = device.name.trim() || "Mi dispositivo";

  // Mi dispositivo: ruta y título (nombre · cultivo) con el guardado y
  // "Editar sensores y equipos"; debajo "Mis reglas" y, a todo el ancho, las
  // pestañas del compilador.
  return (
    <div className="recipe-editor">
      <Breadcrumb current={deviceName} onBack={() => void goBack()} />

      <div className="recipe-editor__top">
        <div className="page-heading">
          <h1>
            {deviceName} · {registry.cropLabel}
          </h1>
          <p>Crea, consulta y edita las reglas que automatizan tu cultivo.</p>
        </div>
        <div className="recipe-editor__top-actions">
          <SaveBadge status={status} />
          <button className="recipe-editor__setup" onClick={() => setView("SETUP")}>
            Editar sensores y equipos
          </button>
        </div>
      </div>

      <section className="recipe-editor__card" aria-labelledby="recipe-editor-rules">
        <div className="recipe-editor__card-head">
          <h2 id="recipe-editor-rules">Mis reglas</h2>
          <button className="recipe-editor__add" onClick={() => setWizard({})} disabled={!canBuildRules}>
            <PlusIcon size={16} />
            Nueva regla
          </button>
        </div>

        {device.rules.length === 0 && (
          <p className="recipe-editor__hint">Aún no hay reglas. Crea una con «Nueva regla» o prueba la pestaña «Escribir».</p>
        )}
        {!canBuildRules && (
          <p className="recipe-editor__hint">Registra al menos un sensor y un equipo para armar reglas.</p>
        )}

        {device.rules.length > 0 && (
          <div className="recipe-editor__rules">
            {device.rules.map((rule, i) => {
              const first = firstComparison(rule.condition);
              const sensor = registry.sensors.find((s) => s.id === first.left.sensor);
              const min = sensor?.min ?? 0;
              const max = sensor?.max ?? 100;
              const unit = sensor?.unit ?? "";
              const raw = editableValue(rule.condition);
              const value = Math.min(max, Math.max(min, raw));
              const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
              const editable = canEditInWizard(rule, registry);
              const hasError = rulesWithErrors.has(rule.id);
              return (
                <div
                  key={rule.id}
                  className={`recipe-editor__rule${hasError ? " recipe-editor__rule--error" : ""}`}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <div className="recipe-editor__rule-header">
                    <span className="recipe-editor__rule-number">{String(i + 1).padStart(2, "0")}</span>
                    <span className="recipe-editor__rule-name">{rule.name}</span>
                    <button
                      onClick={() => setWizard({ rule })}
                      disabled={!editable}
                      title={editable ? undefined : "Esta regla es muy elaborada para el asistente; puedes quitarla y armarla de nuevo."}
                      aria-label="Editar esta regla"
                      className="recipe-editor__edit"
                    >
                      <EditIcon size={16} />
                    </button>
                    <button onClick={() => removeRule(rule.id)} aria-label="Quitar esta regla" className="recipe-editor__remove">
                      <RemoveIcon size={16} />
                    </button>
                  </div>
                  {/* Sin número que ajustar (se compara con otra medición o un equipo) no hay slider. */}
                  {first.right.kind === "Literal" && (
                    <div className="recipe-editor__rule-body">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={value}
                        className="recipe-editor__slider"
                        style={{ "--fill": `${fill}%` } as React.CSSProperties}
                        onChange={(e) => adjustThreshold(rule.id, Number(e.target.value))}
                      />
                      <span className="recipe-editor__value">
                        {value}
                        {unit}
                      </span>
                    </div>
                  )}
                  {hasError && (
                    <p className="recipe-editor__rule-error">
                      <WarningIcon size={14} /> Error semántico: revísalo en la pestaña «Análisis».
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <p className="recipe-editor__subhead">Sugerencias para tu dispositivo</p>
            <div className="recipe-editor__suggestions">
              {suggestions.map((rule) => (
                <button key={rule.id} className="recipe-editor__suggestion" onClick={() => addSuggestion(rule)}>
                  <PlusIcon size={16} />
                  <span>{rule.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {wizard && (
          <RuleWizard
            key={wizard.rule?.id ?? "new"}
            registry={registry}
            initialRule={wizard.rule}
            onComplete={saveRule}
            onCancel={() => setWizard(null)}
          />
        )}
      </section>

      <OutputPanel program={device.rules.length > 0 ? program : null} registry={registry} />
    </div>
  );
}
