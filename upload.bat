@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Premium Download Manager - Release Hub

node scripts\release-all.js %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Process exited with code %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
pause