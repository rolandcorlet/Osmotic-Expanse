@echo off
rem Double-click this file on the computer that will host the table.
title The Osmotic Expanse - Director host
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
node server.js %*
echo.
pause
