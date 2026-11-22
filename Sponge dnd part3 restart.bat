@echo off
title Sponge bench - D^&D part 3 x3 (restart)
cd /d "%~dp0dnd\director"
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
if exist bench-part3-3.log move /y bench-part3-3.log bench-part3-3-old.log >nul
node tools\bench.mjs --part 3 --runs 3 --log bench-part3-3.log
echo.
echo Done.
