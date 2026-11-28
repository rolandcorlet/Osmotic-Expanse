@echo off
setlocal EnableDelayedExpansion
title New rule system - a copy of the AI Director template
rem Copies template\ (the blank AI Director, never changed by this) to systems\<name>\ for a new rule system or game.
rem Build and play the game there: Start game.bat, then the Converter tab. The template stays blank for the next one.
cd /d "%~dp0"
if not exist "template\server.js" (
  echo The template folder is missing: template\server.js was not found.
  pause
  goto :eof
)
echo.
echo  A new rule system, copied from the AI Director template.
echo  The template itself is left exactly as it is.
echo.
:ask
set "NAME="
set /p "NAME=Name of the new system (letters, numbers, spaces or dashes): "
if not defined NAME goto :ask
rem Trim spaces at the ends.
for /f "tokens=* delims= " %%A in ("!NAME!") do set "NAME=%%A"
:trim
if "!NAME:~-1!"==" " set "NAME=!NAME:~0,-1!" & goto :trim
echo(!NAME!| findstr /r /c:"^[A-Za-z0-9][A-Za-z0-9 -]*$" >nul
if errorlevel 1 (
  echo   Use only letters, numbers, spaces and dashes, starting with a letter or number.
  goto :ask
)
if exist "systems\!NAME!" (
  echo   systems\!NAME! already exists. Choose another name.
  goto :ask
)
echo.
echo Copying the template to systems\!NAME! ...
robocopy "template" "systems\!NAME!" /E /NFL /NDL /NJH /NJS /NP /XD saves node_modules /XF bench*.log bench*.status.json bench*.exit.txt bench*.calls.jsonl preflight*.log preflight*.exit.txt convert*.log convert*.exit.txt >nul
if errorlevel 8 (
  echo The copy failed ^(robocopy code %ERRORLEVEL%^).
  pause
  goto :eof
)
>"systems\!NAME!\SYSTEM.txt" echo !NAME!: made from the AI Director template on %DATE% %TIME%.
echo.
echo Done: systems\!NAME!
echo  1. In that folder, double-click Start game.bat and open the host address it prints.
echo  2. Choose the AI on the AI tab, then make the game on the Converter tab.
echo  3. Check the module on the Game tab, and read its advice.
echo.
start "" explorer "systems\!NAME!"
pause
