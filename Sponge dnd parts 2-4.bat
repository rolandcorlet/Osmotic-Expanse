@echo off
title Sponge bench - D^&D parts 2, 3 and 4
rem Parts 2 (x2), 3 (x3) and 4 (x3) one after another, each with its own log, status and exit files.
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
set BAD=
call :part 2 2
call :part 3 3
call :part 4 3
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
