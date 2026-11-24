@echo off
title Sponge - stop the bench
cd /d "%~dp0"
echo Stopping any bench that is still running...
powershell -NoProfile -Command "$p = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' }); $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; $msg = (Get-Date -Format o) + ' stopped ' + $p.Count + ' bench process(es): ' + (($p | ForEach-Object { $_.ProcessId }) -join ' '); Write-Host $msg; Set-Content -Encoding ascii -Path 'dnd\director\bench-stop.txt' -Value $msg"
timeout /t 5 >nul
