@echo off
setlocal
set APPDIR=C:\FarmaciaApp
set DESKTOP=%USERPROFILE%\Desktop

echo.
echo =====================================================
echo   Instalador — Farmacia Recordatorios v1.0
echo =====================================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado en este equipo.
  echo.
  echo  1. Abre el navegador y ve a: https://nodejs.org
  echo  2. Descarga la version LTS e instalala
  echo  3. Reinicia el equipo y vuelve a ejecutar este instalador
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js encontrado: %NODEVER%
echo.

:: Copy app files
echo [1/4] Copiando archivos a %APPDIR% ...
if not exist "%APPDIR%" mkdir "%APPDIR%"
xcopy /E /I /Y "%~dp0app" "%APPDIR%" >nul
echo       Listo.
echo.

:: npm install
echo [2/4] Instalando dependencias (puede tomar 3-5 minutos)...
echo       Se requiere conexion a internet para este paso.
echo.
cd /d "%APPDIR%"
npm install > "%APPDIR%\install.log" 2>&1
if errorlevel 1 (
  echo ERROR en npm install. Revisa: %APPDIR%\install.log
  pause
  exit /b 1
)
echo       Listo.
echo.

:: Create settings.json with demo_mode on
echo [3/4] Configurando modo demostracion...
set SETTINGS_DIR=%APPDATA%\farmacia-recordatorios
if not exist "%SETTINGS_DIR%" mkdir "%SETTINGS_DIR%"

powershell -Command ^
  "$s = [ordered]@{" ^
  "  demo_mode = $true;" ^
  "  farmacia = [ordered]@{nombre='Farmacia Feliciano en Arroyo'; telefono='787-271-1691'; descuento_cumpleanos='10'};" ^
  "  rx30 = [ordered]@{server=''; port=1433; database='RX30'; user=''; password=''; enabled=$false};" ^
  "  twilio = [ordered]@{account_sid=''; auth_token=''; whatsapp_from='+14155238886'; call_from='+17872711691'; recording_receta_url=''};" ^
  "  schedule = [ordered]@{hora='10:00'; dias=@(1,2,3,4,5,6); canal='llamada'}" ^
  "}; $s | ConvertTo-Json -Depth 5 | Set-Content '%SETTINGS_DIR%\settings.json'"

echo       Listo.
echo.

:: Desktop shortcut
echo [4/4] Creando acceso directo en el escritorio...
set ELECTRON=%APPDIR%\node_modules\electron\dist\electron.exe

powershell -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut('%DESKTOP%\Farmacia Recordatorios.lnk');" ^
  "$sc.TargetPath = '%ELECTRON%';" ^
  "$sc.Arguments = '%APPDIR%';" ^
  "$sc.WorkingDirectory = '%APPDIR%';" ^
  "$sc.Description = 'Farmacia Recordatorios — Sistema de recordatorios';" ^
  "$sc.Save()"

echo       Listo.
echo.
echo =====================================================
echo   Instalacion completa!
echo.
echo   Abre "Farmacia Recordatorios" en el escritorio.
echo   La app arranca en MODO DEMOSTRACION (sin envios
echo   reales). Para activar envios: cambia demo_mode
echo   a false en settings.json
echo =====================================================
echo.
pause
