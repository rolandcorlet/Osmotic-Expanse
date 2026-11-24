@echo off
title Sponge bench - D^&D part 3 x3 (restart)
cd /d "%~dp0dnd\director"
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
if exist bench-part3-3.log move /y bench-part3-3.log bench-part3-3-old.log >nul
del /q bench-part3-3.exit.txt 2>nul
node tools\bench.mjs --part 3 --runs 3 --log bench-part3-3.log
set CODE=%ERRORLEVEL%
>bench-part3-3.exit.txt echo %DATE% %TIME% exit code %CODE%
echo.
if not "%CODE%"=="0" if not "%CODE%"=="1" (
  echo The bench stopped unexpectedly ^(exit code %CODE%^). Sponge can read the log and the status file.
  pause
)
echo Done.
