@echo off
title AI Center UB - All-In-One Workshop Station [Epson + Bambu]
cd /d "%~dp0"

echo =======================================================
echo     AI Center UB - Workshop AIO Hardware Station
echo =======================================================
echo.
echo Starting Epson L3110 Print Agent and Bambu Studio Bridge...
echo.

:: Start Epson Agent in new window
if exist "..\epson-agent\start-agent.cmd" (
    start "Epson L3110 Print Agent" cmd /c "cd /d ..\epson-agent && start-agent.cmd"
)

:: Start Bambu Bridge in current window
call start-bambu-bridge.cmd
