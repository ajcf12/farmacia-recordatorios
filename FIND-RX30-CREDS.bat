@echo off
echo.
echo === Rx30 SQL Server Credential Finder ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0find-rx30-creds.ps1"
echo.
echo =========================================
echo Copy the results above and send to Alfonso
echo =========================================
echo.
pause
