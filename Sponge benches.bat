@echo off
title Sponge benches - Osmotic x3, then D^&D part 2 x10
rem The AI the bench plays with: your local model, whatever the Director tab is set to (Roly, 27 Nov:
rem the Long Swallow bench fell back to Gemini and hit its spending cap). Leave BENCH_PROVIDER empty to
rem use the Director tab's choice instead.
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set AIARGS=
if not "%BENCH_PROVIDER%"=="" set AIARGS=--provider %BENCH_PROVIDER%
if not "%BENCH_MODEL%"=="" set AIARGS=%AIARGS% --model %BENCH_MODEL%
cd /d "%~dp0v3\director"
node tools\bench.mjs %AIARGS% --runs 3 --log bench-osmotic-3.log
cd /d "%~dp0dnd\director"
node tools\bench.mjs %AIARGS% --part 2 --runs 10 --log bench-part2-10.log
echo.
echo Done. Sponge reads the two logs from here.
