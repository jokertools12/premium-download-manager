; NSIS: تسجيل مضيف Native Messaging لـ Chrome و Edge عند التثبيت
; ومسح المفاتيح عند إزالة البرنامج
; المسارات داخل ملفات JSON يكتبها البرنامج نفسه عند أول تشغيل (بمسارات صحيحة)

!macro customInstall
  ; ملفات التعريف تُكتب بواسطة البرنامج عند أول تشغيل في:
  ; $APPDATA\premium-download-manager\native-host\*.json
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.premiumdm.host" "" "$APPDATA\premium-download-manager\native-host\chrome-host.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.premiumdm.host" "" "$APPDATA\premium-download-manager\native-host\edge-host.json"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.premiumdm.host"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.premiumdm.host"
  DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\com.premiumdm.host"
!macroend
