@echo off
rem Builds your private book library from the .txt books in library\books (Player's Handbook,
rem Monster Manual, Dungeon Master's Guide, the spell list and the character generator).
rem The library stays on this computer: git ignores the library folder.
title D^&D AI Director - import my books
cd /d "%~dp0"
if not exist library\books mkdir library\books
node tools\import-books.mjs
echo.
pause
