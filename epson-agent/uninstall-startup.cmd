@echo off
title AI Center UB - Remove Epson Agent from Startup
cd /d "%~dp0"

echo Removing Epson Print Agent from Windows Startup...

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\EpsonPrintAgent.lnk"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%" >nul 2>nul
    echo [OK] Removed startup shortcut.
) else (
    echo [INFO] Startup shortcut not found or already removed.
)

call "%~dp0stop-agent.cmd" no-pause

echo.
echo [SUCCESS] Epson Print Agent will no longer start on boot.
echo.
pause
