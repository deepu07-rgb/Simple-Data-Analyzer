@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Stellura Launcher

set PYTHON=runtime\python\python.exe
set PYTHONW=runtime\python\pythonw.exe
set OLLAMA=runtime\ollama\ollama.exe
set MODEL=qwen2.5:7b
set MODEL_SMALL=qwen2.5:3b
set PORT=5000
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

cls
echo.
echo  ====================================================
echo   Stellura - Intelligent Data Analyzer
echo   For Government Offices  ^|  Rajasthan Police
echo   AI Model: Qwen2.5 (Apache 2.0 - Free for Govt use)
echo  ====================================================
echo.

:: ---------- STEP 1: Python Runtime --------------------------
if exist "%PYTHON%" goto :python_ok
echo  [ERR] Python runtime not found at: runtime\python\
echo        Re-download the complete Stellura package.
pause
exit /b 1
:python_ok
echo  [OK] Python runtime ready

:: ---------- STEP 2: Python Packages -------------------------
"%PYTHON%" -c "import flask" >nul 2>&1
if not errorlevel 1 goto :packages_ok
echo  [..] First run: installing packages (needs internet, 1-2 min)...
"%PYTHON%" -m pip install -r requirements.txt --quiet --no-warn-script-location >nul 2>&1
if not errorlevel 1 goto :packages_ok
echo  [ERR] Package install failed. Check internet connection.
pause
exit /b 1
:packages_ok
echo  [OK] Python packages ready

:: ---------- STEP 2b: Hindi PDF shaping (non-fatal) ----------
:: Installs made before Hindi shaping was added have flask but not uharfbuzz.
"%PYTHON%" -c "import uharfbuzz; from reportlab.pdfbase.ttfonts import shapeStr" >nul 2>&1
if not errorlevel 1 goto :shaping_ok
echo  [..] Adding Hindi PDF shaping support (needs internet, about 2 MB)...
"%PYTHON%" -m pip install -r requirements.txt --quiet --no-warn-script-location >nul 2>&1
if errorlevel 1 echo  [WARN] Could not install Hindi PDF shaping. PDFs still work but Hindi may look wrong.
:shaping_ok

:: ---------- STEP 3: Ollama AI Engine ------------------------
:: Guard: delete any corrupt/truncated local ollama.exe. A failed download can
:: leave a tiny "Not Found" file that Windows reports as a 16-bit application.
if not exist "runtime\ollama\ollama.exe" goto :ollama_guard_done
set LOCAL_OLLAMA_SIZE=0
for %%I in ("runtime\ollama\ollama.exe") do set LOCAL_OLLAMA_SIZE=%%~zI
if %LOCAL_OLLAMA_SIZE% LSS 1048576 del /f /q "runtime\ollama\ollama.exe"
:ollama_guard_done
:: Check local runtime first, then system install, then known install paths
if exist "%OLLAMA%" goto :ollama_exists
where ollama >nul 2>&1
if not errorlevel 1 (
    set OLLAMA=ollama
    goto :ollama_exists
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe
    goto :ollama_exists
)
if exist "%LOCALAPPDATA%\Ollama\ollama.exe" (
    set OLLAMA=%LOCALAPPDATA%\Ollama\ollama.exe
    goto :ollama_exists
)
echo  [..] Downloading Ollama AI engine (~1.3 GB, first time only)...
echo       Enables 100%% offline AI analysis after this one-time download.
echo       Please wait - 10 to 25 minutes on slow connection. Do NOT close window.
echo.
if not exist "runtime\ollama" mkdir "runtime\ollama"
if exist "runtime\ollama\OllamaSetup.exe" del /f /q "runtime\ollama\OllamaSetup.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe' -OutFile 'runtime\ollama\OllamaSetup.exe' -TimeoutSec 3600 } catch { Write-Host 'Download failed: ' $_.Exception.Message } }"
if not exist "runtime\ollama\OllamaSetup.exe" (
    echo  [WARN] Ollama download failed. App will run without AI features.
    goto :start_flask
)
:: Validate the download is a real installer (must be > 50 MB), not a 404 error page
set SETUP_SIZE=0
for %%I in ("runtime\ollama\OllamaSetup.exe") do set SETUP_SIZE=%%~zI
if %SETUP_SIZE% LSS 52428800 (
    echo  [WARN] Ollama download is incomplete or corrupt ^(%SETUP_SIZE% bytes^). Deleting.
    echo         App will run without AI features. Re-run start.bat to retry.
    del /f /q "runtime\ollama\OllamaSetup.exe"
    goto :start_flask
)
echo  [..] Installing Ollama silently (1-2 min)...
"runtime\ollama\OllamaSetup.exe" /S
timeout /t 15 /nobreak >nul
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe
    goto :ollama_installed_ok
)
if exist "%LOCALAPPDATA%\Ollama\ollama.exe" (
    set OLLAMA=%LOCALAPPDATA%\Ollama\ollama.exe
    goto :ollama_installed_ok
)
where ollama >nul 2>&1
if not errorlevel 1 (
    set OLLAMA=ollama
    goto :ollama_installed_ok
)
echo  [WARN] Ollama installed but path could not be detected. AI features may not work.
goto :start_flask
:ollama_installed_ok
echo  [OK] Ollama installed successfully
:ollama_exists
echo  [OK] Ollama AI engine ready

:: ---------- STEP 4: Start Ollama Service --------------------
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul 2>&1
if not errorlevel 1 goto :ollama_running
echo  [..] Starting Ollama service...
start /min "Ollama" "%OLLAMA%" serve
timeout /t 4 /nobreak >nul
:ollama_running
echo  [OK] Ollama service running

:: ---------- STEP 5: Select AI model by RAM ------------------
set TOTAL_RAM=4
for /f %%A in ('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB -as [int]" 2^>nul') do set TOTAL_RAM=%%A

set CHOSEN_MODEL=%MODEL_SMALL%
if %TOTAL_RAM% GEQ 8 set CHOSEN_MODEL=%MODEL%
echo  [i] RAM: %TOTAL_RAM% GB - model: %CHOSEN_MODEL%

:: ---------- STEP 6: Pull AI Model if missing ----------------
"%OLLAMA%" list 2>nul | find "%CHOSEN_MODEL%" >nul 2>&1
if not errorlevel 1 goto :model_ready
echo  [..] Downloading AI model: %CHOSEN_MODEL% (one-time download)...
if "%CHOSEN_MODEL%"=="%MODEL%" echo       Size: ~4.7 GB - one-time download, works 100%% OFFLINE after
if "%CHOSEN_MODEL%"=="%MODEL_SMALL%" echo       Size: ~2.0 GB - one-time download, works 100%% OFFLINE after
"%OLLAMA%" pull %CHOSEN_MODEL%
:model_ready
echo  [OK] AI model ready

:: ---------- STEP 7: Launch Stellura ----------------------
:start_flask
echo  [..] Starting Stellura server...
taskkill /F /FI "WINDOWTITLE eq Stellura*" >nul 2>&1
start "" "%PYTHONW%" app.py
timeout /t 3 /nobreak >nul

:: ---------- STEP 8: Open browser ----------------------------
start "" "http://localhost:%PORT%"

echo.
echo  ====================================================
echo   Stellura is running!
echo   Browser opening at: http://localhost:%PORT%
echo   To stop: run stop.bat
echo  ====================================================
echo.
echo  You can close this window - the app keeps running.
pause >nul
