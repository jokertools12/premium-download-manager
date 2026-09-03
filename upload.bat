@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Premium Download Manager — Release & Deploy Hub
cd /d "%~dp0"

:: تفعيل دعم ألوان ANSI المتقدمة في موجه الأوامر
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: تشغيل سكربت النشر الذكي المطور
node scripts\release-all.js %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ فشلت العملية. اضغط أي مفتاح للإغلاق...
    pause >nul
    exit /b %ERRORLEVEL%
)

echo.
echo اضغط أي مفتاح للخروج...
pause >nul