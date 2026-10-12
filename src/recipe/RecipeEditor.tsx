import { useMemo, useState } from "react";
import { CROPS } from "../compiler/catalog";
import type { Expr, Program, Rule } from "../compiler/ast";
import { usedDeclarations } from "../compiler/ast";
import { presetForCrop } from "./presets";
import { NewRuleWizard } from "./NewRuleWizard";
import { OutputPanel } from "../components/OutputPanel";
import { CROP_ICONS, PlusIcon, RemoveIcon } from "../components/Icons";
import "./RecipeEditor.css";

// La receta usa Comparison directa o Logical(Comparison, Comparison).
// Para el slider, siempre editamos el valor de la primera comparación que aparezca.
// El slider solo tiene sentido cuando el lado derecho es un Literal (un número);
// el AST también admite referencias a otro SENSOR/ACTUADOR (ver ast.ts), que el
// slider no sabe editar.
function editableValue(expr: Expr): number {
  if (expr.kind === "Comparison") {
    return expr.right.kind === "Literal" ? expr.right.value : 0;
  }
  return editableValue(expr.left);
}

function withUpdatedValue(expr: Expr, value: number): Expr {
  if (expr.kind === "Comparison") {
    if (expr.right.kind !== "Literal") return expr;
    return { ...expr, right: { ...expr.right, value } };
  }
  return { ...expr, left: withUpdatedValue(expr.left, value) };
}

export function RecipeEditor() {
  const [cropId, setCropId] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const crop = useMemo(() => CROPS.find((c) => c.id === cropId), [cropId]);

  function chooseCrop(id: string) {
    setCropId(id);
    setProgram(presetForCrop(id));
  }

  function adjustThreshold(ruleId: string, value: number) {
    setProgram((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, condition: withUpdatedValue(r.condition, value) } : r)),
      };
    });
  }

  function removeRule(ruleId: string) {
    setProgram((prev) => {
      if (!prev) return prev;
      const rules = prev.rules.filter((r) => r.id !== ruleId);
      return { ...prev, rules, declarations: usedDeclarations(rules) };
    });
  }

  function addRule(rule: Rule) {
    setProgram((prev) => {
      if (!prev) return prev;
      const rules = [...prev.rules, rule];
      return { ...prev, rules, declarations: usedDeclarations(rules) };
    });
    setShowWizard(false);
  }

  if (!cropId || !program) {
    return (
      <div className="recipe-editor">
        <p className="recipe-editor__intro">Elige tu cultivo.</p>
        <div className="recipe-editor__crops">
          {CROPS.map((c, i) => {
            const Icon = CROP_ICONS[c.icon];
            return (
              <button
                key={c.id}
                className="recipe-editor__crop-button"
                style={{ "--i": i } as React.CSSProperties}
                onClick={() => chooseCrop(c.id)}
              >
                <Icon size={30} className="recipe-editor__icon" />
                <span className="recipe-editor__crop-name">{c.label}</span>
                <span className="recipe-editor__crop-range">
                  humedad ideal {c.minMoisture}–{c.maxMoisture}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const CropIcon = crop ? CROP_ICONS[crop.icon] : null;

  return (
    <div className="recipe-editor">
      <div className="recipe-editor__header">
        <p>
          {CropIcon && (
            <span className="recipe-editor__header-icon">
              <CropIcon size={18} />
            </span>
          )}
          Cultivo: <strong>{crop?.label}</strong>
        </p>
        <button onClick={() => setCropId(null)}>Cambiar cultivo</button>
      </div>

      <div className="recipe-editor__layout">
        <div className="recipe-editor__panel-left">
          <p className="recipe-editor__panel-title">Mi receta</p>
          <div className="recipe-editor__rules">
            {program.rules.map((rule, i) => {
              const value = editableValue(rule.condition);
              return (
                <div key={rule.id} className="recipe-editor__rule" style={{ "--i": i } as React.CSSProperties}>
                  <div className="recipe-editor__rule-header">
                    <span className="recipe-editor__rule-number">{String(i + 1).padStart(2, "0")}</span>
                    <span className="recipe-editor__rule-name">{rule.name}</span>
                    <button onClick={() => removeRule(rule.id)} aria-label="Quitar esta regla" className="recipe-editor__remove">
                      <RemoveIcon size={16} />
                    </button>
                  </div>
                  <div className="recipe-editor__rule-body">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value}
                      className="recipe-editor__slider"
                      style={{ "--fill": `${value}%` } as React.CSSProperties}
                      onChange={(e) => adjustThreshold(rule.id, Number(e.target.value))}
                    />
                    <span className="recipe-editor__value">{value}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {showWizard ? (
            <NewRuleWizard cropId={cropId} onComplete={addRule} onCancel={() => setShowWizard(false)} />
          ) : (
            <button className="recipe-editor__add" onClick={() => setShowWizard(true)}>
              <PlusIcon size={16} />
              Nueva regla
            </button>
          )}
        </div>

        <div className="recipe-editor__panel-right">
          <OutputPanel program={program} />
        </div>
      </div>
    </div>
  );
}
