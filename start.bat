@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title DataDrishti Launcher

set PYTHON=runtime\python\python.exe
set OLLAMA=runtime\ollama\ollama.exe
set MODEL=gemma3:4b
set MODEL_SMALL=gemma3:2b
set PORT=5000
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

cls
echo.
echo  ====================================================
echo   DataDrishti - Intelligent Data Analyzer
echo   For Government Offices  ^|  Rajasthan Police
echo  ====================================================
echo.

:: ---------- STEP 1: Python Runtime --------------------------
if exist "%PYTHON%" goto :python_ok
echo  [ERR] Python runtime not found at: runtime\python\
echo        Re-download the complete DataDrishti package.
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

:: ---------- STEP 3: Ollama AI Engine ------------------------
if exist "%OLLAMA%" goto :ollama_exists
echo  [..] Downloading Ollama AI engine (~120 MB, first time only)...
if not exist "runtime\ollama" mkdir "runtime\ollama"
echo       Please wait - this may take 3-5 minutes on a slow connection...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.exe' -OutFile 'runtime\ollama\ollama.exe' -TimeoutSec 300 } catch { Write-Host 'Download failed:' $_.Exception.Message } }"
if exist "%OLLAMA%" goto :ollama_downloaded
echo  [WARN] Ollama download failed - app will run without AI features.
goto :start_flask
:ollama_downloaded
echo  [OK] Ollama downloaded
:ollama_exists
echo  [OK] Ollama AI engine ready

:: ---------- STEP 4: Start Ollama Service --------------------
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul 2>&1
if not errorlevel 1 goto :ollama_running
echo  [..] Starting Ollama service...
start /b "" "%OLLAMA%" serve
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
if "%CHOSEN_MODEL%"=="%MODEL%" echo       Size: ~2.9 GB - after this works 100%% OFFLINE
if "%CHOSEN_MODEL%"=="%MODEL_SMALL%" echo       Size: ~1.7 GB - after this works 100%% OFFLINE
"%OLLAMA%" pull %CHOSEN_MODEL%
:model_ready
echo  [OK] AI model ready

:: ---------- STEP 7: Launch DataDrishti ----------------------
:start_flask
echo  [..] Starting DataDrishti server...
taskkill /F /FI "WINDOWTITLE eq DataDrishti*" >nul 2>&1
start /b "" "%PYTHON%" app.py
timeout /t 3 /nobreak >nul

:: ---------- STEP 8: Open browser ----------------------------
start "" "http://localhost:%PORT%"

echo.
echo  ====================================================
echo   DataDrishti is running!
echo   Browser opening at: http://localhost:%PORT%
echo   To stop: run stop.bat
echo  ====================================================
echo.
echo  You can close this window - the app keeps running.
pause >nul
