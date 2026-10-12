// CLI del analizador semántico — la "consola" que pide la Actividad 5.
//
// No trae casos de prueba escritos adentro: recibe la instrucción desde
// afuera (archivo, carpeta o stdin) y solo reporta lo que el analizador
// concluyó. Los casos de prueba van en archivos .agro sueltos, típicamente
// dentro de examples/ (hay una plantilla en examples/template.agro).
//
// Uso:
//   npm run analyze -- examples/mi-caso.agro   analiza un archivo
//   npm run analyze -- examples/               analiza todos los .agro de la carpeta
//   npm run analyze                            lee la instrucción de stdin
//   echo "CULTIVO CANA; ..." | npm run analyze
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseProgram } from "../src/compiler/parser.ts";
import { blockingErrors, checkProgram } from "../src/compiler/typeChecker.ts";
import { isBlocking } from "../src/compiler/errors.ts";
import { generateIntermediateCode, intermediateCodeToText } from "../src/compiler/intermediateCode.ts";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

// Cabecera opcional de los .agro:
//   // ESPERADO: VALIDO | RECHAZADO
//   // REGLA: T1, T4
// Si el archivo la trae, el CLI compara el resultado obtenido contra ella.
function readHeader(text: string): { expected: "VALIDO" | "RECHAZADO"; expectedRule: string } | null {
  const expectedMatch = text.match(/\/\/\s*ESPERADO:\s*(VALIDO|RECHAZADO)/i);
  if (!expectedMatch) return null;
  const ruleMatch = text.match(/\/\/\s*REGLA:\s*(.+)/i);
  return { expected: expectedMatch[1].toUpperCase() as "VALIDO" | "RECHAZADO", expectedRule: ruleMatch ? ruleMatch[1].trim() : "-" };
}

function analyzeText(name: string, text: string): boolean {
  console.log(`\n=== ${name} ===`);
  console.log("Entrada:");
  console.log(
    text
      .trim()
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")
  );
  console.log("");

  const header = readHeader(text);
  if (header) {
    console.log(`Resultado esperado: ${header.expected} (regla: ${header.expectedRule})`);
  }

  const reportMatch = (obtained: "VALIDO" | "RECHAZADO"): boolean => {
    if (!header) return obtained === "VALIDO";
    const matches = obtained === header.expected;
    console.log(matches ? "✓ Coincide con lo esperado." : `✗ NO coincide con lo esperado (se esperaba ${header.expected}).`);
    return matches;
  };

  let program;
  try {
    program = parseProgram(text);
  } catch (e) {
    console.log(`ERROR SEMÁNTICO [REGLA_MAL_FORMADA]`);
    console.log(`  ${(e as Error).message}`);
    console.log("\nResultado obtenido: RECHAZADO");
    return reportMatch("RECHAZADO");
  }

  const results = checkProgram(program);

  for (const r of results) {
    const errors = r.errors.filter(isBlocking);
    const warnings = r.errors.filter((e) => !isBlocking(e));

    if (errors.length === 0) {
      console.log(`[${r.ruleId}] Expresión válida`);
      console.log(`  Tipos compatibles`);
      if (r.inferredType) console.log(`  Resultado: ${r.inferredType}`);
      if (r.appliedRules.length > 0) console.log(`  Regla aplicada: ${r.appliedRules.join(", ")}`);
    } else {
      for (const err of errors) {
        console.log(`[${r.ruleId}] ERROR SEMÁNTICO [${err.category}]${err.line ? ` línea ${err.line}` : ""}`);
        console.log(`  ${err.message}`);
        console.log(`  Regla aplicada: ${err.rule}`);
      }
    }
    for (const warning of warnings) {
      console.log(`[${r.ruleId}] ADVERTENCIA — ${warning.message} (regla ${warning.rule})`);
    }
  }

  const valid = blockingErrors(results).length === 0;
  if (valid) {
    console.log("\nCódigo intermedio (cuádruplos):");
    console.log(
      intermediateCodeToText(generateIntermediateCode(program))
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")
    );
  }

  console.log(`\nResultado obtenido: ${valid ? "VÁLIDO" : "RECHAZADO"}`);
  return reportMatch(valid ? "VALIDO" : "RECHAZADO");
}

async function main() {
  const args = process.argv.slice(2);
  let anyRejected = false;

  if (args.length === 0) {
    const text = await readStdin();
    if (!text.trim()) {
      console.error("No se recibió ninguna instrucción (stdin vacío). Pasa un archivo/carpeta o escribe en stdin.");
      process.exit(1);
    }
    anyRejected = !analyzeText("stdin", text);
  } else {
    for (const path of args) {
      if (statSync(path).isDirectory()) {
        const files = readdirSync(path).filter((f) => f.endsWith(".agro"));
        if (files.length === 0) {
          console.error(`No hay archivos .agro en "${path}".`);
          continue;
        }
        for (const file of files) {
          if (!analyzeText(file, readFileSync(join(path, file), "utf8"))) anyRejected = true;
        }
      } else if (!analyzeText(path, readFileSync(path, "utf8"))) {
        anyRejected = true;
      }
    }
  }

  process.exit(anyRejected ? 1 : 0);
}

main();
