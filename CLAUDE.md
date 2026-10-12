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

**Nota sobre estado actual vs. alcance objetivo:** el registro dinámico de cultivo, sensores y actuadores (Fase 4) ya está implementado: el agricultor los da de alta desde la UI (`src/recipe/DeviceSetup.tsx`) y el compilador trabaja contra ese registro (`device.ts`), no contra un catálogo fijo. La persistencia (Fase 5) también está hecha: cada dispositivo se guarda solo, con nombre propio, y reaparece en la lista inicial al abrir la app. Sigue pendiente el control remoto — ver `ROADMAP.md`.

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

- `catalog.ts` — tipos del lenguaje (`DataType`, operadores) y los **tipos de aparato**: `SENSOR_KINDS` (humedad de suelo, lluvia, temperatura, humedad del aire; con modo `ANALOG`/`I2C`, unidad y rango) y `ACTUATOR_KINDS` (bomba, válvula, alarma, otro). Son clases de aparato, no los aparatos del agricultor, y nunca llevan pin.
- `device.ts` — registro del dispositivo: `Device` (nombre, cultivo en texto libre, sensores, equipos, reglas), `DeviceRegistry` (la vista de solo lectura que reciben `checkProgram`/`generateCpp`/etc. como parámetro explícito, nada global), `toIdentifier` (nombre libre → identificador del lenguaje sin acentos ni palabras clave), alta/baja/renombrado de aparatos (`addSensor`, `removeActuator`…) y `deviceToProgram`. El `id` de un aparato no cambia al renombrarlo. Quitar un aparato borra las reglas que lo usan.
- `pins.ts` — asignación **automática** de pines (`nextFreePin`, `canRegister`, `resolvePinConflicts`): analógicos ADC1, salidas sin pines de arranque y bus I2C compartido. El agricultor nunca ve ni elige un pin y los conflictos se corrigen solos; el pin de un aparato no se mueve al borrar otros.
- `inferTypes.ts` — `inferSensorTypes`: tipo de cada sensor (`ENTERO`/`DECIMAL`/`BOOLEANO`) según sus comparaciones (decimal → `DECIMAL`; solo `= 0`/`= 1` → `BOOLEANO`; si no `ENTERO`). Viaja en `arg2` del cuádruplo `LEER` y decide el `int`/`float`/`bool` del C++.
- `exampleDevice.ts` — el antiguo catálogo (caña, `HUMEDAD_SUELO`, `BOMBA_PRINCIPAL`…) como `Device`; solo lo usa el CLI `scripts/analyze.ts` para los `.agro` de `examples/`. La app arranca con un dispositivo vacío.
- `lexer.ts` — texto del lenguaje intermedio → tokens con número de línea (comentarios `//`, palabras clave, identificadores, números, operadores, horas `HH:MM`).
- `parser.ts` — tokens → AST (`parseProgram`). Deliberadamente permisivo: acepta cualquier cosa sintácticamente correcta aunque sea semánticamente inválida (p. ej. `HUMEDAD_SUELO < BOMBA_PRINCIPAL` o `ESPERAR 2.5`); rechazar eso es trabajo de `typeChecker.ts`/`symbolTable.ts`, no del parser.
- `ast.ts` — define el AST (`Program` → `Declaration[]` + `Rule[]` → `condition: Expr` + `actions: Statement[]`) y expone *constructores de conveniencia* (`comparison`, `comparisonWith`, `logical`, `stateAction`, `waitAction`, `usedDeclarations`) que usa la UI para no armar los nodos a mano.
- `symbolTable.ts` — valida declaración/uso de identificadores (`buildSymbolTable`): identificador no declarado, redeclarado, no registrado en el dispositivo (I3), usado en rol incorrecto (SENSOR↔ACTUADOR), cultivo distinto al registrado (I5), declarado sin usar. Recibe el `DeviceRegistry`. Las reglas están tabuladas en `IDENTIFIER_RULES` (I1–I6), igual que `TYPE_MATRIX`.
- `typeChecker.ts` — analizador semántico. La matriz de tipos (`TYPE_MATRIX`) se modela como tabla de datos, no como ifs anidados, para que quede trazable contra el documento "Actividad 5". `checkProgram`/`blockingErrors` son el gate obligatorio antes de generar C++; cada resultado incluye `appliedRules` (T1..T9 usadas, también en el caso válido) y `errors` (con categoría de `errors.ts`).
- `errors.ts` — tipo `SemanticError` (categoría + id de regla + mensaje + línea) y las 6 categorías (`ErrorCategory`); solo `ADVERTENCIA` no es bloqueante (`isBlocking`).
- `printer.ts` — AST → texto del lenguaje intermedio (para que el agricultor/docente vea qué "entendió" el sistema); es round-trip con `parser.ts`.
- `intermediateCode.ts` — AST verificado → **cuádruplos** `(op, arg1, arg2, resultado)` (`generateIntermediateCode`, `intermediateCodeToText`). Es el código intermedio del compilador: `LEER` por sensor usado (con su tipo inferido en `arg2`, en orden de registro), comparaciones/`Y`/`O` en temporales `t1..tN`, y por regla `SALTARF tN, Lk` + acciones + `ETIQUETA Lk`. Recibe el `DeviceRegistry`, llama a `checkProgram`/`blockingErrors` y **lanza excepción si hay errores bloqueantes**; es el único gate antes de generar código.
- `cppGenerator.ts` — cuádruplos → sketch `.ino` (`irToCpp(ir, registry)`; `generateCpp(program, registry)` encadena IR + C++). No lee el AST: traduce 1:1 cada cuádruplo. Los sensores/actuadores en uso salen de los `LEER` y `ENCENDER/APAGAR` del IR para no declarar pines que no se usan; pines, nombres y unidades salen del registro, y la lectura sale como `int` (`map`), `float` o `bool` (`digitalRead`) según el tipo inferido.

Flujo de datos: `texto o interfaz visual → lexer.ts → parser.ts → AST (Programa) → symbolTable.ts + typeChecker.ts → intermediateCode.ts (cuádruplos) → cppGenerator.ts` (y `printer.ts` lee el AST para mostrar el texto). Si vas a agregar un tipo de sensor/actuador/acción nuevo, el orden de cambios es: `catalog.ts` (tipo de aparato; si es un sensor, ajustar `pins.ts`/`cppGenerator.ts` si necesita un modo de lectura nuevo) → `ast.ts` (nodo + constructor) → `typeChecker.ts`/`symbolTable.ts` (regla en `TYPE_MATRIX`/`IDENTIFIER_RULES` + verificación) → `printer.ts`, `parser.ts`, `intermediateCode.ts` (nuevo cuádruplo si hace falta) y `cppGenerator.ts` (serialización) → por último `src/recipe/` para exponerlo en la UI.

Además del app, hay un CLI del analizador (`scripts/analyze.ts`, `npm run analyze -- examples/`) que corre el mismo `parseProgram`/`checkProgram` sobre archivos `.agro` y compara el resultado contra la cabecera `ESPERADO` de cada uno.

### Interfaz: `src/recipe/` y `src/components/`

**Regla de diseño — escritorio, no teléfono.** La ventana es de escritorio (mínimo 1024×700, inicial 1280×800 en `tauri.conf.json`); no se hace responsive para móvil. Toda pantalla nueva o modificada debe:
- aprovechar todo el ancho: nada de `max-width` + `margin: 0 auto` que deje una columna angosta centrada; usar retículas/columnas (tarjetas con `auto-fill`, formularios en 2 columnas, paneles lado a lado), también en los estados vacíos;
- mantener la acción principal a la vista sin scroll (pie `position: sticky`);
- cortar con "…" en una línea los textos largos del usuario (nombre, cultivo) en vez de romper cabeceras o tarjetas;
- usar las scrollbars finas del tema (`base.css`), no las blancas del sistema;
- verificarse con Playwright (`npm run dev`) a 1024×700, 1366×768 y 1920×1080, antes y después del cambio: sin `scrollWidth > clientWidth` y con el botón principal visible.

`App.tsx` renderiza `DeviceHome.tsx`: la lista de dispositivos guardados (crear, abrir, eliminar con confirmación en línea; un archivo dañado sale como tarjeta aparte sin tumbar la lista). Al abrir uno monta `RecipeEditor` y, al volver, recarga la lista. **No hay botón "Guardar"**: `useAutosave.ts` guarda ~600 ms después del último cambio (y al volver/cerrar), encadenando las escrituras. El formato y su saneado viven en `src/compiler/deviceFile.ts` (puro, `version` para migraciones; descarta aparatos de tipo desconocido y las reglas que los usan, regenera ids duplicados y corrige pines con `resolvePinConflicts`) y el acceso a disco en `src/storage/deviceStore.ts`.

`RecipeEditor.tsx` orquesta dos vistas sobre el `Device` del dispositivo abierto: **Configurar** (`DeviceSetup.tsx`: nombre del dispositivo, cultivo en texto libre, alta/renombrado/baja de sensores y equipos eligiendo su tipo; sin pines a la vista) y **Reglas** (lista de reglas con editar/quitar, sliders de umbral con el rango y la unidad del sensor, tarjetas de reglas sugeridas de `suggestions.ts` según lo registrado, y `RuleWizard.tsx`). Los sliders editan el AST inmutablemente vía funciones recursivas (`editableValue`/`withUpdatedValue` en `RecipeEditor.tsx`) que asumen que el valor editable es siempre el de la primera `Comparison` del árbol de `Logical` (limitación conocida, ver `ROADMAP.md` Fase 8).

`RuleWizard.tsx` (wizard de 4 pasos: WHEN → WHAT → DURATION → SUMMARY) arma reglas nuevas y también edita existentes (`initialRule`; `wizardStateFromRule`/`canEditInWizard` deciden si una regla cabe en el asistente, y al editar se conserva su `id` y su horario). Solo ofrece opciones válidas (comparar una medición con un número, encender/apagar equipos, esperar segundos enteros ≥ 1) y, como resguardo silencioso, revisa la regla candidata con `checkProgram` antes de guardarla (paso SUMMARY).

`RecipeEditor` pasa su `Program` y el `DeviceRegistry` al componente compartido `src/components/OutputPanel.tsx`, que muestra 5 pestañas: Lenguaje, Análisis de tipos, Código intermedio (tabla de cuádruplos por regla), C++ (ESP32), Escribir (textarea libre → `parseProgram` + `checkProgram`, para pegar texto del lenguaje a mano).

### Capa Tauri: `src-tauri/`

Backend nativo mínimo (Rust) — solo ventana y plugins (`plugin-opener`, `plugin-dialog`, `plugin-fs`), sin comandos custom de Tauri por ahora (el único comando es el `greet` de scaffold). Los permisos de los plugins están en `src-tauri/capabilities/default.json` (`dialog:allow-save`, `fs:allow-write-text-file` para el `.ino`, y `fs:allow-appdata-read-recursive`/`-write-recursive` para los dispositivos). Cada dispositivo es un archivo `devices/<uuid>.json` en la carpeta de datos de la app (`%APPDATA%\com.omara.agrocode-app\`), compartida entre `tauri dev` y la app instalada; la escritura es atómica (temporal + `rename`). Fuera de Tauri (`npm run dev`) cae a `localStorage`. `tauri.conf.json` fija el puerto de dev en 5173 y apunta `frontendDist` a `../dist`. Si se agregan comandos Rust invocables desde el frontend (`#[tauri::command]`), se registran en `src-tauri/src/lib.rs`.

Hoy la app muestra el C++ generado y permite **guardarlo como `.ino`** (diálogo nativo) o **copiarlo** desde la pestaña C++ de `OutputPanel.tsx` (`src/components/exportSketch.ts`; fuera de Tauri, en `npm run dev`, el guardado cae a una descarga del navegador). No hay invocación de `arduino-cli`, ni detección de puerto serial, ni flasheo. Ese es el trabajo pendiente descrito en `ROADMAP.md`.
