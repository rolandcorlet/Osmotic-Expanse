@echo off
title Sponge bench - Ice Road Trackers and The Frozen Road again
rem For each campaign converted from the Icewind Dale books (the library on the Books tab): the preflight that
rem needs no GPU, then a script written from the campaign, played twice by the local model, with its log,
rem status, exit and calls files (bench-gen-<id>-2.*). One campaign at a time; a failed preflight skips that one.
set BENCH_PROVIDER=custom
set BENCH_MODEL=iq3_s
set AIARGS=--provider %BENCH_PROVIDER% --model %BENCH_MODEL%
cd /d "%~dp0dnd\director"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\no-quickedit.ps1 >nul 2>nul
for %%A in (ice-road-trackers icewind-dale-the-frozen-road) do call :one %%A
>bench-icewind-retry.exit.txt echo %DATE% %TIME% all done
echo All done.
goto :eof

:one
set ADV=%1
echo.
echo ===== Preflight for %ADV% (no GPU) =====
node tools\preflight.mjs %ADV% > preflight-%ADV%.log 2>&1
set PRE=%ERRORLEVEL%
>preflight-%ADV%.exit.txt echo %DATE% %TIME% exit code %PRE%
if not "%PRE%"=="0" (
  echo The preflight for %ADV% failed: see dnd\director\preflight-%ADV%.log. Skipped.
  goto :eof
)
del /q bench-gen-%ADV%-2.exit.txt 2>nul
echo ===== A script written from %ADV%, 2 runs =====
node tools\bench.mjs %AIARGS% --script gen --adventure %ADV% --runs 2 --log bench-gen-%ADV%-2.log
set CODE=%ERRORLEVEL%
>bench-gen-%ADV%-2.exit.txt echo %DATE% %TIME% exit code %CODE%
goto :eof
