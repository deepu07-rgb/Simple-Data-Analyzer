@echo off
title Stellura - Stopping
cd /d "%~dp0"

echo.
echo  Stopping Stellura...
echo  Stellura band ho raha hai...
echo.

:: Stop ONLY the Stellura server. app.py records its own PID at start-up, so
:: other Python programs on this PC are never touched.
set STELLURA_PID=
if not exist "runtime\stellura.pid" goto :stop_ollama
set /p STELLURA_PID=<"runtime\stellura.pid"
if "%STELLURA_PID%"=="" goto :stop_ollama
taskkill /F /PID %STELLURA_PID% /T >nul 2>&1
del /f /q "runtime\stellura.pid" >nul 2>&1

:stop_ollama
:: Stop Ollama only if start.bat started it (marker file). An Ollama that was
:: already running before Stellura is left alone.
if not exist "runtime\ollama_started_by_stellura" goto :done
taskkill /F /IM ollama.exe /T >nul 2>&1
del /f /q "runtime\ollama_started_by_stellura" >nul 2>&1

:done
echo  [OK] Stellura stopped.
echo  [OK] Stellura band ho gaya.
echo.
timeout /t 2 /nobreak >nul
