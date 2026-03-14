@echo off
node "%~dp0auto-send.js" >> "%APPDATA%\farmacia-recordatorios\auto-send.log" 2>&1
