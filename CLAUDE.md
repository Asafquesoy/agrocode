# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

Agrocode es un compilador visual para programar dispositivos ESP32 agrícolas. El usuario (agricultor, sin conocimientos de programación) registra libremente el cultivo o proceso que quiere programar, registra sus sensores y actuadores con sus propios parámetros, arma reglas de riego/monitoreo con esos registros mediante un asistente (en vez de construir lógica desde cero), guarda la configuración de su dispositivo y puede controlarlo a distancia. La app genera:

1. Un **lenguaje intermedio** legible (`CULTIVO CAÑA; SI HUMEDAD_SUELO < 30 ENCENDER BOMBA_PRINCIPAL;`).
2. Un **análisis de tipos** contra una matriz de reglas fija (de la "Actividad 5: Reglas de tipos de datos").
3. Un **sketch .ino en C++** listo para subir a un ESP32 (framework Arduino).

Es una app de escritorio (Tauri + React + TypeScript), no una web app ni una CLI.

La interfaz es una sola: **"Receta" (`src/propuestas/receta/`)**. Hubo dos propuestas alternativas (bloques estilo Blockly, tarjetas estilo IFTTT) que se evaluaron y descartaron; ya no están en el repo.

El alcance completo (funcionalidades incluidas y explícitamente fuera de esta versión) está en `ALCANCE.txt`.

**Nota sobre estado actual vs. alcance objetivo:** el código hoy (`tipos.ts`) todavía implementa `CULTIVOS`, `SENSORES` y `ACTUADORES` como catálogos fijos, no como registros dinámicos creados por el usuario. Migrar a registro dinámico de cultivo/sensores/actuadores, persistencia editable de la configuración del dispositivo (con soporte para más de un dispositivo por usuario, cada uno con nombre propio) y control remoto es trabajo pendiente — ver `ROADMAP.md`.

**El usuario final (agricultor) no tiene ni debe necesitar ningún conocimiento técnico.** Esto restringe cómo se implementa el registro dinámico y el control remoto:
- La asignación del pin de ESP32 a cada sensor/actuador registrado debe ser **automática**, nunca algo que el agricultor tenga que elegir o entender.
- Los conflictos de pines entre sensores/actuadores deben **detectarse y resolverse automáticamente** dentro del sistema, no exponerse como un problema que el agricultor deba diagnosticar.
- Conectar el dispositivo a la red local para el control remoto debe ser un paso **sencillo, sin configuración técnica** (nada de IPs, puertos o credenciales manuales de red).

El control remoto, cuando se implemente, es **solo dentro de la misma red local** (no hay servidor en la nube ni acceso por internet) y **sin autenticación**. Si se pierde la comunicación con el dispositivo, este continúa operando con la última configuración que tenía cargada y la app debe avisarle al usuario que se perdió la conexión.

Nota: el documento fuente "App para programar ESP32 agrícola.pdf" describe un stack tecnológico distinto al que realmente se usa aquí (propone Flutter/Dart) — se evaluó y se decidió **mantener Tauri + React + TypeScript** en vez de migrar, porque el núcleo del compilador ya funciona en TypeScript y Rust cubre el mismo rol que el PDF le da a Dart/Python (procesos hijo async, streaming de stdout, acceso a puerto serial). Ver `ROADMAP.md` para el plan de implementación por fases de lo que el PDF sí pide (compilar/flashear vía `arduino-cli`, detección de puerto, descubrimiento de sensores).

## Comandos

```bash
npm run dev          # solo frontend (Vite), sin ventana nativa — útil para iterar rápido en UI
npm run build         # tsc (type-check) + vite build del frontend
npm run tauri dev     # app completa (Rust + WebView) con hot-reload — requiere toolchain de Rust instalado
npm run tauri build   # genera el instalador/ejecutable final en src-tauri/target/release/bundle/
```

No hay test runner ni linter configurados en `package.json`. El único chequeo automático disponible es el type-check de TypeScript (`tsc`, corre como parte de `npm run build`); ejecútalo directo con `npx tsc --noEmit` para validar tipos sin generar el bundle de Vite.

## Arquitectura

### Núcleo del compilador: `src/core/` (independiente de la UI)

- `tipos.ts` — catálogo del dominio agrícola: `SENSORES`, `ACTUADORES`, `CULTIVOS` (cada uno con pines de ESP32 fijos, unidades, rangos de humedad). Este catálogo es la fuente de verdad para pines y unidades; el generador de C++ y la UI lo consultan por `id`, nunca hardcodean pines. **Pendiente de migración:** el alcance objetivo (`ALCANCE.txt`) pide que cultivo, sensores y actuadores sean registrados libremente por el usuario en vez de un catálogo fijo, editables y eliminables, y que el tipo de dato (`ENTERO`/`DECIMAL`/`BOOLEANO`) de cada sensor registrado se infiera automáticamente según cómo se usa en las reglas (no se le pregunta al usuario); hasta que eso se implemente (ver Fase 4 en `ROADMAP.md`), este archivo sigue siendo el catálogo fijo.
- `ast.ts` — define el AST (`Programa` → `Regla[]` → `condicion: Expr` + `acciones: Sentencia[]`) y expone *constructores de conveniencia* (`comparacion`, `logica`, `accionEstado`, `accionTiempo`) que usa la UI para no armar los nodos a mano.
- `analizadorTipos.ts` — analizador semántico. La matriz de tipos (`MATRIZ_TIPOS`) se modela como tabla de datos, no como ifs anidados, para que quede trazable contra el documento "Actividad 5". `verificarPrograma`/`programaValido` son el gate obligatorio antes de generar C++.
- `lenguaje.ts` — AST → texto del lenguaje intermedio (para que el agricultor/docente vea qué "entendió" el sistema).
- `generadorCpp.ts` — AST → sketch `.ino`. Llama a `verificarPrograma` internamente y **lanza excepción si hay errores de tipos**; nunca genera C++ de un programa inválido. Calcula automáticamente qué sensores/actuadores están en uso (`pinesUsados`) para no declarar pines que no se usan.

Flujo de datos: `interfaz visual → AST (Programa) → analizadorTipos → {lenguaje.ts, generadorCpp.ts}`. Si vas a agregar un tipo de sensor/actuador/acción nuevo, el orden de cambios es: `tipos.ts` (catálogo) → `ast.ts` (nodo + constructor) → `analizadorTipos.ts` (regla en `MATRIZ_TIPOS` + verificación) → `lenguaje.ts` y `generadorCpp.ts` (serialización) → por último `src/propuestas/receta/` para exponerlo en la UI.

### Interfaz: `src/propuestas/receta/`

`RecetaPropuesta.tsx` orquesta: elegir cultivo → cargar receta pre-armada (`recetas.ts`, con umbrales derivados de `DefinicionCultivo.humedadMinima/Maxima`) → editar umbrales con sliders → `AsistenteNuevaRegla.tsx` para agregar reglas nuevas vía wizard de 4 pasos (CUANDO → QUE_HAGO → CUANTO_TIEMPO → RESUMEN). Los sliders editan el AST inmutablemente vía funciones recursivas (`valorEditable`/`conValorActualizado` en `RecetaPropuesta.tsx`) que asumen que el valor editable es siempre el de la primera `Comparacion` del árbol de `Logica` (limitación conocida, ver `ROADMAP.md` Fase 7).

`RecetaPropuesta` pasa su `Programa` al componente compartido `src/componentes/PanelSalida.tsx`, que muestra 3 pestañas (Lenguaje / Análisis de tipos / C++) llamando directamente a `programaATexto`, `verificarPrograma` y `generarCpp`.

### Capa Tauri: `src-tauri/`

Backend nativo mínimo (Rust) — solo ventana y plugins (`plugin-opener`), sin comandos custom de Tauri por ahora (el único comando es el `greet` de scaffold). `tauri.conf.json` fija el puerto de dev en 5173 y apunta `frontendDist` a `../dist`. Si se agregan comandos Rust invocables desde el frontend (`#[tauri::command]`), se registran en `src-tauri/src/lib.rs`.

Hoy la app **solo muestra** el C++ generado; no hay guardado a disco, ni invocación de `arduino-cli`, ni detección de puerto serial, ni flasheo, ni persistencia de proyectos. Ese es el trabajo pendiente descrito en `ROADMAP.md`.
