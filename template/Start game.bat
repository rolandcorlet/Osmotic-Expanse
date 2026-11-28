@echo off
title AI Director host
cd /d "%~dp0"
node server.js %*
pause
