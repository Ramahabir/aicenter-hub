@echo off
setlocal enabledelayedexpansion
title AI Center UB - Epson L3110 Print Agent
cd /d "%~dp0"

echo =======================================================
echo   AI Center UB - Epson L3110 Print Agent [AIO PC]
echo =======================================================
echo.

:: 1. Check if node is in PATH
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;!PATH!"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
    ) else if exist "%LocalAppData%\Programs\node.exe" (
        set "PATH=%LocalAppData%\Programs;!PATH!"
    )
)

:: Re-check node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo.
    echo To fix this:
    echo 1. Download Node.js LTS installer from: https://nodejs.org/
    echo 2. Run the installer and keep default options.
    echo 3. Open this file again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Check dependencies
if not exist "node_modules\pdf-to-printer" (
    echo [Setup] Installing required dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [Setup] Dependencies installed successfully.
    echo.
)

:: 3. Start Agent
echo -------------------------------------------------------
echo Starting Epson L3110 Print Agent...
echo Keep this window OPEN while the printer is in use.
echo Press Ctrl+C to stop.
echo -------------------------------------------------------
echo.

node epson-agent.mjs

echo.
echo Agent stopped.
pause
