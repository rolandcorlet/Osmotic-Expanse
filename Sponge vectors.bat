@echo off
title Sponge bench - Ninth Shift x3, then Long Swallow x3
rem The AI the bench plays with: your local model, whatever the Director tab is set to (Roly, 27 Nov:
rem the Long Swallow bench fell back to Gemini and hit its spending cap). Leave BENCH_PROVIDER empty to
rem use the Director tab's choice instead.
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set AIARGS=
if not "%BENCH_PROVIDER%"=="" set AIARGS=--provider %BENCH_PROVIDER%
if not "%BENCH_MODEL%"=="" set AIARGS=%AIARGS% --model %BENCH_MODEL%
cd /d "%~dp0v3\director"
node tools\bench.mjs %AIARGS% --vector ninth-shift --players 4 --sites 2 --runs 3 --log bench-ninth-3.log
node tools\bench.mjs %AIARGS% --vector long-swallow --players 4 --sites 2 --runs 3 --log bench-swallow-3.log
echo.
echo Done.
