// CLI del analizador semántico — la "consola" que pide la Actividad 5.
//
// No trae casos de prueba escritos adentro: recibe la instrucción desde
// afuera (archivo, carpeta o stdin) y solo reporta lo que el analizador
// concluyó. Los casos de prueba del equipo van en archivos .agro sueltos,
// típicamente dentro de casos/ (hay un ejemplo mínimo en casos/ejemplo.agro).
//
// Uso:
//   npm run analizar -- casos/mi-caso.agro   analiza un archivo
//   npm run analizar -- casos/               analiza todos los .agro de la carpeta
//   npm run analizar                         lee la instrucción de stdin
//   echo "CULTIVO CANA; ..." | npm run analizar
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parsearPrograma } from "../src/core/parser.ts";
import { verificarPrograma } from "../src/core/analizadorTipos.ts";

function leerStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let datos = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (datos += chunk));
    process.stdin.on("end", () => resolve(datos));
    process.stdin.on("error", reject);
  });
}

function analizarTexto(nombre: string, texto: string): boolean {
  console.log(`\n=== ${nombre} ===`);
  console.log("Entrada:");
  console.log(
    texto
      .trim()
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")
  );
  console.log("");

  let programa;
  try {
    programa = parsearPrograma(texto);
  } catch (e) {
    console.log(`ERROR SEMÁNTICO [REGLA_MAL_FORMADA]`);
    console.log(`  ${(e as Error).message}`);
    return false;
  }

  const analisis = verificarPrograma(programa);
  let ok = true;

  for (const r of analisis) {
    const errores = r.errores.filter((e) => e.categoria !== "ADVERTENCIA");
    const advertencias = r.errores.filter((e) => e.categoria === "ADVERTENCIA");

    if (errores.length === 0) {
      console.log(`[${r.reglaId}] Expresión válida`);
      console.log(`  Tipos compatibles`);
      if (r.tipoInferido) console.log(`  Resultado: ${r.tipoInferido}`);
    } else {
      ok = false;
      for (const err of errores) {
        console.log(`[${r.reglaId}] ERROR SEMÁNTICO [${err.categoria}]${err.linea ? ` línea ${err.linea}` : ""}`);
        console.log(`  ${err.mensaje}`);
        console.log(`  Regla aplicada: ${err.regla}`);
      }
    }
    for (const adv of advertencias) {
      console.log(`[${r.reglaId}] ADVERTENCIA — ${adv.mensaje} (regla ${adv.regla})`);
    }
  }

  console.log(ok ? "\nResultado obtenido: VÁLIDO" : "\nResultado obtenido: RECHAZADO");
  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  let huboRechazo = false;

  if (args.length === 0) {
    const texto = await leerStdin();
    if (!texto.trim()) {
      console.error("No se recibió ninguna instrucción (stdin vacío). Pasa un archivo/carpeta o escribe en stdin.");
      process.exit(1);
    }
    huboRechazo = !analizarTexto("stdin", texto);
  } else {
    for (const ruta of args) {
      const info = statSync(ruta);
      if (info.isDirectory()) {
        const archivos = readdirSync(ruta).filter((f) => f.endsWith(".agro"));
        if (archivos.length === 0) {
          console.error(`No hay archivos .agro en "${ruta}".`);
          continue;
        }
        for (const archivo of archivos) {
          const ruta2 = join(ruta, archivo);
          if (!analizarTexto(archivo, readFileSync(ruta2, "utf8"))) huboRechazo = true;
        }
      } else {
        if (!analizarTexto(ruta, readFileSync(ruta, "utf8"))) huboRechazo = true;
      }
    }
  }

  process.exit(huboRechazo ? 1 : 0);
}

main();
