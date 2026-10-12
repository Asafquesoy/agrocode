// Lexer del lenguaje intermedio de Agrocode. Convierte el texto que escribe
// el agricultor/docente (o la propia app, vía printer.ts) en una lista de
// tokens con número de línea, para que el parser (src/compiler/parser.ts) y
// los errores semánticos puedan citar dónde ocurrió cada cosa.
export type TokenType =
  | "KEYWORD"
  | "IDENTIFIER"
  | "NUMBER"
  | "RELATIONAL_OPERATOR"
  | "SEMICOLON"
  | "LPAREN"
  | "RPAREN"
  | "TIME"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

// Exportado para que la UI (resaltado de sintaxis en CodeHighlight) pinte las
// mismas palabras clave que reconoce el lexer, sin mantener una lista aparte.
export const KEYWORDS = new Set([
  "CULTIVO",
  "SENSOR",
  "ACTUADOR",
  "SI",
  "ENCENDER",
  "APAGAR",
  "ESPERAR",
  "SIEMPRE",
  "QUE",
  "HORA",
  "ENTRE",
  "Y",
  "O",
]);

export class LexError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Error léxico (línea ${line}): ${message}`);
    this.name = "LexError";
    this.line = line;
  }
}

const isWhitespace = (c: string) => c === " " || c === "\t" || c === "\r";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isLetter = (c: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ_]/.test(c);
const isIdentifierChar = (c: string) => isLetter(c) || isDigit(c);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (isWhitespace(c)) {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ type: "SEMICOLON", value: ";", line });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(", line });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")", line });
      i++;
      continue;
    }
    if (c === "<" || c === ">") {
      if (source[i + 1] === "=") {
        tokens.push({ type: "RELATIONAL_OPERATOR", value: c + "=", line });
        i += 2;
      } else {
        tokens.push({ type: "RELATIONAL_OPERATOR", value: c, line });
        i++;
      }
      continue;
    }
    if (c === "=") {
      tokens.push({ type: "RELATIONAL_OPERATOR", value: "=", line });
      i++;
      continue;
    }
    // HH:MM para las restricciones horarias (SIEMPRE QUE HORA ENTRE 06:00 Y 18:00).
    if (isDigit(c)) {
      let j = i;
      while (j < source.length && isDigit(source[j])) j++;
      if (source[j] === ":" && isDigit(source[j + 1])) {
        const start = i;
        j++;
        while (j < source.length && isDigit(source[j])) j++;
        tokens.push({ type: "TIME", value: source.slice(start, j), line });
        i = j;
        continue;
      }
      if (source[j] === "." && isDigit(source[j + 1])) {
        j++;
        while (j < source.length && isDigit(source[j])) j++;
      }
      tokens.push({ type: "NUMBER", value: source.slice(i, j), line });
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i;
      while (j < source.length && isIdentifierChar(source[j])) j++;
      const word = source.slice(i, j).toUpperCase();
      tokens.push({
        type: KEYWORDS.has(word) ? "KEYWORD" : "IDENTIFIER",
        value: word,
        line,
      });
      i = j;
      continue;
    }

    throw new LexError(`carácter inesperado "${c}"`, line);
  }

  tokens.push({ type: "EOF", value: "", line });
  return tokens;
}
