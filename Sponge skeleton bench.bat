@echo off
title Skeleton bench (the sample module)
rem The checks that need no model (tools\preflight.mjs: the module checker, the places, a generated script on the
rem stand-in), then a script written from the first adventure, played once by the AI chosen on the AI tab
rem (saves\director.json), with its log, status, exit and calls files.
cd /d "%~dp0skeleton"
echo ===== Preflight (no model) =====
node tools\preflight.mjs > preflight.log 2>&1
set PRE=%ERRORLEVEL%
>preflight.exit.txt echo %DATE% %TIME% exit code %PRE%
if not "%PRE%"=="0" (
  echo The preflight failed: see skeleton\preflight.log.
  pause
  goto :eof
)
echo Preflight passed.
echo.
echo ===== The sample adventure, 1 run =====
node tools\bench.mjs --runs 1 --log bench.log
set CODE=%ERRORLEVEL%
>bench.exit.txt echo %DATE% %TIME% exit code %CODE%
echo Done.
