@echo off
title Sponge bench - D^&D part 4, The Ashen Crown x3
cd /d "%~dp0dnd\director"
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
if exist bench-part4-3.log move /y bench-part4-3.log bench-part4-3-old.log >nul
node tools\bench.mjs --part 4 --runs 3 --log bench-part4-3.log
echo.
echo Done.
