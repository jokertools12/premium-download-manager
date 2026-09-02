# ✍️ التوثيق الرقمي (Code Signing) — v2.0

## لماذا؟
بدون توثيق، يعرض Windows SmartScreen تحذيراً عند تشغيل المثبّت. التوثيق بإصدار **EV (Extended Validation)** يزيل التحذير فوراً ويبني الثقة.

## المتطلبات
1. **شهادة EV Code Signing** من جهة مثل: Sectigo، DigiCert، SSL.com (تكلفة سنوية، تتطلب كياناً تجارياً مسجلاً + توكن عتادي أو سحابي)
2. GitHub Actions Secrets:
   - `CSC_LINK` — مسار الشهادة (`.pfx` بترميز base64) أو رابط الخدمة السحابية
   - `CSC_KEY_PASSWORD` — كلمة سر الشهادة

## التفعيل في CI
أضف للخطوة "Build Windows packages" في `.github/workflows/ci.yml`:
```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```
electron-builder سيوثّق تلقائياً عند وجود هذه المتغيرات — لا تعديل في الكود مطلوب.

## التحقق محلياً
```powershell
# بعد البناء:
Get-AuthenticodeSignature "build-out\PremiumDM-Setup-2.0.0.exe" | Format-List
```

## بديل مجاني مؤقت
لا يوجد بديل مجاني يزيل تحذير SmartScreen، لكن:
- **بعد تراكم عدد التحميلات + سمة السمعة** يخف التحذير تدريجياً مع Microsoft
- نشر عبر Microsoft Store (MSIX) يتطلب شهادتهم الخاصة لكنه يزيل المشكلة نهائياً
