@echo off
setlocal enabledelayedexpansion
title AI Center UB - Stop Epson Agent
cd /d "%~dp0"

echo Stopping Epson L3110 Print Agent...

if exist "%~dp0agent.pid" (
    set /p AGENT_PID=<"%~dp0agent.pid"
    if defined AGENT_PID (
        taskkill /PID !AGENT_PID! /F >nul 2>nul
    )
    del /f /q "%~dp0agent.pid" >nul 2>nul
)

:: Ensure any orphaned process running epson-agent.mjs is stopped
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { .CommandLine -like '*epson-agent.mjs*' } | ForEach-Object { Stop-Process -Id .ProcessId -Force }" >nul 2>nul

echo [OK] Epson Print Agent has been stopped.
if "%~1"=="" pause
