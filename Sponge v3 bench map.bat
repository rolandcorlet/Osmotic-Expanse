@echo off
title Sponge bench - v3 with the map on: First Carve x2, then Long Swallow x2
rem The v3 Director with the map on (28 Nov: one square is one Drift, bands from the map). Two runs of the
rem First Carve, then two of the Long Swallow (4 players, 4 sites), on the local model, one after the other.
set AIARGS=--provider custom --model iq3_s
cd /d "%~dp0v3\director"
powershell -NoProfile -ExecutionPolicy Bypass -File ..\..\dnd\director\tools\no-quickedit.ps1 >nul 2>nul
node tools\bench.mjs %AIARGS% --runs 2 --log bench-map-first.log
>bench-map-first.exit.txt echo %DATE% %TIME% exit code %ERRORLEVEL%
node tools\bench.mjs %AIARGS% --vector long-swallow --players 4 --sites 4 --runs 2 --log bench-map-swallow.log
>bench-map-swallow.exit.txt echo %DATE% %TIME% exit code %ERRORLEVEL%
echo Done.
