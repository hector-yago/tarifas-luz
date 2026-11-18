@echo off
REM Arranca la PWA en local y abre el navegador (requiere Node.js).
cd /d "%~dp0"
start "" http://localhost:8080/
node serve.mjs 8080
