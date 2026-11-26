@echo off
title Skeleton bench - Gull Rock (percentile horror)
rem The checks that need no model (tools\preflight.mjs), then a script written from The Gull Rock Light,
rem played once by the AI chosen on the AI tab (saves\director.json), with its log, status, exit and calls files.
cd /d "%~dp0skeleton"
echo ===== Preflight (no model) =====
node tools\preflight.mjs --module gull-rock > preflight-gull-rock.log 2>&1
set PRE=%ERRORLEVEL%
>preflight-gull-rock.exit.txt echo %DATE% %TIME% exit code %PRE%
if not "%PRE%"=="0" (
  echo The preflight failed: see skeleton\preflight-gull-rock.log.
  pause
  goto :eof
)
echo Preflight passed.
echo.
echo ===== The Gull Rock Light, 1 run =====
node tools\bench.mjs --module gull-rock --runs 1 --log bench-gull-rock.log
set CODE=%ERRORLEVEL%
>bench-gull-rock.exit.txt echo %DATE% %TIME% exit code %CODE%
echo Done.
