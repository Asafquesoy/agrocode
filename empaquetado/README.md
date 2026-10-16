# Paquete para llevar Agrocode a otra computadora

Estos tres archivos (`Instalar.bat`, `Instalar-Agrocode.ps1`, `LEEME.txt`) van en la raíz del
paquete. El resto se arma así (nada de esto se sube al repositorio, por su tamaño):

```
paquete/
  Instalar.bat   Instalar-Agrocode.ps1   LEEME.txt      <- esta carpeta
  instalador/    agrocode-app_0.1.0_x64-setup.exe        <- npm run tauri build -- --bundles nsis
  herramientas/arduino/                                  <- copia de %APPDATA%\com.omara.agrocode-app\arduino
  driver/        silabser.inf, silabser.cat, x64/silabser.sys  <- pnputil /export-driver
```

Para regenerar el instalador tras cambiar código:

```
npm run tauri build -- --bundles nsis
```

y copiar `src-tauri/target/release/bundle/nsis/*-setup.exe` a `instalador/`.

Las herramientas (≈6.5 GB) se copian sin `build*`, `sketch` ni `downloads`:

```
robocopy "%APPDATA%\com.omara.agrocode-app\arduino" <destino> /E /MT:8 /XD build build-escaner build-kit build-leds build-prueba sketch downloads
```

No se ha probado en una PC limpia. El instalador no está firmado (SmartScreen puede avisar).
