// Lexer del lenguaje intermedio de Agrocode. Convierte el texto que escribe
// el agricultor/docente (o la propia app, vía lenguaje.ts) en una lista de
// tokens con número de línea, para que el parser (src/core/parser.ts) y los
// errores semánticos puedan citar dónde ocurrió cada cosa.
export type TipoToken =
  | "PALABRA_CLAVE"
  | "IDENTIFICADOR"
  | "NUMERO"
  | "OPERADOR_RELACIONAL"
  | "OPERADOR_LOGICO"
  | "PUNTO_Y_COMA"
  | "PAREN_ABRE"
  | "PAREN_CIERRA"
  | "DOS_PUNTOS"
  | "HORA"
  | "FIN";

export interface Token {
  tipo: TipoToken;
  valor: string;
  linea: number;
}

// Exportado para que la UI (resaltado de sintaxis en PanelSalida) pinte las
// mismas palabras clave que reconoce el lexer, sin mantener una lista aparte.
export const PALABRAS_CLAVE = new Set([
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

export class ErrorLexico extends Error {
  linea: number;
  constructor(mensaje: string, linea: number) {
    super(`Error léxico (línea ${linea}): ${mensaje}`);
    this.name = "ErrorLexico";
    this.linea = linea;
  }
}

export function tokenizar(fuente: string): Token[] {
  const tokens: Token[] = [];
  let linea = 1;
  let i = 0;

  const esEspacio = (c: string) => c === " " || c === "\t" || c === "\r";
  const esDigito = (c: string) => c >= "0" && c <= "9";
  const esLetraOGuion = (c: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ_]/.test(c);
  const esIdentificador = (c: string) => esLetraOGuion(c) || esDigito(c);

  while (i < fuente.length) {
    const c = fuente[i];

    if (c === "\n") {
      linea++;
      i++;
      continue;
    }
    if (esEspacio(c)) {
      i++;
      continue;
    }
    if (c === "/" && fuente[i + 1] === "/") {
      while (i < fuente.length && fuente[i] !== "\n") i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ tipo: "PUNTO_Y_COMA", valor: ";", linea });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ tipo: "PAREN_ABRE", valor: "(", linea });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ tipo: "PAREN_CIERRA", valor: ")", linea });
      i++;
      continue;
    }
    if (c === "<" || c === ">") {
      if (fuente[i + 1] === "=") {
        tokens.push({ tipo: "OPERADOR_RELACIONAL", valor: c + "=", linea });
        i += 2;
      } else {
        tokens.push({ tipo: "OPERADOR_RELACIONAL", valor: c, linea });
        i++;
      }
      continue;
    }
    if (c === "=") {
      tokens.push({ tipo: "OPERADOR_RELACIONAL", valor: "=", linea });
      i++;
      continue;
    }
    // HH:MM para las restricciones horarias (SIEMPRE QUE HORA ENTRE 06:00 Y 18:00).
    if (esDigito(c)) {
      let j = i;
      while (j < fuente.length && esDigito(fuente[j])) j++;
      if (fuente[j] === ":" && esDigito(fuente[j + 1])) {
        const inicio = i;
        j++;
        while (j < fuente.length && esDigito(fuente[j])) j++;
        tokens.push({ tipo: "HORA", valor: fuente.slice(inicio, j), linea });
        i = j;
        continue;
      }
      let esDecimal = false;
      if (fuente[j] === "." && esDigito(fuente[j + 1])) {
        esDecimal = true;
        j++;
        while (j < fuente.length && esDigito(fuente[j])) j++;
      }
      tokens.push({ tipo: "NUMERO", valor: fuente.slice(i, j), linea });
      i = j;
      void esDecimal;
      continue;
    }
    if (esLetraOGuion(c)) {
      let j = i;
      while (j < fuente.length && esIdentificador(fuente[j])) j++;
      const palabra = fuente.slice(i, j).toUpperCase();
      tokens.push({
        tipo: PALABRAS_CLAVE.has(palabra) ? "PALABRA_CLAVE" : "IDENTIFICADOR",
        valor: palabra,
        linea,
      });
      i = j;
      continue;
    }

    throw new ErrorLexico(`carácter inesperado "${c}"`, linea);
  }

  tokens.push({ tipo: "FIN", valor: "", linea });
  return tokens;
}
