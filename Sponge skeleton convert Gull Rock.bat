@echo off
title Sponge skeleton convert - Gull Rock (percentile horror)
cd /d "%~dp0skeleton"
powershell -NoProfile -ExecutionPolicy Bypass -File ..\dnd\director\tools\no-quickedit.ps1 >nul 2>nul
del /q convert-gullrock.exit.txt 2>nul
node tools\convert.mjs --mode invent --dice percentile --name "Gull Rock" --ideas-file tools\ideas-gullrock.txt > convert-gullrock.log 2>&1
set CODE=%ERRORLEVEL%
>convert-gullrock.exit.txt echo %DATE% %TIME% exit code %CODE%
type convert-gullrock.log
echo Done.
