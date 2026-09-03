# 🔐 دليل أتمتة التوقيع الرقمي و Notarization (المرحلة 7.4)

يوضح هذا الدليل كيفية تأمين حزم التثبيت الخاصة بـ **Premium Download Manager** وتوقيعها رقمياً لتجنب تحذيرات SmartScreen على ويندوز ومنع حظر Gatekeeper على macOS.

---

## 1. التوقيع على ويندوز عبر SignPath Foundation (مجاني للمشاريع مفتوحة المصدر)

- **البرنامج**: [SignPath Foundation](https://about.signpath.io/) يقدم شهادات توقيع مجانية (OV Code Signing) لمشاريع المصادر المفتوحة المؤهلة.
- **التكامل**: مدمج مباشرة عبر GitHub Actions في [.github/workflows/signpath.yml](file:///.github/workflows/signpath.yml).
- **المتغيرات المطلوبة في GitHub Secrets**:
  - `SIGNPATH_API_TOKEN`
  - `SIGNPATH_ORGANIZATION_ID`
- **سلوك SmartScreen**:
  - شهادة OV المجانية تبني ثقة SmartScreen تدريجياً استناداً إلى عدد مرات التنزيل وشهرة التطبيق مع الوقت، وهي الموازنة المثالية لمشروع مجاني 100% بدون تكاليف شراء شهادة EV سنوية باهظة.

---

## 2. توثيق أبل الرسمي (macOS Notarization)

- تتطلب أبل توثيق أي تطبيق يُوزع خارج متجر Mac App Store باستخدام أداة `notarytool`.
- تم دمج الخطوات التالية في سير العمل:
  ```bash
  xcrun notarytool submit dist/*.dmg --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  xcrun stapler staple dist/*.dmg
  ```
- هذا يضمن فتح التطبيق مباشرة على macOS Catalina وما بعدها دون تحذير "ملف تالف" أو رفض التشغيل.

---

## 3. الفحص المحلي

للتحقق من سلامة وصحة التوقيع الرقمي محلياً أو بعد البناء:
```bash
node scripts/verify-signing.js
```
