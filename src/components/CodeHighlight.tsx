// Resaltado de sintaxis para el panel de salida. Para la pestaña "Lenguaje"
// reutiliza el vocabulario de palabras clave del propio lexer del compilador
// (src/compiler/lexer.ts) en vez de mantener una lista de colores aparte — así
// una palabra clave nueva en el lenguaje se pinta sola sin tocar la UI.
import type { ReactNode } from "react";
import { KEYWORDS } from "../compiler/lexer";

const LANGUAGE_TOKEN = /\d{1,2}:\d{2}|\d+(?:\.\d+)?|[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-zÁÉÍÓÚÑáéíóúñ0-9_]*/g;

export function LanguageLine({ text }: { text: string }) {
  const commentIndex = text.indexOf("//");
  const code = commentIndex >= 0 ? text.slice(0, commentIndex) : text;
  const comment = commentIndex >= 0 ? text.slice(commentIndex) : "";

  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  LANGUAGE_TOKEN.lastIndex = 0;
  while ((m = LANGUAGE_TOKEN.exec(code))) {
    if (m.index > last) nodes.push(code.slice(last, m.index));
    const t = m[0];
    const isNumber = /^(\d{1,2}:\d{2}|\d+(\.\d+)?)$/.test(t);
    const className = isNumber ? "tok-number" : KEYWORDS.has(t.toUpperCase()) ? "tok-keyword" : "tok-ident";
    nodes.push(
      <span key={key++} className={className}>
        {t}
      </span>
    );
    last = m.index + t.length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  if (comment)
    nodes.push(
      <span key={key++} className="tok-comment">
        {comment}
      </span>
    );
  return <>{nodes}</>;
}

// Resaltado ligero por regex para el .ino generado — no es un lexer de C++,
// solo marca palabras clave de Arduino/C++ para que se lea como código.
const CPP_KEYWORDS = new Set([
  "void",
  "int",
  "float",
  "bool",
  "const",
  "if",
  "else",
  "return",
  "true",
  "false",
  "digitalWrite",
  "digitalRead",
  "analogRead",
  "pinMode",
  "delay",
  "Serial",
  "setup",
  "loop",
  "OUTPUT",
  "INPUT",
  "HIGH",
  "LOW",
]);

const CPP_TOKEN = /#\w+|\d+(?:\.\d+)?|[A-Za-z_]\w*/g;

export function CppLine({ text }: { text: string }) {
  const commentIndex = text.indexOf("//");
  const code = commentIndex >= 0 ? text.slice(0, commentIndex) : text;
  const comment = commentIndex >= 0 ? text.slice(commentIndex) : "";

  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  CPP_TOKEN.lastIndex = 0;
  while ((m = CPP_TOKEN.exec(code))) {
    if (m.index > last) nodes.push(code.slice(last, m.index));
    const t = m[0];
    let className: string | null = null;
    if (t.startsWith("#")) className = "tok-keyword";
    else if (/^\d+(\.\d+)?$/.test(t)) className = "tok-number";
    else if (CPP_KEYWORDS.has(t)) className = "tok-keyword";
    else className = "tok-ident";
    nodes.push(
      <span key={key++} className={className}>
        {t}
      </span>
    );
    last = m.index + t.length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  if (comment)
    nodes.push(
      <span key={key++} className="tok-comment">
        {comment}
      </span>
    );
  return <>{nodes}</>;
}
