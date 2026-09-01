@echo off
chcp 65001 >nul
title Premium DM — أداة رفع التحديث إلى GitHub
cd /d "%~dp0"
cls
echo ════════════════════════════════════════════
echo    Premium Download Manager — رفع التحديث
echo ════════════════════════════════════════════
echo.
echo  سيرفع السكربت تلقائياً: الكود + ملف EXE + التحديث التلقائي
echo.
set /p NEWVER=  اكتب رقم الإصدار الجديد (مثال: 1.0.3) أو Enter لاستخدام الحالي: 
echo.
echo  جاري التنفيذ — قد يستغرق بضع دقائق (بناء + رفع 85MB)...
echo.
node scripts\release-all.js %NEWVER%
echo.
echo ════════════════════════════════════════════
pause