// Contraparte de cppGenerator.ts: interpreta las líneas "AGRO ..." que el sketch
// imprime por el puerto serie. Es código puro (sin Tauri ni DOM).
//   AGRO LEER <SENSOR> <valor>      AGRO REGLA <id> <0|1>
//   AGRO ENCENDER <EQUIPO>          AGRO APAGAR <EQUIPO>      AGRO ERROR <mensaje>
export type AgroEvent =
  | { kind: "LEER"; id: string; value: number }
  | { kind: "REGLA"; id: string; holds: boolean }
  | { kind: "ENCENDER" | "APAGAR"; id: string }
  | { kind: "ERROR"; message: string };

// Devuelve null para cualquier otra línea (arranque de la placa, ruido, etc.).
export function parseAgroLine(line: string): AgroEvent | null {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== "AGRO" || parts.length < 3) return null;
  const [, verb, id, rest] = parts;
  switch (verb) {
    case "LEER": {
      const value = Number(rest);
      return rest !== undefined && Number.isFinite(value) ? { kind: "LEER", id, value } : null;
    }
    case "REGLA":
      return rest === "0" || rest === "1" ? { kind: "REGLA", id, holds: rest === "1" } : null;
    case "ENCENDER":
    case "APAGAR":
      return { kind: verb, id };
    case "ERROR":
      return { kind: "ERROR", message: parts.slice(2).join(" ") };
    default:
      return null;
  }
}
