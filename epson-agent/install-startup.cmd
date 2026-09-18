@echo off
setlocal enabledelayedexpansion
title AI Center UB - Install Epson Agent to Startup
cd /d "%~dp0"

echo =======================================================
echo   AI Center UB - Install Epson Agent to Windows Startup
echo =======================================================
echo.

:: 1. Check Node.js
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

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo Please install Node.js LTS from https://nodejs.org/ first.
    echo.
    pause
    exit /b 1
)

:: 2. Ensure dependencies are installed
if not exist "node_modules\pdf-to-printer" (
    echo [Setup] Installing required dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [Setup] Dependencies installed.
    echo.
)

:: 3. Create Windows Startup Shortcut
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\EpsonPrintAgent.lnk"

echo [1/2] Creating Windows Startup shortcut...
cscript //Nologo "%~dp0make-shortcut.vbs" "%SHORTCUT_PATH%" "%~dp0run-silent.vbs" "%~dp0"
if not exist "%SHORTCUT_PATH%" (
    echo [WARN] VBS shortcut creation fallback to PowerShell...
    powershell -NoProfile -Command " = New-Object -ComObject WScript.Shell;  = .CreateShortcut('%SHORTCUT_PATH%'); .TargetPath = 'wscript.exe'; .Arguments = '\"%~dp0run-silent.vbs\"'; .WorkingDirectory = '%~dp0'; .Save()"
)

:: 4. Stop existing instance if running, then launch silently
echo [2/2] Launching agent in silent background mode...
call "%~dp0stop-agent.cmd" >nul 2>nul
start "" wscript.exe "%~dp0run-silent.vbs"

echo.
echo =======================================================
echo [SUCCESS] Epson Print Agent is now configured!
echo.
echo - It is now running SILENTLY in the background.
echo - It will automatically start whenever Windows boots.
echo - No command prompt window will open.
echo - To view activity, run: view-logs.cmd
echo - To stop it, run: stop-agent.cmd
echo =======================================================
echo.
pause
