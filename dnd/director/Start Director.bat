@echo off
rem Double-click this file on the computer that will host the table.
title Dungeons and Dragons 5e - AI Director
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
where git >nul 2>nul
if not errorlevel 1 (
  echo Checking GitHub for a newer version...
  git pull --ff-only --quiet
  if errorlevel 1 echo Could not update from GitHub; starting this copy.
)
node server.js %*
echo.
pause
