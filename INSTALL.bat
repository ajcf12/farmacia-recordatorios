@echo off
setlocal
set APPDIR=C:\FarmaciaApp
set DESKTOP=%USERPROFILE%\Desktop
set LOGFILE=%TEMP%\farmacia-install.log

:: Auto-elevate if not running as admin
net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process cmd.exe -ArgumentList '/k \"%~f0\"' -Verb RunAs"
  exit /b
)

:: Start log
echo Farmacia Recordatorios — Log de instalacion > "%LOGFILE%"
echo Fecha: %DATE% %TIME% >> "%LOGFILE%"
echo. >> "%LOGFILE%"

echo.
echo =====================================================
echo   Instalador — Farmacia Recordatorios v1.0
echo =====================================================
echo.
echo   Log guardado en: %LOGFILE%
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
  echo ERROR: Node.js no encontrado >> "%LOGFILE%"
  goto :error
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js encontrado: %NODEVER%
echo [OK] Node.js: %NODEVER% >> "%LOGFILE%"
echo.

:: Copy app files
echo [1/4] Copiando archivos a %APPDIR% ...
echo [1/4] Copiando archivos... >> "%LOGFILE%"
if not exist "%APPDIR%" mkdir "%APPDIR%"
if not exist "%~dp0app" (
  echo ERROR: Carpeta "app" no encontrada junto al instalador.
  echo ERROR: Carpeta app no encontrada en %~dp0 >> "%LOGFILE%"
  goto :error
)
xcopy /E /I /Y "%~dp0app" "%APPDIR%" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo ERROR: Fallo al copiar archivos. Revisa el log: %LOGFILE%
  echo ERROR: xcopy fallo >> "%LOGFILE%"
  goto :error
)
echo       Listo.
echo [OK] Archivos copiados >> "%LOGFILE%"
echo.

:: npm install
echo [2/4] Instalando dependencias (puede tomar 3-5 minutos)...
echo       Se requiere conexion a internet para este paso.
echo [2/4] npm install... >> "%LOGFILE%"
echo.
cd /d "%APPDIR%"
npm install >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo ERROR en npm install.
  echo Revisa el log completo en: %LOGFILE%
  echo ERROR: npm install fallo >> "%LOGFILE%"
  goto :error
)
echo       Listo.
echo [OK] npm install completado >> "%LOGFILE%"
echo.

:: Create settings.json with demo_mode on
echo [3/4] Configurando modo demostracion...
echo [3/4] Creando settings.json... >> "%LOGFILE%"
set SETTINGS_DIR=%APPDATA%\farmacia-recordatorios
if not exist "%SETTINGS_DIR%" mkdir "%SETTINGS_DIR%"

powershell -Command ^
  "$s = [ordered]@{" ^
  "  demo_mode = $true;" ^
  "  farmacia = [ordered]@{nombre='Farmacia Feliciano en Arroyo'; telefono='787-271-1691'; descuento_cumpleanos='10'};" ^
  "  rx30 = [ordered]@{server=''; port=1433; database='RX30'; user=''; password=''; enabled=$false};" ^
  "  twilio = [ordered]@{account_sid=''; auth_token=''; whatsapp_from='+14155238886'; call_from='+17872711691'; recording_receta_url=''};" ^
  "  schedule = [ordered]@{hora='10:00'; dias=@(1,2,3,4,5,6); canal='llamada'}" ^
  "}; $s | ConvertTo-Json -Depth 5 | Set-Content '%SETTINGS_DIR%\settings.json'" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo ERROR al crear settings.json. Revisa el log: %LOGFILE%
  echo ERROR: settings.json fallo >> "%LOGFILE%"
  goto :error
)
echo       Listo.
echo [OK] settings.json creado >> "%LOGFILE%"
echo.

:: Desktop shortcut
echo [4/4] Creando acceso directo en el escritorio...
echo [4/4] Creando acceso directo... >> "%LOGFILE%"
set ELECTRON=%APPDIR%\node_modules\electron\dist\electron.exe

powershell -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut('%DESKTOP%\Farmacia Recordatorios.lnk');" ^
  "$sc.TargetPath = '%ELECTRON%';" ^
  "$sc.Arguments = '%APPDIR%';" ^
  "$sc.WorkingDirectory = '%APPDIR%';" ^
  "$sc.Description = 'Farmacia Recordatorios — Sistema de recordatorios';" ^
  "$sc.Save()" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo ADVERTENCIA: No se pudo crear el acceso directo. La app igual funciona.
  echo ADVERTENCIA: shortcut fallo >> "%LOGFILE%"
)
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
echo [OK] Instalacion completada exitosamente >> "%LOGFILE%"
echo   Log guardado en: %LOGFILE%
echo.
pause
exit /b 0

:error
echo.
echo =====================================================
echo   INSTALACION FALLIDA
echo   Log completo guardado en:
echo   %LOGFILE%
echo =====================================================
echo.
pause
exit /b 1
