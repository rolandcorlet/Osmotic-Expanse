@echo off
rem Sponge alternative server settings. This file no longer runs a bench.
rem Bench X Marks the Spot with these settings using "Sponge dnd bench X Marks.bat" on the PC.
rem   ALT_PROVIDER  ollama, or custom for any OpenAI-compatible server
rem   ALT_URL       server address; leave blank for Ollama's default (http://localhost:11434)
rem                 custom servers usually end in /v1, e.g. http://127.0.0.1:1234/v1
rem   ALT_MODEL     model name exactly as the server lists it (Ollama: run "ollama list")
set ALT_PROVIDER=custom
set ALT_URL=http://127.0.0.1:47831/v1
set ALT_MODEL=iq3_s
title Sponge - alternative server settings
echo Alternative server: %ALT_PROVIDER% at %ALT_URL% with model %ALT_MODEL%.
echo Nothing is run from this file.
pause
