// Motor de compilación: descarga `arduino-cli` la primera vez, instala el
// soporte de ESP32 y compila el sketch generado por la app. Todo vive en la
// carpeta de datos de la app (`arduino/`), aislado de cualquier Arduino que
// el usuario tenga instalado. No requiere ESP32 conectado.
use std::path::{Path, PathBuf};
use std::process::Stdio;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

const CLI_VERSION: &str = "1.3.1";
const FQBN: &str = "esp32:esp32:esp32";
const ESP32_INDEX_URL: &str = "https://espressif.github.io/arduino-esp32/package_esp32_index.json";

#[cfg(windows)]
const CLI_FILE: &str = "arduino-cli.exe";
#[cfg(not(windows))]
const CLI_FILE: &str = "arduino-cli";

#[cfg(windows)]
const CLI_ARCHIVE: &str = "Windows_64bit.zip";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const CLI_ARCHIVE: &str = "Linux_64bit.tar.gz";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const CLI_ARCHIVE: &str = "Linux_ARM64.tar.gz";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const CLI_ARCHIVE: &str = "macOS_64bit.tar.gz";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const CLI_ARCHIVE: &str = "macOS_ARM64.tar.gz";

// Evita dos operaciones a la vez (descargar, instalar o compilar).
#[derive(Default)]
pub struct Ocupado(Mutex<()>);

#[derive(Serialize)]
pub struct Entorno {
    herramienta: bool,
    esp32: bool,
}

#[derive(Serialize)]
pub struct ResultadoCompilacion {
    // Memoria del programa (flash del ESP32) y memoria de datos (RAM).
    bytes: Option<u64>,
    porcentaje: Option<u32>,
    ram_bytes: Option<u64>,
    ram_porcentaje: Option<u32>,
}

// Placa ESP32 detectada en un puerto serie: `fqbn` es el modelo que arduino-cli
// reconoció (o el ESP32 genérico si solo se reconoció el chip USB).
#[derive(Serialize)]
pub struct Placa {
    puerto: String,
    fqbn: String,
    nombre: String,
}

#[derive(Serialize, Clone)]
struct Progreso {
    hecho: u64,
    total: u64,
}

fn raiz(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("arduino"))
        .map_err(|e| format!("No se encontró la carpeta de datos de la app: {e}"))
}

fn ejecutable(raiz: &Path) -> PathBuf {
    raiz.join("bin").join(CLI_FILE)
}

fn etapa(app: &AppHandle, nombre: &str) {
    let _ = app.emit("compilacion-etapa", nombre);
}

fn linea(app: &AppHandle, texto: &str) {
    let _ = app.emit("compilacion-linea", texto);
}

fn comando(raiz: &Path) -> Command {
    let mut cmd = Command::new(ejecutable(raiz));
    cmd.env("ARDUINO_DIRECTORIES_DATA", raiz.join("data"))
        .env("ARDUINO_DIRECTORIES_USER", raiz.join("user"))
        .env("ARDUINO_DIRECTORIES_DOWNLOADS", raiz.join("downloads"))
        .env("ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS", ESP32_INDEX_URL)
        .env("ARDUINO_UPDATER_ENABLE_NOTIFICATION", "false")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd
}

// Corre arduino-cli retransmitiendo cada línea de salida; devuelve si terminó
// bien y la salida completa.
async fn ejecutar(app: &AppHandle, raiz: &Path, args: &[&str]) -> Result<(bool, String), String> {
    let mut hijo = comando(raiz)
        .args(args)
        .spawn()
        .map_err(|e| format!("No se pudo iniciar arduino-cli: {e}"))?;

    let stdout = hijo.stdout.take().ok_or("Sin salida estándar")?;
    let stderr = hijo.stderr.take().ok_or("Sin salida de error")?;

    let app_err = app.clone();
    let tarea_err = tokio::spawn(async move {
        let mut texto = String::new();
        let mut lineas = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lineas.next_line().await {
            linea(&app_err, &l);
            texto.push_str(&l);
            texto.push('\n');
        }
        texto
    });

    let mut salida = String::new();
    let mut lineas = BufReader::new(stdout).lines();
    while let Ok(Some(l)) = lineas.next_line().await {
        linea(app, &l);
        salida.push_str(&l);
        salida.push('\n');
    }
    let errores = tarea_err.await.unwrap_or_default();
    let estado = hijo.wait().await.map_err(|e| e.to_string())?;
    salida.push_str(&errores);
    Ok((estado.success(), salida))
}

#[tauri::command]
pub async fn verificar_entorno(app: AppHandle) -> Result<Entorno, String> {
    let raiz = raiz(&app)?;
    if !ejecutable(&raiz).exists() {
        return Ok(Entorno { herramienta: false, esp32: false });
    }
    let mut hijo = comando(&raiz);
    let salida = hijo
        .args(["core", "list", "--format", "json"])
        .output()
        .await
        .map_err(|e| format!("No se pudo iniciar arduino-cli: {e}"))?;
    let texto = String::from_utf8_lossy(&salida.stdout);
    Ok(Entorno { herramienta: true, esp32: texto.contains("esp32:esp32") })
}

async fn descargar_cli(app: &AppHandle, raiz: &Path) -> Result<(), String> {
    etapa(app, "descargando");
    let url = format!(
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_{CLI_VERSION}_{CLI_ARCHIVE}"
    );
    let respuesta = reqwest::get(&url)
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("No se pudo descargar arduino-cli (¿hay internet?): {e}"))?;
    let total = respuesta.content_length().unwrap_or(0);

    tokio::fs::create_dir_all(raiz.join("downloads")).await.map_err(|e| e.to_string())?;
    let archivo = raiz.join("downloads").join(format!("arduino-cli.{CLI_ARCHIVE}"));
    let mut destino = tokio::fs::File::create(&archivo).await.map_err(|e| e.to_string())?;

    let mut hecho = 0u64;
    let mut flujo = respuesta.bytes_stream();
    while let Some(trozo) = flujo.next().await {
        let trozo = trozo.map_err(|e| format!("Se cortó la descarga: {e}"))?;
        destino.write_all(&trozo).await.map_err(|e| e.to_string())?;
        hecho += trozo.len() as u64;
        let _ = app.emit("compilacion-progreso", Progreso { hecho, total });
    }
    destino.flush().await.map_err(|e| e.to_string())?;
    drop(destino);

    let bin = raiz.join("bin");
    let origen = archivo.clone();
    tokio::task::spawn_blocking(move || extraer(&origen, &bin))
        .await
        .map_err(|e| e.to_string())??;
    let _ = tokio::fs::remove_file(&archivo).await;
    Ok(())
}

#[cfg(windows)]
fn extraer(archivo: &Path, destino: &Path) -> Result<(), String> {
    std::fs::create_dir_all(destino).map_err(|e| e.to_string())?;
    let f = std::fs::File::open(archivo).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    let mut entrada = zip.by_name(CLI_FILE).map_err(|e| e.to_string())?;
    let mut salida = std::fs::File::create(destino.join(CLI_FILE)).map_err(|e| e.to_string())?;
    std::io::copy(&mut entrada, &mut salida).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn extraer(archivo: &Path, destino: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(destino).map_err(|e| e.to_string())?;
    let f = std::fs::File::open(archivo).map_err(|e| e.to_string())?;
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(f));
    for entrada in tar.entries().map_err(|e| e.to_string())? {
        let mut entrada = entrada.map_err(|e| e.to_string())?;
        let es_cli = entrada
            .path()
            .map_err(|e| e.to_string())?
            .file_name()
            .map(|n| n == CLI_FILE)
            .unwrap_or(false);
        if es_cli {
            let ruta = destino.join(CLI_FILE);
            entrada.unpack(&ruta).map_err(|e| e.to_string())?;
            std::fs::set_permissions(&ruta, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("El archivo descargado no contiene arduino-cli".into())
}

#[tauri::command]
pub async fn preparar_entorno(app: AppHandle, ocupado: State<'_, Ocupado>) -> Result<(), String> {
    let _guardia = ocupado
        .0
        .try_lock()
        .map_err(|_| "Ya hay una operación en curso.".to_string())?;
    let raiz = raiz(&app)?;

    if !ejecutable(&raiz).exists() {
        descargar_cli(&app, &raiz).await?;
    }

    etapa(&app, "instalando");
    let (ok, salida) = ejecutar(&app, &raiz, &["core", "update-index"]).await?;
    if !ok {
        return Err(format!("No se pudo actualizar la lista de plataformas.\n{salida}"));
    }
    let (ok, salida) = ejecutar(&app, &raiz, &["core", "install", "esp32:esp32"]).await?;
    if !ok {
        return Err(format!("No se pudo instalar el soporte para ESP32.\n{salida}"));
    }
    // Los archivos descargados ya están instalados: se borran para no dejar
    // ~2 GB duplicados en disco. Si falla no importa, solo ocupa espacio.
    let _ = ejecutar(&app, &raiz, &["cache", "clean"]).await;
    Ok(())
}

// arduino-cli imprime en el idioma del sistema, así que no se busca texto: la
// primera línea con "<n> bytes (<p>%)" es la del programa (memoria flash:
// "Sketch uses 245000 bytes (18%)…" / "El Sketch usa 245000 bytes (18%)…") y la
// segunda la de datos (RAM: "Global variables use 22196 bytes (6%)…").
fn tamanos(salida: &str) -> Vec<(u64, Option<u32>)> {
    salida
        .lines()
        .filter_map(|l| {
            let (antes, despues) = l.split_once(" bytes (")?;
            let (pct, _) = despues.split_once("%)")?;
            let bytes = antes.split_whitespace().last()?.parse().ok()?;
            Some((bytes, pct.trim().parse().ok()))
        })
        .collect()
}

// Librerías de Arduino que usa el sketch generado: (archivo que incluye, nombre
// en el índice de librerías). Se instalan solas la primera vez que hacen falta.
const LIBRERIAS: [(&str, &str); 1] = [("Adafruit_AHTX0.h", "Adafruit AHTX0")];

async fn asegurar_librerias(app: &AppHandle, raiz: &Path, codigo: &str) -> Result<(), String> {
    let necesarias: Vec<&str> = LIBRERIAS
        .iter()
        .filter(|(cabecera, _)| codigo.contains(cabecera))
        .map(|(_, nombre)| *nombre)
        .collect();
    if necesarias.is_empty() {
        return Ok(());
    }
    let instaladas = comando(raiz)
        .args(["lib", "list"])
        .output()
        .await
        .map_err(|e| format!("No se pudo iniciar arduino-cli: {e}"))?;
    let texto = String::from_utf8_lossy(&instaladas.stdout).into_owned();
    for nombre in necesarias {
        if texto.contains(nombre) {
            continue;
        }
        etapa(app, "librerias");
        let (ok, salida) = ejecutar(app, raiz, &["lib", "install", nombre]).await?;
        if !ok {
            return Err(format!("No se pudo instalar la librería {nombre} (¿hay internet?).
{salida}"));
        }
    }
    Ok(())
}

async fn escribir_sketch(raiz: &Path, codigo: String) -> Result<String, String> {
    let carpeta = raiz.join("sketch").join("agrocode");
    tokio::fs::create_dir_all(&carpeta).await.map_err(|e| e.to_string())?;
    tokio::fs::write(carpeta.join("agrocode.ino"), codigo)
        .await
        .map_err(|e| e.to_string())?;
    Ok(carpeta.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn compilar(
    app: AppHandle,
    ocupado: State<'_, Ocupado>,
    codigo: String,
) -> Result<ResultadoCompilacion, String> {
    let _guardia = ocupado
        .0
        .try_lock()
        .map_err(|_| "Ya hay una compilación en curso.".to_string())?;
    let raiz = raiz(&app)?;
    if !ejecutable(&raiz).exists() {
        return Err("Las herramientas de compilación no están instaladas.".into());
    }

    asegurar_librerias(&app, &raiz, &codigo).await?;
    etapa(&app, "compilando");
    let carpeta_txt = escribir_sketch(&raiz, codigo).await?;
    let build = raiz.join("build").to_string_lossy().into_owned();
    let (ok, salida) = ejecutar(
        &app,
        &raiz,
        &["compile", "--fqbn", FQBN, "--build-path", &build, &carpeta_txt],
    )
    .await?;
    if !ok {
        return Err(salida);
    }
    let medidas = tamanos(&salida);
    let programa = medidas.first().copied();
    let datos = medidas.get(1).copied();
    Ok(ResultadoCompilacion {
        bytes: programa.map(|m| m.0),
        porcentaje: programa.and_then(|m| m.1),
        ram_bytes: datos.map(|m| m.0),
        ram_porcentaje: datos.and_then(|m| m.1),
    })
}

// Chips USB-serie que traen las placas ESP32 de desarrollo: CP210x (Silicon
// Labs), CH340 (WCH), FTDI y el USB nativo de Espressif.
const VID_ESP32: [&str; 4] = ["10c4", "1a86", "0403", "303a"];

fn normalizar_vid(vid: &str) -> String {
    vid.trim_start_matches("0x").trim_start_matches("0X").to_lowercase()
}

// Busca placas ESP32 conectadas. No hay que elegir nada: si arduino-cli
// reconoce el modelo se usa su fqbn; si solo se reconoce el chip USB, se usa el
// ESP32 genérico, que sirve para casi todas las placas.
#[tauri::command]
pub async fn detectar_placas(app: AppHandle) -> Result<Vec<Placa>, String> {
    let raiz = raiz(&app)?;
    if !ejecutable(&raiz).exists() {
        return Ok(vec![]);
    }
    let salida = comando(&raiz)
        .args(["board", "list", "--format", "json"])
        .output()
        .await
        .map_err(|e| format!("No se pudo iniciar arduino-cli: {e}"))?;
    let json: serde_json::Value = serde_json::from_slice(&salida.stdout)
        .map_err(|e| format!("Respuesta inesperada de arduino-cli: {e}"))?;

    let mut placas = vec![];
    for detectado in json["detected_ports"].as_array().into_iter().flatten() {
        let puerto = &detectado["port"];
        if puerto["protocol"] != "serial" {
            continue;
        }
        let Some(direccion) = puerto["address"].as_str() else { continue };

        let modelo = detectado["matching_boards"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|b| b["fqbn"].as_str().is_some_and(|f| f.starts_with("esp32:esp32:")));
        if let Some(m) = modelo {
            placas.push(Placa {
                puerto: direccion.to_string(),
                fqbn: m["fqbn"].as_str().unwrap_or(FQBN).to_string(),
                nombre: m["name"].as_str().unwrap_or("ESP32").to_string(),
            });
            continue;
        }
        let vid = puerto["properties"]["vid"].as_str().map(normalizar_vid);
        if vid.is_some_and(|v| VID_ESP32.contains(&v.as_str())) {
            placas.push(Placa {
                puerto: direccion.to_string(),
                fqbn: FQBN.to_string(),
                nombre: "ESP32".to_string(),
            });
        }
    }
    Ok(placas)
}

// Compila (casi instantáneo si no cambió nada) y sube el sketch a la placa.
#[tauri::command]
pub async fn subir(
    app: AppHandle,
    ocupado: State<'_, Ocupado>,
    monitor: State<'_, crate::monitor::Monitor>,
    codigo: String,
    puerto: String,
    fqbn: String,
) -> Result<(), String> {
    if puerto.is_empty() || puerto.starts_with('-') || !fqbn.starts_with("esp32:esp32:") {
        return Err("Placa o puerto no válidos.".into());
    }
    let _guardia = ocupado
        .0
        .try_lock()
        .map_err(|_| "Ya hay una operación en curso.".to_string())?;
    let raiz = raiz(&app)?;
    if !ejecutable(&raiz).exists() {
        return Err("Las herramientas de compilación no están instaladas.".into());
    }

    // El puerto serie es de un solo dueño: se suelta el monitor antes de subir.
    monitor.detener();
    asegurar_librerias(&app, &raiz, &codigo).await?;
    etapa(&app, "subiendo");
    let carpeta_txt = escribir_sketch(&raiz, codigo).await?;
    let build = raiz.join("build").to_string_lossy().into_owned();
    let (ok, salida) = ejecutar(
        &app,
        &raiz,
        &["compile", "--upload", "--port", &puerto, "--fqbn", &fqbn, "--build-path", &build, &carpeta_txt],
    )
    .await?;
    if ok { Ok(()) } else { Err(salida) }
}
