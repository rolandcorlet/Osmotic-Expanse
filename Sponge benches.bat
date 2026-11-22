@echo off
title Sponge benches - Osmotic x3, then D^&D part 2 x10
cd /d "%~dp0v3\director"
node tools\bench.mjs --runs 3 --log bench-osmotic-3.log
cd /d "%~dp0dnd\director"
node tools\bench.mjs --part 2 --runs 10 --log bench-part2-10.log
echo.
echo Done. Sponge reads the two logs from here.
