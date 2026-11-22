@echo off
title Sponge bench - Long Swallow 4 sites x3
cd /d "%~dp0v3\director"
node tools\bench.mjs --vector long-swallow --players 4 --sites 4 --runs 3 --log bench-swallow-deep.log
echo.
echo Done.
