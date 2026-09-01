@echo off
chcp 65001 >nul
title Premium DM — رفع التحديث إلى GitHub
cd /d "%~dp0"
cls
echo ════════════════════════════════════════════
echo    Premium Download Manager — رفع التحديث
echo ════════════════════════════════════════════
echo.
echo  سيرفع السكربت تلقائياً:
echo    1) بناء ملف EXE
echo    2) رفع الكود إلى GitHub
echo    3) إنشاء Release + رفع الملفات
echo    4) التحديث التلقائي لكل المستخدمين
echo.
set /p NEWVER=  اكتب رقم الإصدار الجديد (مثال: 1.0.3) أو Enter لاستخدام الحالي: 
echo.
echo  جاري التنفيذ — قد يستغرق بضع دقائق (بناء + رفع 85MB)...
echo  لا تغلق هذه النافذة حتى تنتهي العملية.
echo.
node scripts\release-all.js %NEWVER%
echo.
echo ════════════════════════════════════════════
pause