@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\server\index.js" call npm run build
call npm run hub
endlocal
