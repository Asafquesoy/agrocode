# Agrocode App

Aplicación de escritorio (Tauri + React + TypeScript) para programar dispositivos ESP32 agrícolas
mediante una interfaz de "receta": el agricultor elige su cultivo, recibe reglas de riego/monitoreo
pre-armadas con umbrales calibrados y las ajusta con sliders, en vez de construir lógica desde cero.

## Requisitos previos

Para correr o compilar la app en otra PC hace falta instalar:

1. **Node.js** (v18 o superior) y npm — https://nodejs.org/
2. **Rust** (toolchain estable) — https://www.rust-lang.org/tools/install
   - En Windows también se necesita **Microsoft C++ Build Tools** (Visual Studio Build Tools con el workload "Desktop development with C++") y **WebView2** (viene preinstalado en Windows 10/11 actualizados; si falta, se descarga de Microsoft).
   - En Linux hacen falta las dependencias de sistema de Tauri (webkit2gtk, libayatana-appindicator, etc.) — ver la guía oficial: https://v2.tauri.app/start/prerequisites/
   - En macOS hace falta Xcode Command Line Tools.

## Instalación

Clonar/copiar la carpeta `agrocode-app` en la otra PC y luego:

```bash
cd agrocode-app
npm install
```

## Correr en modo desarrollo

```bash
npm run tauri dev
```

Esto levanta el servidor de Vite (frontend) y abre la ventana nativa de Tauri con hot-reload.

## Compilar el ejecutable (build de producción)

```bash
npm run tauri build
```

El instalador/ejecutable final queda en `src-tauri/target/release/bundle/`.

## Scripts disponibles

- `npm run dev` — solo el frontend (Vite), sin la ventana nativa.
- `npm run build` — compila el frontend (TypeScript + Vite).
- `npm run tauri dev` — corre la app completa en modo desarrollo.
- `npm run tauri build` — genera el instalador/ejecutable de producción.

## Estructura del proyecto

- `src/` — código del frontend (React + TypeScript). El núcleo del compilador (AST, análisis de
  tipos, generación de C++) vive en `src/compiler/`, independiente de la UI. La interfaz
  vive en `src/recipe/` y `src/components/`.
- `src-tauri/` — backend nativo en Rust (ventana, plugins, configuración de Tauri).
- `public/` — archivos estáticos.
- `dist/` — salida del build del frontend (generada, no versionar).

Ver `ROADMAP.md` para las fases de desarrollo planeadas (compilación/flasheo real vía `arduino-cli`,
detección de puerto serial, descubrimiento de sensores, persistencia, etc.) y `CLAUDE.md` para una
descripción más detallada de la arquitectura.

## Demostrar el analizador semántico

El analizador semántico (`src/compiler/typeChecker.ts` + `src/compiler/symbolTable.ts`) se puede
recorrer de dos formas, ambas usando el mismo código:

1. **Desde la interfaz**: la pestaña **Escribir** del panel de salida permite pegar texto del
   lenguaje a mano y ver el análisis (`parseProgram` + `checkProgram`).
2. **Desde la consola**, con el CLI:
   ```bash
   npm run analyze -- examples/
   ```
   Analiza los `.agro` de `examples/` y compara el resultado
   contra la cabecera `// ESPERADO: VALIDO|RECHAZADO` de cada archivo.

## Notas

- El identificador de la app es `com.omara.agrocode-app`.
- Si `npm run tauri dev` falla por falta de Rust o de las herramientas de compilación de C++, revisar los requisitos previos arriba.
