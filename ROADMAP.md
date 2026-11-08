# Roadmap — Agrocode

Fuente de verdad de las fases de desarrollo, pensadas para implementarse por partes en sesiones
distintas. El alcance objetivo (qué se incluye y qué queda deliberadamente fuera) está en
`ALCANCE.txt`.

**Fase actual: 5 (completada) → siguiente: Fase 2** (orden acordado: 1 → 4 → 5; la Fase 2 después)

Decisiones fijas (no re-litigar):
- Stack: **Tauri 2 + React 19 + TypeScript**, no Flutter (el PDF fuente sugiere Flutter/Dart, pero se
  evaluó y se descartó — ver CLAUDE.md).
- A fecha 2026-09-09 **no hay ESP32 físico disponible**; las fases que lo requieren están marcadas.
- Propuestas alternativas de UI (Blockly, Tarjetas) fueron eliminadas — solo queda "Receta".
- A fecha 2026-09-09 se decidió reemplazar el catálogo fijo de cultivos/sensores/actuadores por
  registro libre del usuario y agregar persistencia de configuraciones de dispositivo — ver
  `ALCANCE.txt`. El descubrimiento automático de sensores por hardware y el monitor en vivo por
  serial quedan fuera de alcance.
- A fecha 2026-10-18 se **descartó el control remoto** (antes Fase 7): no habrá Wi-Fi ni red local
  en el producto, porque el lugar de instalación no tendrá internet confiable.

## Fases

- [x] **Fase 0 — Dejar solo la Receta.** Dejar una sola interfaz, limpiar App.tsx/App.css,
      quitar dependencia `blockly` y scripts de Playwright muertos, actualizar README/CLAUDE.md.
- [x] **Fase 1 — Exportar el sketch a disco.** `tauri-plugin-fs` + `tauri-plugin-dialog`, botón
      "Guardar .ino" y "Copiar" en `OutputPanel.tsx`. No requiere ESP32.
- [ ] **Fase 2 — Motor de compilación (`arduino-cli` en segundo plano).** Sidecar de `arduino-cli`,
      comandos Rust `verificar_entorno`/`instalar_core`/`compilar`, streaming de progreso por eventos
      de Tauri, panel de compilación en React. No requiere ESP32 (`arduino-cli compile` sin placa).
- [ ] **Fase 3 — Detección de puerto y flasheo.** Crate `serialport`, comandos `listar_puertos`/`subir`,
      selector de puerto + indicador "ESP32 Conectado (COMx)". **Requiere ESP32 físico.**
- [x] **Fase 4 — Registro dinámico de cultivo, sensores y actuadores.** Reemplazar los catálogos fijos
      `CROPS`/`SENSORS`/`ACTUATORS` de `catalog.ts` por entidades que el usuario crea, edita y
      elimina desde la UI: nombre libre de cultivo/proceso, alta de sensores y actuadores con sus
      propios parámetros (unidad, rango, modo). El **pin del ESP32 se asigna automáticamente** al
      registrar cada sensor/actuador — el agricultor no elige ni ve pines — y el sistema **detecta y
      resuelve solo** cualquier conflicto de pines. El tipo de dato de cada sensor (`ENTERO`/
      `DECIMAL`/`BOOLEANO`) también se infiere automáticamente según cómo se usa en las reglas, sin
      pedírselo al usuario. Incluye editar/eliminar reglas ya creadas (no solo crearlas) y nombre
      identificador por dispositivo cuando hay más de uno. Impacta `catalog.ts`, `ast.ts`,
      `typeChecker.ts`, `cppGenerator.ts` y `src/recipe/` (ya no hay receta pre-armada
      por cultivo de catálogo; las reglas se arman a partir de lo que el usuario registró). No
      requiere ESP32.
- [x] **Fase 5 — Persistencia de configuraciones de dispositivo.** Guardar, abrir, editar y eliminar en
      disco (o storage local de la app) el registro completo de un dispositivo: cultivo/proceso,
      sensores, actuadores y reglas. Un mismo usuario puede tener registrado más de un dispositivo,
      cada uno identificado por su nombre. No requiere ESP32.
- [ ] **Fase 6 — Restricción horaria real.** Implementar de verdad la ventana horaria
      (`RestriccionHoraria`) en el analizador de tipos y en el C++ generado (hoy solo se emite como
      comentario); requiere RTC o sincronización de hora en el ESP32. **Requiere ESP32 físico.**
- [~] **Fase 7 — Control remoto de dispositivos. DESCARTADA (2026-10-18).** Se quitó del proyecto:
      donde se piensa instalar el dispositivo no se espera una red Wi-Fi confiable, así que el
      control remoto no aporta. El dispositivo se configura y se carga por USB y opera solo con la
      configuración cargada. No hay Wi-Fi, red local ni MQTT/HTTP en el alcance.
- [ ] **Fase 8 — Pulido de interfaz y empaquetado.** Layout tipo mockup del PDF, arreglar sliders
      limitados a 0–100 y edición de AST que solo recorre la rama izquierda, `tauri.conf.json` de
      producción, build final. Nota (evidencia Tema 1, 2026-09-10): `NewRuleWizard.tsx` ya
      construye `Logical` (Y/O) con comparaciones contra un `Literal`; la limitación de `editableValue`/`withUpdatedValue` en
      `RecipeEditor.tsx` (solo recorren la rama izquierda de `Logical` y solo editan un `Literal`)
      sigue en pie para esas reglas nuevas.

Detalle completo de cada fase (archivos concretos a tocar, comandos exactos) en el plan de la sesión
que originó este roadmap: `C:\Users\omara\.claude\plans\la-propuesta-ganadora-es-curried-pebble.md`.
Ese plan describe el alcance previo (catálogo fijo); las Fases 4, 5 y 7 son adiciones posteriores al
plan original y aún no tienen detalle de implementación por archivo.
