// Resaltado de sintaxis para el panel de salida. Para la pestaña "Lenguaje"
// reutiliza el vocabulario de palabras clave del propio lexer del núcleo
// (src/core/lexer.ts) en vez de mantener una lista de colores aparte — así
// una palabra clave nueva en el lenguaje se pinta sola sin tocar la UI.
import type { ReactNode } from "react";
import { PALABRAS_CLAVE } from "../core/lexer";

const TOKEN_LENGUAJE = /\d{1,2}:\d{2}|\d+(?:\.\d+)?|[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-zÁÉÍÓÚÑáéíóúñ0-9_]*/g;

export function LineaLenguaje({ texto }: { texto: string }) {
  const idxComentario = texto.indexOf("//");
  const codigo = idxComentario >= 0 ? texto.slice(0, idxComentario) : texto;
  const comentario = idxComentario >= 0 ? texto.slice(idxComentario) : "";

  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;
  let m: RegExpExecArray | null;
  TOKEN_LENGUAJE.lastIndex = 0;
  while ((m = TOKEN_LENGUAJE.exec(codigo))) {
    if (m.index > ultimo) nodos.push(codigo.slice(ultimo, m.index));
    const t = m[0];
    const esNumero = /^(\d{1,2}:\d{2}|\d+(\.\d+)?)$/.test(t);
    const clase = esNumero ? "tok-numero" : PALABRAS_CLAVE.has(t.toUpperCase()) ? "tok-clave" : "tok-ident";
    nodos.push(
      <span key={clave++} className={clase}>
        {t}
      </span>
    );
    ultimo = m.index + t.length;
  }
  if (ultimo < codigo.length) nodos.push(codigo.slice(ultimo));
  if (comentario)
    nodos.push(
      <span key={clave++} className="tok-comentario">
        {comentario}
      </span>
    );
  return <>{nodos}</>;
}

// Resaltado ligero por regex para el .ino generado — no es un lexer de C++,
// solo marca palabras clave de Arduino/C++ para que se lea como código.
const PALABRAS_CPP = new Set([
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

const TOKEN_CPP = /#\w+|\d+(?:\.\d+)?|[A-Za-z_]\w*/g;

export function LineaCpp({ texto }: { texto: string }) {
  const idxComentario = texto.indexOf("//");
  const codigo = idxComentario >= 0 ? texto.slice(0, idxComentario) : texto;
  const comentario = idxComentario >= 0 ? texto.slice(idxComentario) : "";

  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let clave = 0;
  let m: RegExpExecArray | null;
  TOKEN_CPP.lastIndex = 0;
  while ((m = TOKEN_CPP.exec(codigo))) {
    if (m.index > ultimo) nodos.push(codigo.slice(ultimo, m.index));
    const t = m[0];
    let clase: string | null = null;
    if (t.startsWith("#")) clase = "tok-clave";
    else if (/^\d+(\.\d+)?$/.test(t)) clase = "tok-numero";
    else if (PALABRAS_CPP.has(t)) clase = "tok-clave";
    else clase = "tok-ident";
    nodos.push(
      <span key={clave++} className={clase}>
        {t}
      </span>
    );
    ultimo = m.index + t.length;
  }
  if (ultimo < codigo.length) nodos.push(codigo.slice(ultimo));
  if (comentario)
    nodos.push(
      <span key={clave++} className="tok-comentario">
        {comentario}
      </span>
    );
  return <>{nodos}</>;
}
