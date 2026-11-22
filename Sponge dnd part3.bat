@echo off
title Sponge bench - D^&D part 3 x3
cd /d "%~dp0dnd\director"
node tools\bench.mjs --part 3 --runs 3 --log bench-part3-3.log
echo.
echo Done.
