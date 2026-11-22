@echo off
title Sponge bench - Ninth Shift x3, then Long Swallow x3
cd /d "%~dp0v3\director"
node tools\bench.mjs --vector ninth-shift --players 4 --sites 2 --runs 3 --log bench-ninth-3.log
node tools\bench.mjs --vector long-swallow --players 4 --sites 2 --runs 3 --log bench-swallow-3.log
echo.
echo Done.
