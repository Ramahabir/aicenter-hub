@echo off
title Bambu Lab P1S Network Bridge
:loop
echo [%date% %time%] Starting SSH tunnel... >> "%~dp0tunnel.log"
C:\Windows\System32\OpenSSH\ssh.exe -N -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -R 8883:192.168.0.101:8883 -R 6000:192.168.0.101:6000 hermes >> "%~dp0tunnel.log" 2>&1
echo [%date% %time%] SSH tunnel exited, reconnecting in 5s... >> "%~dp0tunnel.log"
timeout /t 5 /nobreak >nul
goto loop
