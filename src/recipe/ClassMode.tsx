import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { actuatorRef, usedDeclarations, type Expr, type Program, type Rule } from "../compiler/ast";
import { deviceRegistry, deviceToProgram, type Device } from "../compiler/device";
import { isBlocking } from "../compiler/errors";
import { generateCpp } from "../compiler/cppGenerator";
import { generateIntermediateCode } from "../compiler/intermediateCode";
import { tokenize, type TokenType } from "../compiler/lexer";
import { parseProgram } from "../compiler/parser";
import { programToText, ruleToText } from "../compiler/printer";
import { TYPE_MATRIX, checkProgram } from "../compiler/typeChecker";
import { CodeBlock, QuadrupleTable } from "../components/OutputPanel";
import { CppLine, LanguageLine } from "../components/CodeHighlight";
import { CompilePanel } from "../components/CompilePanel";
import { ArrowIcon, BackIcon, CheckIcon, WarningIcon } from "../components/Icons";
import "./ClassMode.css";

// Recorrido del compilador para explicarlo en clase: cada etapa muestra, con los
// datos reales del dispositivo abierto, lo que entra y lo que sale.

interface Stage {
  id: "rule" | "lexer" | "parser" | "semantic" | "ir" | "cpp" | "board";
  short: string;
  title: string;
  blurb: string;
  analogy: string;
}

const STAGES: Stage[] = [
  {
    id: "rule",
    short: "Tu regla",
    title: "Tu regla",
    blurb:
      "Todo empieza con una idea en español: «si hace calor, enciende el LED rojo». La placa no entiende español, así que un compilador hace de traductor.",
    analogy: "Como un traductor entre dos idiomas.",
  },
  {
    id: "lexer",
    short: "Léxico",
    title: "Análisis léxico",
    blurb: "El compilador corta el texto en piezas pequeñas, llamadas tokens, y le pone una etiqueta a cada una.",
    analogy: "Separar una oración en palabras y decir cuál es verbo, cuál sustantivo…",
  },
  {
    id: "parser",
    short: "Sintáctico",
    title: "Análisis sintáctico",
    blurb: "Revisa que las piezas estén en el orden correcto y las acomoda en un árbol que muestra qué depende de qué.",
    analogy: "El análisis gramatical de una oración: sujeto, verbo, predicado.",
  },
  {
    id: "semantic",
    short: "Semántico",
    title: "Análisis semántico",
    blurb: "Comprueba que la regla tenga sentido: que los nombres existan y que los tipos se puedan combinar. Si algo falla, se detiene aquí.",
    analogy: "«La temperatura se come el LED» está bien escrito, pero no tiene sentido.",
  },
  {
    id: "ir",
    short: "Intermedio",
    title: "Código intermedio",
    blurb:
      "La regla se convierte en instrucciones muy simples, de una sola operación cada una, llamadas cuádruplos: (operación, dato 1, dato 2, resultado).",
    analogy: "Una receta de cocina, paso por paso.",
  },
  {
    id: "cpp",
    short: "C++",
    title: "Generación de código",
    blurb: "Cada instrucción simple se traduce a C++, el lenguaje que entiende el ESP32 a través de Arduino.",
    analogy: "Pasar la receta al idioma del cocinero.",
  },
  {
    id: "board",
    short: "Al ESP32",
    title: "¡A la placa!",
    blurb: "El C++ se compila a ceros y unos, se sube por el cable USB y el ESP32 empieza a ejecutarlo: lee el sensor y enciende los LED.",
    analogy: "Entregarle la receta al cocinero para que cocine.",
  },
];

const TOKEN_LABELS: Record<TokenType, string> = {
  KEYWORD: "palabra clave",
  IDENTIFIER: "nombre",
  NUMBER: "número",
  RELATIONAL_OPERATOR: "comparación",
  SEMICOLON: "fin de orden",
  LPAREN: "paréntesis",
  RPAREN: "paréntesis",
  TIME: "hora",
  EOF: "fin",
};

const TYPE_RULE_TEXT: Record<string, string> = {
  T1: "Comparar un sensor con un número entero da verdadero o falso.",
  T2: "Comparar un sensor con un número decimal da verdadero o falso.",
  T3: "Unir dos condiciones con Y / O da verdadero o falso.",
  T4: "Encender o apagar un equipo es una orden válida.",
  T5: "Esperar una cantidad entera de segundos es válido.",
  T6: "No se puede comparar un sensor con un equipo.",
  T7: "No se puede esperar una cantidad decimal de segundos.",
  T8: "No se puede encender o apagar un sensor.",
  T9: "No se puede comparar un sensor con otro sensor.",
};

const OP_TEXT: Record<string, string> = {
  LEER: "lee el valor del sensor",
  SALTARF: "si la condición es falsa, salta al final de la regla",
  ENCENDER: "pone el equipo en ALTO (se enciende)",
  APAGAR: "pone el equipo en BAJO (se apaga)",
  ESPERAR: "pausa los segundos indicados",
  ETIQUETA: "marca el final de la regla",
  Y: "une dos condiciones: las dos deben cumplirse",
  O: "une dos condiciones: basta con una",
  "<": "compara: menor que",
  ">": "compara: mayor que",
  "=": "compara: igual a",
  "<=": "compara: menor o igual que",
  ">=": "compara: mayor o igual que",
};

// --- Árbol sintáctico ---

interface TreeData {
  label: string;
  hint: string;
  tone: "root" | "op" | "sensor" | "value" | "actuator" | "action";
  children?: TreeData[];
}

function exprTree(e: Expr): TreeData {
  if (e.kind === "Logical") {
    return { label: e.operator, hint: "lógico", tone: "op", children: [exprTree(e.left), exprTree(e.right)] };
  }
  const r = e.right;
  const right: TreeData =
    r.kind === "Literal"
      ? { label: String(r.value), hint: "número", tone: "value" }
      : r.kind === "SensorRef"
        ? { label: r.sensor, hint: "sensor", tone: "sensor" }
        : { label: r.actuator, hint: "equipo", tone: "actuator" };
  return {
    label: e.operator,
    hint: "comparación",
    tone: "op",
    children: [{ label: e.left.sensor, hint: "sensor", tone: "sensor" }, right],
  };
}

function ruleTree(rule: Rule): TreeData {
  return {
    label: "REGLA",
    hint: rule.name,
    tone: "root",
    children: [
      { label: "SI", hint: "condición", tone: "op", children: [exprTree(rule.condition)] },
      {
        label: "ENTONCES",
        hint: "acciones",
        tone: "op",
        children: rule.actions.map((a) =>
          a.kind === "StateAction"
            ? { label: a.action, hint: "acción", tone: "action", children: [{ label: a.actuator, hint: "equipo", tone: "actuator" }] }
            : { label: `ESPERAR ${a.seconds} s`, hint: "pausa", tone: "action" }
        ),
      },
    ],
  };
}

function TreeNode({ node, depth }: { node: TreeData; depth: number }) {
  return (
    <div className="cm-node" style={{ "--d": depth } as CSSProperties}>
      <div className={`cm-box cm-box--${node.tone}`}>
        <strong>{node.label}</strong>
        <span>{node.hint}</span>
      </div>
      {node.children && (
        <div className="cm-children">
          {node.children.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Programa de una sola regla ---

function singleRuleProgram(rule: Rule, device: Device): Program {
  const registry = deviceRegistry(device);
  return { crop: registry.cropId, declarations: usedDeclarations([rule], registry), rules: [rule] };
}

// Cambia el número de la condición por un equipo (SI TEMPERATURA > LED_1_ROJO):
// el error que cualquiera entiende a la primera.
function breakRule(rule: Rule, actuatorId: string): Rule {
  const swap = (e: Expr): Expr =>
    e.kind === "Logical" ? { ...e, left: swap(e.left) } : { ...e, right: actuatorRef(actuatorId) };
  return { ...rule, condition: swap(rule.condition) };
}

export function ClassMode({ device, onClose }: { device: Device; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [ruleIndex, setRuleIndex] = useState(0);
  const [broken, setBroken] = useState(false);

  const stage = STAGES[step];
  const registry = useMemo(() => deviceRegistry(device), [device]);
  const rule = device.rules[Math.min(ruleIndex, device.rules.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(STAGES.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => setBroken(false), [step, ruleIndex]);

  const program = useMemo(() => singleRuleProgram(rule, device), [rule, device]);
  const text = useMemo(() => programToText(program), [program]);
  // Solo la línea de la regla: las declaraciones (SENSOR…, ACTUADOR…) harían ruido al explicar.
  const tokens = useMemo(() => tokenize(ruleToText(rule)).filter((t) => t.type !== "EOF"), [rule]);

  // Etapa 4: el texto bueno o el roto pasan por el parser y el analizador reales.
  const checked = useMemo(() => {
    const targetRule = broken && registry.actuators[0] ? breakRule(rule, registry.actuators[0].id) : rule;
    const source = programToText(singleRuleProgram(targetRule, device));
    // Lo que se muestra es solo la regla; el programa completo es el que se analiza.
    const shown = ruleToText(targetRule);
    try {
      const parsed = parseProgram(source);
      return { shown, results: checkProgram(parsed, registry) };
    } catch (e) {
      return { shown, results: [], parseError: (e as Error).message };
    }
  }, [broken, rule, registry, device]);
  const errors = checked.results.flatMap((r) => r.errors).filter(isBlocking);
  const applied = [...new Set(checked.results.flatMap((r) => r.appliedRules))];

  const ir = useMemo(() => {
    try {
      return generateIntermediateCode(program, registry);
    } catch {
      return null;
    }
  }, [program, registry]);
  const usedOps = ir ? [...new Set(ir.quadruples.map((q) => q.op))] : [];

  const ruleCpp = useMemo(() => {
    try {
      return generateCpp(program, registry);
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [program, registry]);
  // Para explicar: solo desde loop(), donde cada instrucción simple se vuelve C++.
  const loopLines = useMemo(() => {
    const lines = ruleCpp.split("\n");
    const start = lines.findIndex((l) => l.startsWith("void loop"));
    return lines.slice(Math.max(0, start));
  }, [ruleCpp]);
  const fullCpp = useMemo(() => {
    try {
      return generateCpp(deviceToProgram(device), registry);
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [device, registry]);

  return (
    <div className="cm">
      <div className="cm__top">
        <button className="cm__exit" onClick={onClose}>
          <BackIcon size={16} /> Salir del modo clase
        </button>
        <ol className="cm__progress">
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <button
                className={i === step ? "active" : i < step ? "done" : ""}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i + 1}</span> {s.short}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="cm__body">
        <aside className="cm__story">
          <p className="cm__step">
            Etapa {step + 1} de {STAGES.length}
          </p>
          <h2>{stage.title}</h2>
          <p className="cm__blurb">{stage.blurb}</p>
          <p className="cm__analogy">
            <strong>Es como…</strong> {stage.analogy}
          </p>

          {device.rules.length > 1 && stage.id !== "board" && (
            <div className="cm__rules">
              <p>Regla que estamos siguiendo:</p>
              <div>
                {device.rules.map((r, i) => (
                  <button key={r.id} className={i === ruleIndex ? "active" : ""} onClick={() => setRuleIndex(i)} title={r.name}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="cm__stage" key={`${stage.id}-${ruleIndex}`}>
          {stage.id === "rule" && (
            <div className="cm__pair">
              <div className="cm__card">
                <p className="cm__label">Lo que tú piensas</p>
                <p className="cm__sentence">{rule.name}</p>
              </div>
              <span className="cm__arrow" aria-hidden="true">
                <ArrowIcon size={36} />
              </span>
              <div className="cm__card">
                <p className="cm__label">Lo que escribe Agrocode</p>
                <pre className="cm__code">
                  {text.split("\n").map((line, i) => (
                    <div key={i}>
                      <LanguageLine text={line} />
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {stage.id === "lexer" && (
            <div className="cm__card cm__card--wide">
              <p className="cm__label">{tokens.length} tokens</p>
              <div className="cm__tokens">
                {tokens.map((t, i) => (
                  <span key={i} className={`cm-token cm-token--${t.type}`} style={{ "--i": i } as CSSProperties}>
                    <strong>{t.value}</strong>
                    <small>{TOKEN_LABELS[t.type]}</small>
                  </span>
                ))}
              </div>
            </div>
          )}

          {stage.id === "parser" && (
            <div className="cm__card cm__card--wide cm__tree">
              <TreeNode node={ruleTree(rule)} depth={0} />
            </div>
          )}

          {stage.id === "semantic" && (
            <div className="cm__card cm__card--wide">
              <div className="cm__semantic-top">
                <pre className="cm__code cm__code--small">
                  {checked.shown.split("\n").map((line, i) => (
                    <div key={i}>
                      <LanguageLine text={line} />
                    </div>
                  ))}
                </pre>
                <button className={`cm__break ${broken ? "cm__break--on" : ""}`} onClick={() => setBroken((b) => !b)} disabled={!registry.actuators[0]}>
                  {broken ? "Arreglarlo" : "Provocar un error"}
                </button>
              </div>

              {errors.length === 0 && !("parseError" in checked) ? (
                <ul className="cm__checks">
                  {program.declarations.map((d) => {
                    const item = d.kind === "SensorDeclaration" ? registry.sensors.find((s) => s.id === d.id) : registry.actuators.find((a) => a.id === d.id);
                    return (
                      <li key={d.id} className="ok">
                        <CheckIcon size={20} />
                        <span>
                          <strong>{d.id}</strong> existe y es {d.kind === "SensorDeclaration" ? "un sensor" : "un equipo"} registrado
                          {item ? ` («${item.label}»)` : ""}.
                        </span>
                      </li>
                    );
                  })}
                  {applied.map((id) => (
                    <li key={id} className="ok">
                      <CheckIcon size={20} />
                      <span>
                        <strong>Regla de tipos {id}:</strong> {TYPE_RULE_TEXT[id] ?? TYPE_MATRIX.find((t) => t.id === id)?.result}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <ul className="cm__checks">
                    {"parseError" in checked && (
                      <li className="bad">
                        <WarningIcon size={20} />
                        <span>{checked.parseError}</span>
                      </li>
                    )}
                    {errors.map((err, i) => (
                      <li key={i} className="bad">
                        <WarningIcon size={20} />
                        <span>
                          <strong>{err.category.replace(/_/g, " ").toLowerCase()}</strong> ({err.rule}): {err.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="cm__stop">
                    <WarningIcon size={18} />
                    <span>
                      El compilador se detiene aquí: <strong>no se genera ningún código</strong>. Nunca llega nada equivocado a la placa.
                    </span>
                  </p>
                </>
              )}
            </div>
          )}

          {stage.id === "ir" && (
            <div className="cm__card cm__card--wide">
              {ir ? (
                <div className="cm__ir-wrap">
                  <div className="cm-ir">
                    <QuadrupleTable ir={ir} />
                  </div>
                  <ul className="cm__ops">
                    {usedOps.map((op) => (
                      <li key={op}>
                        <code>{op}</code> {OP_TEXT[op] ?? ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="cm__stop">
                  <WarningIcon size={18} /> Esta regla tiene errores: no se puede generar el código intermedio.
                </p>
              )}
            </div>
          )}

          {stage.id === "cpp" && (
            <div className="cm__card cm__card--wide cm__cpp">
              <p className="cm__label">
                {ir ? `${ir.quadruples.length} instrucciones simples → ${loopLines.length} líneas de C++` : "C++"} · se omite la preparación
                (pines y sensor)
              </p>
              <div className="cm__cpp-scroll">
                <CodeBlock lines={loopLines} highlight={(t) => <CppLine text={t} />} />
              </div>
            </div>
          )}

          {stage.id === "board" && (
            <div className="cm__card cm__card--wide cm__board">
              <p className="cm__label">Programa completo del dispositivo ({device.rules.length} reglas)</p>
              <CompilePanel code={fullCpp} />
            </div>
          )}
        </section>
      </div>

      <div className="cm__footer">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <BackIcon size={18} /> Anterior
        </button>
        <span>← → para moverte entre etapas</span>
        <button className="cm__next" onClick={() => setStep((s) => Math.min(STAGES.length - 1, s + 1))} disabled={step === STAGES.length - 1}>
          Siguiente <ArrowIcon size={18} />
        </button>
      </div>
    </div>
  );
}
