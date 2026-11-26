@echo off
title Sponge git sync
rem Pulls the latest from GitHub (rebasing local commits on top), then pushes main.
rem Uses this PC's own git sign-in. Writes git-sync.log and git-sync.exit.txt for Claude to read.
cd /d "%~dp0"
> git-sync.log echo ===== %DATE% %TIME% =====
git pull --rebase --autostash origin main >> git-sync.log 2>&1
set PULL=%ERRORLEVEL%
if not "%PULL%"=="0" (
  >git-sync.exit.txt echo %DATE% %TIME% pull failed %PULL%
  goto :eof
)
git push origin main >> git-sync.log 2>&1
set PUSH=%ERRORLEVEL%
git log --oneline -3 >> git-sync.log 2>&1
>git-sync.exit.txt echo %DATE% %TIME% push exit code %PUSH%
