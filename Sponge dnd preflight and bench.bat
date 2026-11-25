@echo off
title Sponge bench - D^&D preflight, parts 2 to 4, and a generated script
rem First the checks that need no GPU (tools\preflight.mjs: the checker, the fight simulation, replay and
rem fuzz, a generated script on the stand-in model). Then parts 2 (x2), 3 (x3) and 4 (x3), and a script
rem written from the Lantern itself (x2), each with its own log, status, exit and calls files.
rem The AI the bench plays with: kept on your local model whatever the Director tab is set to.
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set AIARGS=
if not "%BENCH_PROVIDER%"=="" set AIARGS=--provider %BENCH_PROVIDER%
if not "%BENCH_MODEL%"=="" set AIARGS=%AIARGS% --model %BENCH_MODEL%
cd /d "%~dp0dnd\director"
rem A click in this window must not pause it (QuickEdit): switch that off for this window.
powershell -NoProfile -ExecutionPolicy Bypass -File tools\no-quickedit.ps1 >nul 2>nul
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo.
echo ===== Preflight (no GPU) =====
node tools\preflight.mjs > preflight.log 2>&1
set PRE=%ERRORLEVEL%
>preflight.exit.txt echo %DATE% %TIME% exit code %PRE%
if not "%PRE%"=="0" (
  echo The preflight failed: see dnd\director\preflight.log. No GPU time spent.
  pause
  goto :eof
)
echo Preflight passed.
set BAD=
call :part 2 2
call :part 3 3
call :part 4 3
call :gen lantern 2
echo.
if defined BAD (
  echo A bench stopped unexpectedly ^(%BAD%^). Sponge can read the logs and the status files.
  pause
)
echo Done.
goto :eof

:part
del /q bench-part%1-%2.exit.txt 2>nul
echo.
echo ===== Part %1, %2 runs =====
node tools\bench.mjs %AIARGS% --part %1 --runs %2 --log bench-part%1-%2.log
set CODE=%ERRORLEVEL%
>bench-part%1-%2.exit.txt echo %DATE% %TIME% exit code %CODE%
if not "%CODE%"=="0" if not "%CODE%"=="1" set BAD=%BAD% part %1 code %CODE%
goto :eof

:gen
del /q bench-gen-%1-%2.exit.txt 2>nul
echo.
echo ===== A script written from %1, %2 runs =====
node tools\bench.mjs %AIARGS% --script gen --adventure %1 --runs %2 --log bench-gen-%1-%2.log
set CODE=%ERRORLEVEL%
>bench-gen-%1-%2.exit.txt echo %DATE% %TIME% exit code %CODE%
if not "%CODE%"=="0" if not "%CODE%"=="1" set BAD=%BAD% gen %1 code %CODE%
goto :eof
