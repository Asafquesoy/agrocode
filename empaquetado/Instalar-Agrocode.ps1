# Instala Agrocode, las herramientas del ESP32 y el driver de la placa, sin internet.
# Se ejecuta con doble clic en "Instalar.bat". Solo el driver pide permisos de administrador.
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

function Paso($texto) { Write-Host ""; Write-Host $texto -ForegroundColor Green }

try {
    # 1) La aplicación
    Paso "[1/3] Instalando Agrocode..."
    $instalador = Get-ChildItem (Join-Path $aqui 'instalador') -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $instalador) { throw "No encuentro el instalador en la carpeta 'instalador'." }
    Start-Process -FilePath $instalador.FullName -ArgumentList '/S' -Wait
    Write-Host "Listo."

    # 2) Herramientas del ESP32 (para compilar y subir sin internet)
    Paso "[2/3] Copiando las herramientas del ESP32 (varios GB, puede tardar unos minutos)..."
    $origen = Join-Path $aqui 'herramientas\arduino'
    $destino = Join-Path $env:APPDATA 'com.omara.agrocode-app\arduino'
    if (-not (Test-Path $origen)) { throw "No encuentro la carpeta 'herramientas\arduino'." }
    New-Item -ItemType Directory -Force $destino | Out-Null
    robocopy $origen $destino /E /MT:8 /R:1 /W:1 /NFL /NDL /NP | Out-Null
    # robocopy usa codigos 0-7 para "todo bien"; 8 o mas es error.
    if ($LASTEXITCODE -ge 8) { throw "Fallo la copia de las herramientas (codigo $LASTEXITCODE)." }
    Write-Host "Listo."

    # 3) Driver de la placa (CP210x). Solo este paso necesita administrador.
    Paso "[3/3] Instalando el driver de la placa..."
    $yaInstalado = (pnputil /enum-drivers 2>&1 | Out-String) -match 'silabser\.inf'
    if ($yaInstalado) {
        Write-Host "El driver ya estaba instalado."
    } else {
        $inf = Join-Path $aqui 'driver\silabser.inf'
        if (-not (Test-Path $inf)) { throw "No encuentro el driver en la carpeta 'driver'." }
        Write-Host "Windows te pedira permiso de administrador: acepta."
        $orden = "pnputil /add-driver '$inf' /install; Start-Sleep 2"
        Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $orden
        $ok = (pnputil /enum-drivers 2>&1 | Out-String) -match 'silabser\.inf'
        if ($ok) { Write-Host "Listo." } else { Write-Host "No se pudo confirmar el driver. Si la placa no aparece, vuelve a ejecutar este paso con un usuario administrador." -ForegroundColor Yellow }
    }

    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host " Todo listo. Abre Agrocode desde el escritorio o el menu Inicio." -ForegroundColor Green
    Write-Host " Conecta el ESP32 con el cable USB." -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Algo salio mal: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Revisa el archivo LEEME.txt o vuelve a ejecutar Instalar.bat."
}
