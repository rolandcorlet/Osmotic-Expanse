@echo off
title Sponge bench - D^&D part 2 x2
cd /d "%~dp0dnd\director"
node tools\bench.mjs --part 2 --runs 2 --log bench-part2-2.log
echo.
echo Done.
