@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo  Lumen Studio - instalacion local
echo ============================================================
echo.

if not exist "backend\requirements.txt" (
  echo [ERROR] No se encuentra backend\requirements.txt.
  echo Ejecuta este archivo desde la raiz del proyecto.
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [AVISO] FFmpeg no esta en PATH.
  echo Instala una build completa ^(gyan.dev^) y anade su carpeta bin al PATH.
  echo Sin FFmpeg no se pueden analizar ni renderizar videos.
  echo.
)

if not exist "backend\.venv\Scripts\python.exe" (
  echo [1/5] Creando entorno virtual de Python...
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3.12 -m venv backend\.venv 2>nul
    if errorlevel 1 py -3 -m venv backend\.venv
  ) else (
    python -m venv backend\.venv
  )
  if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] No se pudo crear backend\.venv.
    echo Instala Python 3.12 ^(64 bits^) desde python.org y vuelve a intentarlo.
    pause
    exit /b 1
  )
) else (
  echo [1/5] Entorno virtual ya existe.
)

set "PY=backend\.venv\Scripts\python.exe"

echo [2/5] Actualizando pip...
"%PY%" -m pip install --upgrade pip
if errorlevel 1 goto :pip_error

echo [3/5] Instalando dependencias de Python...
"%PY%" -m pip install -r backend\requirements.txt
if errorlevel 1 goto :pip_error

where npm >nul 2>nul
if errorlevel 1 (
  echo [AVISO] npm no esta en PATH. No se puede compilar la interfaz.
  echo Instala Node.js 20+ y ejecuta de nuevo setup.bat.
  goto :doctor
)

if not exist "frontend\node_modules" (
  echo [4/5] Instalando dependencias del frontend...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
  popd
) else (
  echo [4/5] Dependencias del frontend ya instaladas.
)

echo [5/5] Compilando la interfaz...
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] La compilacion del frontend fallo.
  pause
  exit /b 1
)
popd

:doctor
echo.
echo Comprobando el entorno...
"%PY%" scripts\doctor.py
echo.
echo ============================================================
echo  Instalacion terminada.
echo  Arranca la app con: run.bat
echo ============================================================
pause
exit /b 0

:pip_error
echo.
echo [ERROR] La instalacion de dependencias fallo.
echo Revisa tu conexion o ejecuta:
echo   "%PY%" -m pip install -r backend\requirements.txt
pause
exit /b 1
