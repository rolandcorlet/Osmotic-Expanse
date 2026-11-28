@echo off
rem Starts the AI Director host with a public link for players anywhere (needs the free cloudflared program:
rem   winget install --id Cloudflare.cloudflared). Anyone outside your network needs the table code; the links carry it.
call "%~dp0Start game.bat" --online
