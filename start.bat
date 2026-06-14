@echo off
chcp 65001 >nul 2>&1
title DataDrishti Launcher
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: ============================================================
::  DATADRISHTI LAUNCHER  |  v2.2  |  Rajasthan Police
:: ============================================================

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
echo   DataDrishti ^| Data Drishti
echo   Intelligent Data Analyzer for Government Offices
echo  ====================================================
echo.

:: ---- STEP 1: Python Runtime ---------------------------------
if not exist "%PYTHON%" (
    echo  [!] ERROR: Python runtime missing.
    echo      Folder required: runtime\python\
    echo      Please re-download the complete DataDrishti package.
    echo.
    pause
    exit /b 1
)
echo  [OK] Python runtime ready

:: ---- STEP 2: Python Packages (one-time install) ------------
"%PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo  [..] First-time setup: installing Python packages...
    echo       Internet connection required - please wait 1-2 minutes
    "%PYTHON%" -m pip install -r requirements.txt --quiet --no-warn-script-location
    if errorlevel 1 (
        echo  [!] Package install failed. Check internet and try again.
        pause
        exit /b 1
    )
    echo  [OK] Python packages installed successfully
) else (
    echo  [OK] Python packages ready
)

:: ---- STEP 3: Ollama AI Engine ------------------------------
if not exist "%OLLAMA%" (
    echo  [..] Downloading Ollama AI engine (first time only, ~120 MB)...
    if not exist "runtime\ollama\" mkdir "runtime\ollama\"
    powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.exe' -OutFile '%OLLAMA%'"
    if not exist "%OLLAMA%" (
        echo  [!] Ollama download failed. App will run with local analytics only.
        goto :start_flask
    )
    echo  [OK] Ollama downloaded
)
echo  [OK] Ollama AI engine ready

:: ---- STEP 4: Start Ollama Service --------------------------
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul 2>&1
if errorlevel 1 (
    echo  [..] Starting Ollama service...
    start /b "" "%OLLAMA%" serve
    timeout /t 4 /nobreak >nul
)
echo  [OK] Ollama service running

:: ---- STEP 5: Auto-select AI model based on RAM -------------
set TOTAL_RAM=0
for /f "tokens=2 delims==" %%A in ('wmic ComputerSystem get TotalPhysicalMemory /value 2^>nul ^| findstr "="') do (
    set /a "TOTAL_RAM=%%A / 1073741824"
)

if %TOTAL_RAM% GEQ 8 (
    set CHOSEN_MODEL=%MODEL%
    echo  [i] RAM detected: %TOTAL_RAM% GB - using %MODEL% (best quality)
) else (
    set CHOSEN_MODEL=%MODEL_SMALL%
    echo  [i] RAM detected: %TOTAL_RAM% GB - using %MODEL_SMALL% (lightweight)
)

"%OLLAMA%" list 2>nul | find "%CHOSEN_MODEL%" >nul 2>&1
if errorlevel 1 (
    echo  [..] Downloading AI model: %CHOSEN_MODEL%
    if "%CHOSEN_MODEL%"=="%MODEL%" (
        echo       Size: approx 2.9 GB - downloading once only
    ) else (
        echo       Size: approx 1.7 GB - downloading once only
    )
    echo       After this, AI works 100%% OFFLINE - no internet needed
    "%OLLAMA%" pull %CHOSEN_MODEL%
    if errorlevel 1 (
        echo  [!] Model download failed. App will use local analytics instead.
        goto :start_flask
    )
)
echo  [OK] AI model %CHOSEN_MODEL% ready

:start_flask
:: ---- STEP 6: Start DataDrishti ----------------------------
echo  [..] Starting DataDrishti server...
start /b "" "%PYTHON%" app.py
timeout /t 2 /nobreak >nul

:: ---- STEP 7: Open in browser ------------------------------
start "" "http://localhost:%PORT%"

echo.
echo  ====================================================
echo   DataDrishti is running!
echo   Opening in your browser...
echo.
echo   Address : http://localhost:%PORT%
echo   Stop    : run stop.bat
echo  ====================================================
echo.
echo  Press any key to close this window (app keeps running)
pause >nul
