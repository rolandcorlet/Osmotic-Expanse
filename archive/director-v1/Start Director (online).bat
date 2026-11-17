@echo off
rem Double-click this file to host a table that players can join from anywhere.
rem It needs the free "cloudflared" program:  winget install --id Cloudflare.cloudflared
title The Osmotic Expanse - Director host (online)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
node server.js --online %*
echo.
pause
