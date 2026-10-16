// Monitor serie: lee las líneas que imprime el ESP32 por el cable USB y las
// reenvía a la interfaz como eventos `monitor-linea`. Así la app puede mostrar
// en vivo qué mide la placa, qué regla se cumple y qué equipo se enciende.
// El puerto es de un solo dueño: `subir` detiene el monitor antes de escribir.
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Monitor(Mutex<Option<(Arc<AtomicBool>, JoinHandle<()>)>>);

impl Monitor {
    // Detiene el monitor (si hay uno) y espera a que suelte el puerto.
    pub fn detener(&self) {
        let activo = self.0.lock().ok().and_then(|mut guardia| guardia.take());
        if let Some((parar, hilo)) = activo {
            parar.store(true, Ordering::Relaxed);
            let _ = hilo.join();
        }
    }
}

#[tauri::command]
pub fn monitor_iniciar(
    app: AppHandle,
    monitor: State<'_, Monitor>,
    puerto: String,
) -> Result<(), String> {
    monitor.detener();
    let mut conexion = serialport::new(&puerto, 115_200)
        .timeout(Duration::from_millis(200))
        .open()
        .map_err(|e| format!("No se pudo abrir {puerto}: {e}"))?;

    // Un pulso en RTS reinicia la placa (pin EN) para ver su arranque desde el
    // principio. Si BOOT sigue pulsado arrancará en modo de descarga.
    let _ = conexion.write_data_terminal_ready(false);
    let _ = conexion.write_request_to_send(true);
    std::thread::sleep(Duration::from_millis(150));
    let _ = conexion.write_request_to_send(false);

    let parar = Arc::new(AtomicBool::new(false));
    let parar_hilo = parar.clone();
    let hilo = std::thread::spawn(move || {
        let mut pendiente: Vec<u8> = Vec::new();
        let mut bloque = [0u8; 256];
        while !parar_hilo.load(Ordering::Relaxed) {
            match conexion.read(&mut bloque) {
                Ok(0) => {}
                Ok(n) => {
                    pendiente.extend_from_slice(&bloque[..n]);
                    while let Some(fin) = pendiente.iter().position(|b| *b == b'\n') {
                        let linea: Vec<u8> = pendiente.drain(..=fin).collect();
                        let texto = String::from_utf8_lossy(&linea).trim().to_string();
                        if !texto.is_empty() {
                            let _ = app.emit("monitor-linea", texto);
                        }
                    }
                    // Basura sin salto de línea (otra velocidad de baudios): no se acumula.
                    if pendiente.len() > 4096 {
                        pendiente.clear();
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    let _ = app.emit("monitor-error", format!("Se perdió la conexión con el ESP32: {e}"));
                    break;
                }
            }
        }
    });

    *monitor.0.lock().map_err(|e| e.to_string())? = Some((parar, hilo));
    Ok(())
}

#[tauri::command]
pub fn monitor_detener(monitor: State<'_, Monitor>) {
    monitor.detener();
}
