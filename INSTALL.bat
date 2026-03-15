@echo off
setlocal
set APPDIR=C:\FarmaciaApp
set LOGFILE=%TEMP%\farmacia-install.log

:: Auto-elevate if not running as admin
net session >nul 2>&1
if errorlevel 1 goto :needadmin
goto :start

:needadmin
echo Solicitando permisos de administrador...
echo Set UAC = CreateObject("Shell.Application") > "%temp%\_elev.vbs"
echo UAC.ShellExecute "cmd.exe", "/k ""%~f0""", "", "runas", 1 >> "%temp%\_elev.vbs"
wscript "%temp%\_elev.vbs"
del "%temp%\_elev.vbs" >nul 2>&1
exit /b

:start
echo Farmacia Recordatorios — Log > "%LOGFILE%"
echo Fecha: %DATE% %TIME% >> "%LOGFILE%"

echo.
echo =====================================================
echo   Instalador - Farmacia Recordatorios v1.0
echo =====================================================
echo.
echo   Log: %LOGFILE%
echo.

:: Node.js check
where node >nul 2>&1
if errorlevel 1 goto :nonodejs

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js: %NODEVER%
echo Node: %NODEVER% >> "%LOGFILE%"
echo.

:: Step 1: Copy files
echo [1/4] Copiando archivos a %APPDIR% ...
echo Step 1: xcopy >> "%LOGFILE%"
if not exist "%APPDIR%" mkdir "%APPDIR%"

pushd "%~dp0"
if not exist "app" goto :noappfolder

xcopy /E /I /Y "app" "%APPDIR%"
if errorlevel 1 goto :xcopyerror
popd

echo       Listo.
echo xcopy OK >> "%LOGFILE%"
echo.

:: Step 2: npm install
echo [2/4] Instalando dependencias (3-5 minutos, requiere internet)...
echo       Por favor espera, no cierres esta ventana...
echo       Veras texto desplazarse a continuacion - es normal.
echo Step 2: npm install >> "%LOGFILE%"
echo.
cd /d "%APPDIR%"
npm install
if errorlevel 1 goto :npmerror
echo.
echo       [2/4] Listo.
echo npm OK >> "%LOGFILE%"
echo.

:: Step 3: settings.json
echo [3/4] Configurando...
echo Step 3: settings >> "%LOGFILE%"
set SETTINGS_DIR=%APPDATA%\farmacia-recordatorios
if not exist "%SETTINGS_DIR%" mkdir "%SETTINGS_DIR%"
set SFILE=%SETTINGS_DIR%\settings.json

echo { > "%SFILE%"
echo   "demo_mode": true, >> "%SFILE%"
echo   "farmacia": { >> "%SFILE%"
echo     "nombre": "Farmacia Feliciano en Arroyo", >> "%SFILE%"
echo     "telefono": "787-271-1691", >> "%SFILE%"
echo     "descuento_cumpleanos": "10" >> "%SFILE%"
echo   }, >> "%SFILE%"
echo   "rx30": { "server": "", "port": 1433, "database": "RX30", "user": "", "password": "", "enabled": false }, >> "%SFILE%"
echo   "twilio": { "account_sid": "", "auth_token": "", "whatsapp_from": "+14155238886", "call_from": "+17872711691", "recording_receta_url": "" }, >> "%SFILE%"
echo   "schedule": { "hora": "10:00", "dias": [1,2,3,4,5,6], "canal": "llamada" } >> "%SFILE%"
echo } >> "%SFILE%"

echo       Listo.
echo settings OK >> "%LOGFILE%"
echo.

:: Step 4: Desktop shortcut + icon
echo [4/4] Creando acceso directo e icono...
echo Step 4: shortcut >> "%LOGFILE%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%\make-shortcut.ps1" >> "%LOGFILE%" 2>&1
if errorlevel 1 echo ADVERTENCIA: acceso directo no creado. La app igual funciona.

echo       Listo.
echo.
echo.
echo =====================================================
echo   INSTALACION COMPLETA
echo   Abre "Farmacia Recordatorios" en el escritorio.
echo   Inicia en MODO DEMOSTRACION (sin envios reales).
echo =====================================================
echo.
echo OK >> "%LOGFILE%"
echo Presiona cualquier tecla para cerrar este instalador...
pause >nul
exit /b 0

:nonodejs
echo.
echo ERROR: Node.js no instalado.
echo  1. Ve a https://nodejs.org
echo  2. Descarga la version LTS
echo  3. Instala, reinicia, y vuelve a ejecutar
echo.
pause
exit /b 1

:noappfolder
echo.
echo ERROR: Carpeta "app" no encontrada.
echo Asegurate de que INSTALL.bat este dentro de la carpeta farmacia-recordatorios
echo.
pause
exit /b 1

:xcopyerror
echo.
echo ERROR: Fallo al copiar archivos.
echo Revisa el log: %LOGFILE%
echo.
pause
exit /b 1

:npmerror
echo.
echo ERROR: Fallo npm install.
echo Revisa el log: %LOGFILE%
echo.
pause
exit /b 1
