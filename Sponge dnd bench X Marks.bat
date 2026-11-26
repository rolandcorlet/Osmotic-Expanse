@echo off
title Sponge bench - D^&D X Marks the Spot (a converted campaign)
rem The checks that need no GPU for X Marks the Spot alone (tools\preflight.mjs x-marks-the-spot: the
rem checker, the fight simulation, replay and fuzz, a generated script on the stand-in model), then a script
rem written from the adventure itself, played twice by the local model, with its log, status, exit and calls
rem files. The adventure is the one converted on the Books tab (library\adventures\x-marks-the-spot.json).
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set ADV=x-marks-the-spot
set AIARGS=
if not "%BENCH_PROVIDER%"=="" set AIARGS=--provider %BENCH_PROVIDER%
if not "%BENCH_MODEL%"=="" set AIARGS=%AIARGS% --model %BENCH_MODEL%
cd /d "%~dp0dnd\director"
rem A click in this window must not pause it (QuickEdit): switch that off for this window.
powershell -NoProfile -ExecutionPolicy Bypass -File tools\no-quickedit.ps1 >nul 2>nul
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo.
echo ===== Preflight for %ADV% (no GPU) =====
node tools\preflight.mjs %ADV% > preflight-%ADV%.log 2>&1
set PRE=%ERRORLEVEL%
>preflight-%ADV%.exit.txt echo %DATE% %TIME% exit code %PRE%
if not "%PRE%"=="0" (
  echo The preflight failed: see dnd\director\preflight-%ADV%.log. No GPU time spent.
  pause
  goto :eof
)
echo Preflight passed.
del /q bench-gen-%ADV%-2.exit.txt 2>nul
echo.
echo ===== A script written from %ADV%, 2 runs =====
node tools\bench.mjs %AIARGS% --script gen --adventure %ADV% --runs 2 --log bench-gen-%ADV%-2.log
set CODE=%ERRORLEVEL%
>bench-gen-%ADV%-2.exit.txt echo %DATE% %TIME% exit code %CODE%
if not "%CODE%"=="0" if not "%CODE%"=="1" (
  echo The bench stopped unexpectedly ^(code %CODE%^). Sponge can read the log and the status file.
  pause
)
echo Done.
