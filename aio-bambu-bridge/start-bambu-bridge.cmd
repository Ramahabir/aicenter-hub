@echo off
setlocal enabledelayedexpansion
title AI Center UB - Bambu Lab P1S Bridge Agent [AIO PC]
cd /d "%~dp0"

echo =======================================================
echo   AI Center UB - Bambu Studio Bridge Agent [AIO PC]
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
    echo Please install Node.js LTS from: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Check Bambu Studio
set "STUDIO_PATH=C:\Program Files\Bambu Studio\bambu-studio.exe"
if exist "%STUDIO_PATH%" (
    echo [OK] Bambu Studio found at "%STUDIO_PATH%"
) else (
    echo [WARN] Bambu Studio not found at default location.
    echo If installed in custom location, set BAMBU_STUDIO_PATH in .env
)
echo.

:: 3. Start Bridge Agent
echo -------------------------------------------------------
echo Starting Bambu Lab AIO Bridge Agent...
echo Keep this window OPEN on the AIO PC.
echo Press Ctrl+C to stop.
echo -------------------------------------------------------
echo.

node bambu-aio-agent.mjs

echo.
echo Bridge Agent stopped.
pause
