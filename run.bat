@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo [ERROR] Falta el entorno virtual.
  echo Ejecuta primero setup.bat
  pause
  exit /b 1
)

if not exist "frontend\dist\index.html" (
  echo La interfaz no esta compilada. Compilando...
  pushd frontend
  call npm run build
  if errorlevel 1 (
    popd
    echo [ERROR] No se pudo compilar la interfaz. Ejecuta setup.bat.
    pause
    exit /b 1
  )
  popd
)

set "MCS_HOST=127.0.0.1"
set "MCS_PORT=8000"
set "URL=http://127.0.0.1:8000"

echo ============================================================
echo  Lumen Studio
echo  Interfaz: %URL%
echo  API:      %URL%/api/docs
echo  Cierra esta ventana o pulsa Ctrl+C para detener el servidor.
echo ============================================================
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%URL%'"

pushd backend
"..\backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host %MCS_HOST% --port %MCS_PORT% --log-level info
popd

pause
