@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale Node.js 18 ou superior.
  pause
  exit /b 1
)
if not defined SONAR_URL set "SONAR_URL=http://localhost:9002"
if not defined PORT set "PORT=3100"
echo Iniciando Dashboard SonarQube...
echo URL: http://127.0.0.1:%PORT%
echo SonarQube: %SONAR_URL%
echo Para parar, pressione Ctrl+C.
node server.js
if errorlevel 1 (
  echo O servidor encerrou com erro.
  pause
)
