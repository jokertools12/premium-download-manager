@echo off
rem ==== تثبيت جسر Native Messaging لبرنامج Premium Download Manager ====
setlocal
set NAME=com.premiumdm.host
set HERE=%~dp0
set EXT_ID=omiblbfhcglchohlnedfiamiejhgjojh

rem توليد ملفات تعريف المضيف بمسار صحيح
node -e "const fs=require('fs');const p=process.argv[1].replace(/\\/g,'\\\\');const id=process.argv[2];const chrome={name:'com.premiumdm.host',description:'Premium Download Manager Host',path:p+'native-host.bat',type:'stdio',allowed_origins:['chrome-extension://'+id+'/']};fs.writeFileSync(p+'chrome-host.json',JSON.stringify(chrome,null,2));const ff={name:'com.premiumdm.host',description:'Premium Download Manager Host',path:p+'native-host.bat',type:'stdio',allowed_extensions:['premiumdm@premiumdm.org']};fs.writeFileSync(p+'firefox-host.json',JSON.stringify(ff,null,2));" "%HERE%" %EXT_ID%

rem تسجيل المضيف للمتصفحات (بدون صلاحيات مدير)
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%HERE%chrome-host.json" /f
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%HERE%chrome-host.json" /f
reg add "HKCU\Software\Mozilla\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%HERE%firefox-host.json" /f

echo.
echo تم التثبيت بنجاح!
echo الخطوة الأخيرة: افتح chrome://extensions (أو edge://extensions)
echo وفعّل "وضع المطور" ثم "تحميل إضافة غير مضغوطة" واختر مجلد src\extension
echo.
pause
