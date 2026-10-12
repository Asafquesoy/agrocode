# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

Agrocode es un compilador visual para programar dispositivos ESP32 agrícolas. El usuario (agricultor, sin conocimientos de programación) registra libremente el cultivo o proceso que quiere programar, registra sus sensores y actuadores con sus propios parámetros, arma reglas de riego/monitoreo con esos registros mediante un asistente (en vez de construir lógica desde cero), guarda la configuración de su dispositivo y puede controlarlo a distancia. La app genera:

1. Un **lenguaje intermedio** legible (`CULTIVO CAÑA; SI HUMEDAD_SUELO < 30 ENCENDER BOMBA_PRINCIPAL;`).
2. Un **análisis de tipos** contra una matriz de reglas fija (de la "Actividad 5: Reglas de tipos de datos").
3. Un **sketch .ino en C++** listo para subir a un ESP32 (framework Arduino).

Es una app de escritorio (Tauri + React + TypeScript), no una web app ni una CLI.

La interfaz vive en `src/recipe/`: el usuario elige un cultivo, ajusta una receta pre-armada con sliders y agrega reglas con un asistente.

El alcance completo (funcionalidades incluidas y explícitamente fuera de esta versión) está en `ALCANCE.txt`.

**Nota sobre estado actual vs. alcance objetivo:** el código hoy (`catalog.ts`) todavía implementa `CROPS`, `SENSORS` y `ACTUATORS` como catálogos fijos, no como registros dinámicos creados por el usuario. Migrar a registro dinámico de cultivo/sensores/actuadores, persistencia editable de la configuración del dispositivo (con soporte para más de un dispositivo por usuario, cada uno con nombre propio) y control remoto es trabajo pendiente — ver `ROADMAP.md`.

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

### Compilador: `src/compiler/` (independiente de la UI)

- `catalog.ts` — catálogo del dominio agrícola: `SENSORS`, `ACTUATORS`, `CROPS` (cada uno con pines de ESP32 fijos, unidades, rangos de humedad). Este catálogo es la fuente de verdad para pines y unidades; el generador de C++ y la UI lo consultan por `id`, nunca hardcodean pines. **Pendiente de migración:** el alcance objetivo (`ALCANCE.txt`) pide que cultivo, sensores y actuadores sean registrados libremente por el usuario en vez de un catálogo fijo, editables y eliminables, y que el tipo de dato (`ENTERO`/`DECIMAL`/`BOOLEANO`) de cada sensor registrado se infiera automáticamente según cómo se usa en las reglas (no se le pregunta al usuario); hasta que eso se implemente (ver Fase 4 en `ROADMAP.md`), este archivo sigue siendo el catálogo fijo.
- `lexer.ts` — texto del lenguaje intermedio → tokens con número de línea (comentarios `//`, palabras clave, identificadores, números, operadores, horas `HH:MM`).
- `parser.ts` — tokens → AST (`parseProgram`). Deliberadamente permisivo: acepta cualquier cosa sintácticamente correcta aunque sea semánticamente inválida (p. ej. `HUMEDAD_SUELO < BOMBA_PRINCIPAL` o `ESPERAR 2.5`); rechazar eso es trabajo de `typeChecker.ts`/`symbolTable.ts`, no del parser.
- `ast.ts` — define el AST (`Program` → `Declaration[]` + `Rule[]` → `condition: Expr` + `actions: Statement[]`) y expone *constructores de conveniencia* (`comparison`, `comparisonWith`, `logical`, `stateAction`, `waitAction`, `usedDeclarations`) que usa la UI para no armar los nodos a mano.
- `symbolTable.ts` — valida declaración/uso de identificadores (`buildSymbolTable`): identificador no declarado, redeclarado, fuera de catálogo, usado en rol incorrecto (SENSOR↔ACTUADOR), cultivo inexistente, declarado sin usar. Las reglas están tabuladas en `IDENTIFIER_RULES` (I1–I6), igual que `TYPE_MATRIX`.
- `typeChecker.ts` — analizador semántico. La matriz de tipos (`TYPE_MATRIX`) se modela como tabla de datos, no como ifs anidados, para que quede trazable contra el documento "Actividad 5". `checkProgram`/`blockingErrors` son el gate obligatorio antes de generar C++; cada resultado incluye `appliedRules` (T1..T9 usadas, también en el caso válido) y `errors` (con categoría de `errors.ts`).
- `errors.ts` — tipo `SemanticError` (categoría + id de regla + mensaje + línea) y las 6 categorías (`ErrorCategory`); solo `ADVERTENCIA` no es bloqueante (`isBlocking`).
- `printer.ts` — AST → texto del lenguaje intermedio (para que el agricultor/docente vea qué "entendió" el sistema); es round-trip con `parser.ts`.
- `intermediateCode.ts` — AST verificado → **cuádruplos** `(op, arg1, arg2, resultado)` (`generateIntermediateCode`, `intermediateCodeToText`). Es el código intermedio del compilador: `LEER` por sensor usado, comparaciones/`Y`/`O` en temporales `t1..tN`, y por regla `SALTARF tN, Lk` + acciones + `ETIQUETA Lk`. Llama a `checkProgram`/`blockingErrors` y **lanza excepción si hay errores bloqueantes**; es el único gate antes de generar código.
- `cppGenerator.ts` — cuádruplos → sketch `.ino` (`irToCpp`; `generateCpp(program)` encadena IR + C++). No lee el AST: traduce 1:1 cada cuádruplo. Los sensores/actuadores en uso salen de los `LEER` y `ENCENDER/APAGAR` del IR para no declarar pines que no se usan.

Flujo de datos: `texto o interfaz visual → lexer.ts → parser.ts → AST (Programa) → symbolTable.ts + typeChecker.ts → intermediateCode.ts (cuádruplos) → cppGenerator.ts` (y `printer.ts` lee el AST para mostrar el texto). Si vas a agregar un tipo de sensor/actuador/acción nuevo, el orden de cambios es: `catalog.ts` (catálogo) → `ast.ts` (nodo + constructor) → `typeChecker.ts`/`symbolTable.ts` (regla en `TYPE_MATRIX`/`IDENTIFIER_RULES` + verificación) → `printer.ts`, `parser.ts`, `intermediateCode.ts` (nuevo cuádruplo si hace falta) y `cppGenerator.ts` (serialización) → por último `src/recipe/` para exponerlo en la UI.

Además del app, hay un CLI del analizador (`scripts/analyze.ts`, `npm run analyze -- examples/`) que corre el mismo `parseProgram`/`checkProgram` sobre archivos `.agro` y compara el resultado contra la cabecera `ESPERADO` de cada uno.

### Interfaz: `src/recipe/` y `src/components/`

`RecipeEditor.tsx` orquesta: elegir cultivo → cargar receta pre-armada (`presets.ts`, con umbrales derivados de `CropDef.minMoisture/maxMoisture`) → editar umbrales con sliders → `NewRuleWizard.tsx` para agregar reglas nuevas vía wizard de 4 pasos (WHEN → WHAT → DURATION → SUMMARY). Los sliders editan el AST inmutablemente vía funciones recursivas (`editableValue`/`withUpdatedValue` en `RecipeEditor.tsx`) que asumen que el valor editable es siempre el de la primera `Comparison` del árbol de `Logical` (limitación conocida, ver `ROADMAP.md` Fase 8).

`NewRuleWizard.tsx` solo ofrece opciones válidas (comparar una medición con un número, encender/apagar equipos, esperar segundos enteros ≥ 1) y, como resguardo silencioso, revisa la regla candidata con `checkProgram` antes de guardarla (paso SUMMARY).

`RecipeEditor` pasa su `Program` al componente compartido `src/components/OutputPanel.tsx`, que muestra 5 pestañas: Lenguaje, Análisis de tipos, Código intermedio (tabla de cuádruplos por regla), C++ (ESP32), Escribir (textarea libre → `parseProgram` + `checkProgram`, para pegar texto del lenguaje a mano).

### Capa Tauri: `src-tauri/`

Backend nativo mínimo (Rust) — solo ventana y plugins (`plugin-opener`), sin comandos custom de Tauri por ahora (el único comando es el `greet` de scaffold). `tauri.conf.json` fija el puerto de dev en 5173 y apunta `frontendDist` a `../dist`. Si se agregan comandos Rust invocables desde el frontend (`#[tauri::command]`), se registran en `src-tauri/src/lib.rs`.

Hoy la app **solo muestra** el C++ generado; no hay guardado a disco, ni invocación de `arduino-cli`, ni detección de puerto serial, ni flasheo, ni persistencia de proyectos. Ese es el trabajo pendiente descrito en `ROADMAP.md`.
