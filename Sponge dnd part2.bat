@echo off
title Sponge bench - D^&D part 2 x2
rem The AI the bench plays with. These keep the bench on your local model whatever the Director tab
rem is set to; leave BENCH_PROVIDER empty to use the Director tab's choice instead.
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set AIARGS=
if not "%BENCH_PROVIDER%"=="" set AIARGS=--provider %BENCH_PROVIDER%
if not "%BENCH_MODEL%"=="" set AIARGS=%AIARGS% --model %BENCH_MODEL%
cd /d "%~dp0dnd\director"
rem A click in this window must not pause it (QuickEdit): switch that off for this window.
powershell -NoProfile -ExecutionPolicy Bypass -File tools\no-quickedit.ps1 >nul 2>nul
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
del /q bench-part2-2.exit.txt 2>nul
node tools\bench.mjs %AIARGS% --part 2 --runs 2 --log bench-part2-2.log
set CODE=%ERRORLEVEL%
>bench-part2-2.exit.txt echo %DATE% %TIME% exit code %CODE%
echo.
if not "%CODE%"=="0" if not "%CODE%"=="1" (
  echo The bench stopped unexpectedly ^(exit code %CODE%^). Sponge can read the log and the status file.
  pause
)
echo Done.
