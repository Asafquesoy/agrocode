// Exportar el sketch .ino generado: guardado nativo en Tauri, descarga en el
// navegador (npm run dev) y copia al portapapeles.
import { isTauri } from "@tauri-apps/api/core";

// Devuelve true si se guardó y false si el usuario canceló el diálogo.
export async function saveSketch(cppText: string, crop: string): Promise<boolean> {
  const defaultName = `agrocode_${crop.toLowerCase()}.ino`;

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "Sketch de Arduino", extensions: ["ino"] }],
    });
    if (path === null) return false;
    await writeTextFile(path, cppText);
    return true;
  }

  const url = URL.createObjectURL(new Blob([cppText], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function copySketch(cppText: string): Promise<void> {
  await navigator.clipboard.writeText(cppText);
}
