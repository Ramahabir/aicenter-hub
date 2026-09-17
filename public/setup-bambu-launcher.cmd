@echo off
setlocal
title AI Center Hub - Bambu Studio 1-Click Launcher Setup
echo ======================================================================
echo           AI Center Hub - Bambu Studio 1-Click Protocol Setup
echo ======================================================================
echo.
echo This setup allows you to click "Bambu Studio" in the web dashboard
echo (https://devel-ai.ub.ac.id/service-hub) and have 3D models automatically
echo download and open inside your local Bambu Studio on this computer.
echo.

set "TARGET_DIR=%LOCALAPPDATA%\AICenterHub"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

set "LAUNCHER_SCRIPT=%TARGET_DIR%\open-bambu.ps1"

echo [1/2] Writing launcher script to %LAUNCHER_SCRIPT%...
(
echo param([string]$Uri^)
echo $ErrorActionPreference = 'Stop'
echo if (-not $Uri^) { exit }
echo try {
echo     Add-Type -AssemblyName System.Web
echo     $uriObj = [System.Uri]$Uri
echo     $query = [System.Web.HttpUtility]::ParseQueryString($uriObj.Query^)
echo     $url = $query['url']
echo     $fileName = $query['file']
echo     if (-not $url^) {
echo         $url = $Uri -replace '^^aicenter-bambu://open\?url=', ''
echo     }
echo     if (-not $fileName^) { $fileName = 'model.3mf' }
echo     $tempDir = Join-Path $env:TEMP 'AICenter3D'
echo     if (-not (Test-Path $tempDir^)^) { New-Item -ItemType Directory -Path $tempDir -Force ^| Out-Null }
echo     $dest = Join-Path $tempDir $fileName
echo     [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
echo     Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
echo     $bambuDefault = "C:\Program Files\Bambu Studio\bambu-studio.exe"
echo     if (Test-Path $bambuDefault^) {
echo         Start-Process $bambuDefault -ArgumentList "`"$dest`""
echo     } else {
echo         Start-Process $dest
echo     }
echo } catch {
echo     Add-Type -AssemblyName System.Windows.Forms
echo     [System.Windows.Forms.MessageBox]::Show($_.ToString(^), 'AI Center Bambu Studio Launcher Error'^)
echo }
) > "%LAUNCHER_SCRIPT%"

echo [2/2] Registering aicenter-bambu:// protocol in Windows User Registry...
reg add "HKCU\Software\Classes\aicenter-bambu" /ve /d "URL:AI Center Bambu Studio Protocol" /f >nul
reg add "HKCU\Software\Classes\aicenter-bambu" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\aicenter-bambu\shell\open\command" /ve /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%LAUNCHER_SCRIPT%\" \"%%1\"" /f >nul

echo.
echo ======================================================================
echo   [SUCCESS] Setup Completed!
echo   Bambu Studio protocol is now registered for your Windows account.
echo   Clicking "Bambu Studio" in Service Hub will now open models locally.
echo ======================================================================
echo.
pause
