// Casos de prueba del analizador semántico — una sola fuente para la app
// (pestaña "Evidencia" de PanelEvidencia.tsx) y para el CLI
// (scripts/analizar.ts), para que ambos no puedan divergir sobre qué se
// espera de cada caso. Los .agro viven en casos/ y llevan dos líneas de
// cabecera en comentario:
//   // ESPERADO: VALIDO | RECHAZADO
//   // REGLA: T1, T4        (las filas de MATRIZ_TIPOS / REGLAS_IDENTIFICADORES que aplican)
// Un .agro sin esa cabecera (p. ej. casos/ejemplo.agro, que es una plantilla
// comentada para que el equipo agregue casos propios) queda fuera de esta
// lista a propósito.
const archivos = import.meta.glob("../../casos/*.agro", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

export interface CasoPrueba {
  archivo: string; // nombre de archivo, p. ej. "1-riego-basico.agro"
  fuente: string;
  esperado: "VALIDO" | "RECHAZADO";
  reglaEsperada: string;
}

function extraerCabecera(fuente: string): { esperado: "VALIDO" | "RECHAZADO"; reglaEsperada: string } | null {
  const esperadoMatch = fuente.match(/\/\/\s*ESPERADO:\s*(VALIDO|RECHAZADO)/i);
  if (!esperadoMatch) return null;
  const reglaMatch = fuente.match(/\/\/\s*REGLA:\s*(.+)/i);
  return {
    esperado: esperadoMatch[1].toUpperCase() as "VALIDO" | "RECHAZADO",
    reglaEsperada: reglaMatch ? reglaMatch[1].trim() : "-",
  };
}

export const CASOS_PRUEBA: CasoPrueba[] = Object.entries(archivos)
  .map(([ruta, fuente]) => ({ archivo: ruta.split("/").pop()!, fuente, cabecera: extraerCabecera(fuente) }))
  .filter((c): c is typeof c & { cabecera: NonNullable<(typeof c)["cabecera"]> } => c.cabecera !== null)
  .sort((a, b) => a.archivo.localeCompare(b.archivo))
  .map((c) => ({ archivo: c.archivo, fuente: c.fuente, esperado: c.cabecera.esperado, reglaEsperada: c.cabecera.reglaEsperada }));
