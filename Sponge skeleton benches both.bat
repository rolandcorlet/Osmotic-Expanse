@echo off
title Sponge bench - the Skeleton: Gull Rock, then Saltglass
rem The checks that need no model, then one run of each module's adventure on the AI chosen on the AI tab.
cd /d "%~dp0skeleton"
node tools\preflight.mjs --module gull-rock > preflight-gull-rock.log 2>&1
node tools\bench.mjs --module gull-rock --runs 1 --log bench-gull-rock.log
>bench-gull-rock.exit.txt echo %DATE% %TIME% exit code %ERRORLEVEL%
node tools\preflight.mjs > preflight.log 2>&1
node tools\bench.mjs --runs 1 --log bench.log
>bench.exit.txt echo %DATE% %TIME% exit code %ERRORLEVEL%
echo Done.
