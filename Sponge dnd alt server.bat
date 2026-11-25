@echo off
rem Sponge bench on an alternative AI server (for example Ollama, LM Studio or llama.cpp).
rem Edit the three settings below, save, then double-click this file.
rem   ALT_PROVIDER  ollama, or custom for any OpenAI-compatible server
rem   ALT_URL       server address; leave blank for Ollama's default (http://localhost:11434)
rem                 custom servers usually end in /v1, e.g. http://127.0.0.1:1234/v1
rem   ALT_MODEL     model name exactly as the server lists it (Ollama: run "ollama list")
set ALT_PROVIDER=custom
set ALT_URL=http://127.0.0.1:47831/v1
set ALT_MODEL=iq3_s
title Sponge bench - alternative server
cd /d "%~dp0dnd\director"
rem A click in this window must not pause it (QuickEdit): switch that off for this window.
powershell -NoProfile -ExecutionPolicy Bypass -File tools\no-quickedit.ps1 >nul 2>nul
if "%ALT_MODEL%"=="" (
  echo Set ALT_MODEL at the top of this file first.
  pause
  exit /b 1
)
set URLARG=
if not "%ALT_URL%"=="" set URLARG=--url %ALT_URL%
echo Stopping any bench that is still running...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*bench.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
del /q bench-alt-part4.exit.txt 2>nul
echo Running the bench on %ALT_PROVIDER% with model %ALT_MODEL%...
node tools\bench.mjs --provider %ALT_PROVIDER% %URLARG% --model %ALT_MODEL% --part 4 --runs 3 --log bench-alt-part4.log
set CODE=%ERRORLEVEL%
>bench-alt-part4.exit.txt echo %DATE% %TIME% exit code %CODE%
echo.
if not "%CODE%"=="0" if not "%CODE%"=="1" (
  echo The bench stopped unexpectedly ^(exit code %CODE%^). Sponge can read the log and the status file.
  pause
)
echo Done. Log: dnd\director\bench-alt-part4.log
