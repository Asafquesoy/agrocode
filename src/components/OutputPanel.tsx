import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Program } from "../compiler/ast";
import { isBlocking } from "../compiler/errors";
import { blockingErrors, checkProgram, type RuleCheckResult } from "../compiler/typeChecker";
import { programToText } from "../compiler/printer";
import { parseProgram } from "../compiler/parser";
import { generateCpp } from "../compiler/cppGenerator";
import { cell, generateIntermediateCode, type IRProgram } from "../compiler/intermediateCode";
import type { DeviceRegistry } from "../compiler/device";
import { inferSensorTypes } from "../compiler/inferTypes";
import { CopyIcon, SaveIcon, WarningIcon } from "./Icons";
import { CppLine, LanguageLine } from "./CodeHighlight";
import { copySketch, saveSketch } from "./exportSketch";
import "./OutputPanel.css";

type Tab = "language" | "types" | "ir" | "cpp" | "write";

// Diagnóstico de una regla en el formato que pide la Actividad 5:
// "Expresión válida / Tipos compatibles / Resultado: X" o
// "ERROR SEMÁNTICO [categoría] — mensaje (regla aplicada)".
function DiagnosticList({ results }: { results: RuleCheckResult[] }) {
  return (
    <ul className="output-panel__type-list">
      {results.map((r) => {
        const errors = r.errors.filter(isBlocking);
        const warnings = r.errors.filter((e) => !isBlocking(e));
        return (
          <li key={r.ruleId} className={errors.length ? "error" : "ok"}>
            <div className="output-panel__diag-header">
              <span className="output-panel__diag-label">{errors.length ? "Error" : "Bien"}</span>
              <strong>{r.ruleId}</strong>
            </div>
            {errors.length === 0 && (
              <span>
                Expresión válida. Tipos compatibles.
                {r.inferredType && (
                  <>
                    {" "}
                    Resultado: <strong>{r.inferredType}</strong>.
                  </>
                )}
                {r.appliedRules.length > 0 && <> Regla aplicada: {r.appliedRules.join(", ")}.</>}
              </span>
            )}
            {errors.length > 0 && (
              <ul>
                {errors.map((err, i) => (
                  <li key={i}>
                    <strong>[{err.category}]</strong> — {err.message}{" "}
                    <em>
                      (regla {err.rule}
                      {err.line ? `, línea ${err.line}` : ""})
                    </em>
                  </li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="output-panel__warnings">
                {warnings.map((warning, i) => (
                  <li key={i}>
                    AVISO — {warning.message} <em>(regla {warning.rule})</em>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CodeBlock({ lines, highlight }: { lines: string[]; highlight: (text: string) => ReactNode }) {
  return (
    <pre className="output-panel__code">
      {lines.map((line, i) => (
        <span key={i} className="output-panel__line">
          <span className="output-panel__num">{i + 1}</span>
          <span className="output-panel__text">{highlight(line) || " "}</span>
        </span>
      ))}
    </pre>
  );
}

// Pestaña "Escribir": recibe texto suelto del lenguaje intermedio (tecleado a
// mano) y lo pasa por parser + analizador, igual que scripts/analyze.ts.
// Texto de ejemplo armado con lo que el agricultor registró, para que arranque
// válido contra su dispositivo.
function sampleText(registry: DeviceRegistry): string {
  const sensor = registry.sensors[0];
  const actuator = registry.actuators[0];
  if (!sensor || !actuator) return `CULTIVO ${registry.cropId};\n`;
  return `CULTIVO ${registry.cropId};\nSENSOR ${sensor.id};\nACTUADOR ${actuator.id};\n\nSI ${sensor.id} < 30\n  ENCENDER ${actuator.id};`;
}

function WriteTab({ registry }: { registry: DeviceRegistry }) {
  const [text, setText] = useState(() => sampleText(registry));

  const result = useMemo(() => {
    try {
      return { ok: true as const, results: checkProgram(parseProgram(text), registry) };
    } catch (e) {
      return { ok: false as const, message: (e as Error).message };
    }
  }, [text, registry]);

  return (
    <div className="output-panel__write">
      <textarea
        className="output-panel__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={10}
      />
      {result.ok ? (
        <DiagnosticList results={result.results} />
      ) : (
        <p className="output-panel__blocked">
          <WarningIcon size={16} /> {result.message}
        </p>
      )}
    </div>
  );
}

// Cuádruplos agrupados por regla: una fila separadora con el nombre de la
// regla y debajo sus instrucciones (op, arg1, arg2, resultado).
function QuadrupleTable({ ir }: { ir: IRProgram }) {
  const firstRuleStart = ir.rules.length > 0 ? ir.rules[0].from : ir.quadruples.length;
  const row = (i: number) => {
    const q = ir.quadruples[i];
    return (
      <tr key={i}>
        <td className="output-panel__ir-index">{q.index}</td>
        <td className="output-panel__ir-op">{q.op}</td>
        <td>{cell(q.arg1)}</td>
        <td>{cell(q.arg2)}</td>
        <td>{cell(q.result)}</td>
      </tr>
    );
  };
  const rows = [];
  for (let i = 0; i < firstRuleStart; i++) rows.push(row(i));
  for (const block of ir.rules) {
    const window = block.timeWindow ? ` (${block.timeWindow.from}–${block.timeWindow.to})` : "";
    rows.push(
      <tr key={`rule-${block.id}`} className="output-panel__ir-rule">
        <td colSpan={5}>
          Regla: {block.name}
          {window}
        </td>
      </tr>
    );
    for (let i = block.from; i <= block.to; i++) rows.push(row(i));
  }
  return (
    <div className="output-panel__ir-scroll">
      <table className="output-panel__ir">
        <thead>
          <tr>
            <th>#</th>
            <th>Operación</th>
            <th>Arg1</th>
            <th>Arg2</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "language", label: "Lenguaje" },
  { id: "types", label: "Análisis" },
  { id: "ir", label: "Código intermedio" },
  { id: "cpp", label: "C++ (ESP32)" },
  { id: "write", label: "Escribir" },
];

export function OutputPanel({ program, registry }: { program: Program | null; registry: DeviceRegistry }) {
  const [tab, setTab] = useState<Tab>("language");
  const [exportNotice, setExportNotice] = useState<{ text: string; error: boolean } | null>(null);

  // Aviso breve que se borra solo a los ~2 s.
  useEffect(() => {
    if (!exportNotice) return;
    const timer = setTimeout(() => setExportNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [exportNotice]);

  const results = useMemo(() => (program ? checkProgram(program, registry) : []), [program, registry]);
  // Tipo de dato de cada sensor, inferido de cómo lo usan las reglas.
  const inferredTypes = useMemo(
    () => (program ? inferSensorTypes(program) : new Map<string, string>()),
    [program]
  );
  // Solo los errores bloqueantes impiden generar C++; una ADVERTENCIA (p. ej.
  // un sensor declarado y nunca usado) se muestra pero no bloquea nada.
  const errorCount = blockingErrors(results).length;
  const hasErrors = errorCount > 0;

  const languageText = useMemo(() => (program ? programToText(program) : ""), [program]);

  const ir = useMemo(() => {
    if (!program || hasErrors) return null;
    try {
      return generateIntermediateCode(program, registry);
    } catch {
      return null;
    }
  }, [program, registry, hasErrors]);

  const cppText = useMemo(() => {
    if (!program || hasErrors) return "";
    try {
      return generateCpp(program, registry);
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [program, registry, hasErrors]);

  const appliedRules = useMemo(() => [...new Set(results.flatMap((r) => r.appliedRules))], [results]);

  const handleSave = async () => {
    if (!program) return;
    try {
      const saved = await saveSketch(cppText, program.crop);
      if (saved) setExportNotice({ text: "Archivo guardado", error: false });
    } catch (e) {
      setExportNotice({ text: `No se pudo guardar: ${(e as Error).message ?? e}`, error: true });
    }
  };

  const handleCopy = async () => {
    try {
      await copySketch(cppText);
      setExportNotice({ text: "Copiado", error: false });
    } catch (e) {
      setExportNotice({ text: `No se pudo copiar: ${(e as Error).message ?? e}`, error: true });
    }
  };

  return (
    <div className="output-panel">
      <div className="output-panel__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
            disabled={!program && t.id !== "write"}
          >
            {t.label}
            {t.id === "types" && program && (
              <span className={`output-panel__badge ${hasErrors ? "output-panel__badge--error" : ""}`}>{errorCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="output-panel__content">
        {!program && tab !== "write" && (
          <p className="output-panel__empty">
            Todavía no hay reglas. Crea una regla o prueba la pestaña «Escribir».
          </p>
        )}

        {program && tab === "language" && (
          <CodeBlock lines={languageText.split("\n")} highlight={(t) => <LanguageLine text={t} />} />
        )}

        {program && tab === "types" && (
          <>
            {inferredTypes.size > 0 && (
              <div className="output-panel__inferred">
                <p className="output-panel__inferred-title">Tipo de dato de cada sensor (según sus reglas)</p>
                <ul>
                  {registry.sensors
                    .filter((s) => inferredTypes.has(s.id))
                    .map((s) => (
                      <li key={s.id}>
                        {s.label} <span className="output-panel__inferred-type">{inferredTypes.get(s.id)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <DiagnosticList results={results} />
          </>
        )}

        {program && tab === "ir" &&
          (ir ? (
            <QuadrupleTable ir={ir} />
          ) : (
            <p className="output-panel__blocked">
              <WarningIcon size={16} /> Corrige los errores de tipos antes de generar el código intermedio.
            </p>
          ))}

        {program && tab === "cpp" &&
          (hasErrors ? (
            <p className="output-panel__blocked">
              <WarningIcon size={16} /> Corrige los errores de tipos antes de generar el código para el ESP32.
            </p>
          ) : (
            <>
              <div className="output-panel__actions">
                <button onClick={handleSave}>
                  <SaveIcon size={16} /> Guardar .ino
                </button>
                <button onClick={handleCopy}>
                  <CopyIcon size={16} /> Copiar
                </button>
                {exportNotice && (
                  <span
                    role="status"
                    className={`output-panel__notice ${exportNotice.error ? "output-panel__notice--error" : ""}`}
                  >
                    {exportNotice.text}
                  </span>
                )}
              </div>
              <CodeBlock lines={cppText.split("\n")} highlight={(t) => <CppLine text={t} />} />
            </>
          ))}

        {tab === "write" && <WriteTab registry={registry} />}
      </div>

      {program && (
        <div className={`output-panel__footer ${hasErrors ? "output-panel__footer--error" : ""}`}>
          <span>{hasErrors ? `${errorCount} error${errorCount === 1 ? "" : "es"}` : "Sin errores"}</span>
          {appliedRules.length > 0 && (
            <span>
              reglas aplicadas: <span className="output-panel__footer-code">{appliedRules.join(" ")}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
