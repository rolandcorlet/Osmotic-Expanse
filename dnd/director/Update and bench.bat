@echo off
rem Gets the newest version from GitHub, then runs the AI bench three times with the AI chosen
rem on the Director tab, and saves the log here as bench-latest.log. Send that file to Sponge.
title D^&D Director - update and bench
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed, so the update step is skipped. Get it from https://git-scm.com
) else (
  echo Getting the newest version from GitHub...
  git pull --ff-only
  if errorlevel 1 echo The update did not go through: see the message above. The bench runs on this copy.
)
echo.
echo Running the bench (this takes 10 to 20 minutes)...
node tools\bench.mjs --runs 3 --log bench-latest.log
echo.
echo Done. The log is dnd\director\bench-latest.log
pause
