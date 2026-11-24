@echo off
rem Sponge bench on an alternative AI server (for example Ollama, LM Studio or llama.cpp).
rem Edit the three settings below, save, then double-click this file.
rem   ALT_PROVIDER  ollama, or custom for any OpenAI-compatible server
rem   ALT_URL       server address; leave blank for Ollama's default (http://localhost:11434)
rem                 custom servers usually end in /v1, e.g. http://127.0.0.1:1234/v1
rem   ALT_MODEL     model name exactly as the server lists it (Ollama: run "ollama list")
set ALT_PROVIDER=ollama
set ALT_URL=
set ALT_MODEL=
title Sponge bench - alternative server
cd /d "%~dp0dnd\director"
if "%ALT_MODEL%"=="" (
  echo Set ALT_MODEL at the top of this file first.
  pause
  exit /b 1
)
set URLARG=
if not "%ALT_URL%"=="" set URLARG=--url %ALT_URL%
echo Running the bench on %ALT_PROVIDER% with model %ALT_MODEL%...
node tools\bench.mjs --provider %ALT_PROVIDER% %URLARG% --model %ALT_MODEL% --part 4 --runs 3 --log bench-alt-part4.log
echo.
echo Done. Log: dnd\director\bench-alt-part4.log
pause
