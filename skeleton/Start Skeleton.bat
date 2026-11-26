@echo off
title Skeleton host
cd /d "%~dp0"
node server.js %*
pause
