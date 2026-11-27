@echo off
rem Encounters in the Far North, on its own table: a second copy of the D&D AI Director with its own port (8790),
rem its own links and its own saves (saves\far-north), so it can run beside another game. It is the same program,
rem so every fix reaches both. Close this window to stop this table only.
title D^&D - Encounters in the Far North (port 8790)
cd /d "%~dp0"
if not exist "saves\far-north" mkdir "saves\far-north"
rem The first time: the AI choice (Director tab) comes over from the main table. Change it there on the Director tab.
if not exist "saves\far-north\director.json" if exist "saves\director.json" copy /y "saves\director.json" "saves\far-north\director.json" >nul
call "%~dp0Start Director.bat" --port 8790 --saves "saves\far-north" --adventure encounters-in-the-far-north %*
