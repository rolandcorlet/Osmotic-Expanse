@echo off
title Sponge bench - Osmotic x3
cd /d "%~dp0v3\director"
node tools\bench.mjs --runs 3 --log bench-osmotic-3.log
echo.
echo Done.
