# Roadmap — Agrocode

Fuente de verdad de las fases de desarrollo, pensadas para implementarse por partes en sesiones
distintas. El alcance objetivo (qué se incluye y qué queda deliberadamente fuera) está en
`ALCANCE.txt`.

**Fase actual: 2 (completada) → siguiente: Fase 8.** La rama `Cbtis` es una **demo para alumnos de
preparatoria** (2026-10-15): no completa fases nuevas, hace que el programa funcione de punta a punta con
el ESP32 real y que el proceso del compilador se vea (ver "Rama Cbtis" al final). Ya hay ESP32 físico.

Decisiones fijas (no re-litigar):
- Stack: **Tauri 2 + React 19 + TypeScript**, no Flutter (el PDF fuente sugiere Flutter/Dart, pero se
  evaluó y se descartó — ver CLAUDE.md).
- A fecha 2026-10-15 **ya hay un ESP32 físico** (ver "Rama Cbtis"); las fases 3, 6 y 7 pueden probarse.
- Propuestas alternativas de UI (Blockly, Tarjetas) fueron eliminadas — solo queda "Receta".
- A fecha 2026-09-09 se decidió reemplazar el catálogo fijo de cultivos/sensores/actuadores por
  registro libre del usuario, agregar persistencia de configuraciones de dispositivo y control
  remoto — ver `ALCANCE.txt`. El descubrimiento automático de sensores por hardware y el monitor en
  vivo por serial quedan fuera de alcance.

## Fases

- [x] **Fase 0 — Dejar solo la Receta.** Dejar una sola interfaz, limpiar App.tsx/App.css,
      quitar dependencia `blockly` y scripts de Playwright muertos, actualizar README/CLAUDE.md.
- [x] **Fase 1 — Exportar el sketch a disco.** `tauri-plugin-fs` + `tauri-plugin-dialog`, botón
      "Guardar .ino" y "Copiar" en `OutputPanel.tsx`. No requiere ESP32.
- [x] **Fase 2 — Motor de compilación (`arduino-cli` en segundo plano).** `arduino-cli` se descarga
      solo la primera vez (no es sidecar: no infla el instalador ni git) a la carpeta de datos de la
      app (`arduino/`); comandos Rust `verificar_entorno`/`preparar_entorno`/`compilar`
      (`src-tauri/src/compilador.rs`), streaming por eventos `compilacion-*`, panel
      `CompilePanel.tsx` en la pestaña C++. No requiere ESP32 (`arduino-cli compile` sin placa).
- [~] **Fase 3 — Detección de puerto y flasheo.** *Hecha en la rama `Cbtis`: `detectar_placas` y `subir` (vía `arduino-cli`, sin crate `serialport` para eso), guía del botón BOOT y monitor serie.* Crate `serialport`, comandos `listar_puertos`/`subir`,
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
- [ ] **Fase 7 — Control remoto de dispositivos.** Control **solo dentro de la misma red local**
      (sin servidor en la nube, sin acceso por internet) y **sin autenticación**. La conexión del
      dispositivo a la red debe ser un paso **simple y sin configuración técnica** para el agricultor
      (nada de IPs, puertos o credenciales manuales). Definir el mecanismo de conectividad local
      (Wi-Fi + MQTT/HTTP u otro), comandos para enviar cambios de configuración y accionar actuadores
      a distancia, y la contraparte en la app para listar/controlar dispositivos en la red. Si se
      pierde la comunicación, el dispositivo debe seguir operando con la última configuración que
      tenía cargada y la app debe avisarle al usuario que se perdió la conexión.
      **Requiere ESP32 físico con conectividad Wi-Fi.**
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

## Rama Cbtis (demo para alumnos de prepa)

Hardware real (verificado 2026-10-15): **ESP32-D0WD-V3**, 4 MB, CP2102 en COM5 (hace falta el driver CP210x
de Silicon Labs), **no entra solo al modo de descarga: hay que mantener BOOT pulsado al subir**. Cableado:
AHT20 (temperatura y humedad) y BMP280 por I2C (SDA 21, SCL 22); LED 1 RGB cátodo común en R 4, G 18, B 5;
LED 2 RGB en R 25, G 27, B 26. Está en `src/compiler/kit.ts` (`kitDevice`) y en `pins.ts`.

- **Kit de la clase** (botón en Mis dispositivos): dispositivo ya armado con 4 reglas.
- **Modo clase** (`src/recipe/ClassMode.tsx`, botón "Cómo funciona"): 7 etapas del compilador con datos reales.
- El C++ lee el AHT20 de verdad y emite líneas `AGRO ...` por serie (`agroProtocol.ts` las interpreta);
  `src-tauri/src/monitor.rs` las lee y `LiveBoard.tsx` las dibuja en vivo. Esto cambia el "fuera de alcance:
  monitor serial" de `ALCANCE.txt`, solo para esta demo.
- Copia de seguridad del programa original de la placa: `Agrocodeespaldo-esp32\` (fuera del repo).
- Sin hacer: Fase 6 (hora real), Fase 7 (Wi-Fi), BMP280 como sensor de presión.
