@echo off
title DataDrishti - Stopping
cd /d "%~dp0"

echo.
echo  Stopping DataDrishti...
echo  DataDrishti band ho raha hai...
echo.

:: Stop Flask - running as pythonw.exe (no console, detached)
taskkill /F /IM pythonw.exe /T >nul 2>&1
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM ollama.exe /T >nul 2>&1

echo  [OK] DataDrishti stopped.
echo  [OK] DataDrishti band ho gaya.
echo.
timeout /t 2 /nobreak >nul
