# 📘 دليل المطور — رفع التحديثات إلى GitHub

> **مهم**: قبل نشر أي تحديث، تأكد من وجود رمز الوصول (GitHub Token) صالح.

---

## ⚡ الطريقة الأسرع (نقرة واحدة) — الموصى بها

**انقر نقراً مزدوجاً على `upload.bat` في مجلد المشروع.**

سيطلب منك رقم الإصدار الجديد (مثال `1.0.3`) ثم يقوم تلقائياً بكل شيء:
بناء EXE → رفع الكود → رفع الوسم → إنشاء Release → رفع الملفات الثلاثة.

أو من الطرفية:
```bash
node scripts/release-all.js 1.0.3
```

**بعد الاكتمال**: كل المستخدمين المثبّتين يستلمون التحديث تلقائياً عند فتح البرنامج.

> 🔑 أول مرة فقط: إذا انبثقت نافذة تسجيل دخول GitHub فسجّل دخولك — تُحفظ وتعمل تلقائياً بعدها.

---

## 🚀 رفع تحديث جديد (3 خطوات فقط)

### الخطوة 1: احفظ تعديلاتك محلياً
```bash
git add -A
git commit -m "وصف التحديث بإيجاز"
```

### الخطوة 2: ارفع الكود إلى GitHub
```bash
git push origin main
```

### الخطوة 3: أنشئ إصداراً جديداً (Release) مع ملف EXE
```bash
# أ) ارفع رقم الإصدار (patch = 1.0.0 → 1.0.1)
npm version patch

# ب) ارفع الوسم الجديد لـ GitHub
git push --follow-tags

# ج) ابنِ ملف التثبيت EXE
npm run dist
```

> بعد الـ `npm run dist`، ستجد في مجلد `dist/`:
> - `PremiumDM-Setup-1.0.1.exe` ← ملف التثبيت
> - `latest.yml` + `.blockmap` ← ضروريان للتحديث التلقائي

### الخطوة 4: انشر الإصدار على GitHub

1. افتح مستودعك على GitHub
2. اضغط **Releases** → **Create a new release**
3. اختر الوسم الجديد (v1.0.1)
4. العنوان: `v1.0.1 — وصف التحديث`
5. أرفق الملفات:
   - `dist/PremiumDM-Setup-1.0.1.exe`
   - `dist/latest.yml`
   - `dist/PremiumDM-Setup-1.0.1.exe.blockmap`
6. اضغط **Publish release**

✅ **النتيجة**: كل مستخدم لديه البرنامج مثبتاً سي_receive إشعار تحديث تلقائياً!

---

## 📋 ملخص أوامر Git الأساسية

| الأمر | الوظيفة |
|---|---|
| `git status` | عرض الملفات المعدلة |
| `git add -A` | إضافة كل التغييرات |
| `git commit -m "رسالة"` | حفظ التغييرات محلياً |
| `git push origin main` | رفع التغييرات إلى GitHub |
| `git log --oneline -5` | عرض آخر 5 عمليات |
| `git pull origin main` | جلب آخر تغييرات من GitHub |

---

## 🔢 إدارة أرقام الإصدار

| النوع | الأمر | مثال |
|---|---|---|
| إصدار بسيط (bug fix) | `npm version patch` | 1.0.0 → 1.0.1 |
| ميزة جديدة | `npm version minor` | 1.0.0 → 1.1.0 |
| تغيير كبير | `npm version major` | 1.0.0 → 2.0.0 |

---

## ⚠️ ملاحظات مهمة

1. **لا تنسَ** رفع الوسم بعد تغيير الإصدار: `git push --follow-tags`
2. **ملفات التحديث التلقائي** (`latest.yml` + `.blockmap`) يجب رفمعها مع كل إصدار
3. **أول تثبيت** للمستخدمين الجدد: ينزلون الـ EXE يدوياً — **كل التحديثات بعدها تلقائية**
4. **بدون توقيع رقمي**: سيظهر تحذير SmartScreen — طبيعي، المستخدم يضغط "Run anyway"

---

## 🔧 حل مشاكل شائعة

### فشل البناء بسبب Python
إذا ظهر خطأ `Could not find any Python installation`:
- تأكد من أن `npmRebuild: false` و `nodeGypRebuild: false` موجودان في `package.json` تحت `build`
- أو ثبّت Python 3.x وأضفه للمسار

### فشل الرفع بسبب المصادقة
```bash
# استخدم رمز الوصول بدلاً من كلمة المرور
git remote set-url origin https://jokertools12:YOUR_TOKEN@github.com/jokertools12/premium-download-manager.git
```

### ملفات كبيرة الحجم
إذا تجاوز حجم الـ EXE 100MB، تأكد من تنظيف مجلد dist قبل البناء:
```bash
Remove-Item dist -Recurse -Force
npm run dist
```

# 🔄 دليل رفع التحديثات — Premium Download Manager

> دليل سريع خطوة بخطوة لرفع أي تحديث جديد للمشروع إلى GitHub وإصداره للمستخدمين.
> (الشرح التفصيلي الكامل موجود في `DEVELOPER.md`)

---

## 📌 الحالة الحالية (تُنفذ مرة واحدة فقط — تم ✓)

- ✅ المستودع المحلي مهيأ ومرتبط بـ:
  `https://github.com/jokertools12/premium-download-manager`
- ✅ الفرع: `main`
- ✅ إعدادات النشر في `package.json` مضبوطة (provider: github, owner: jokertools12)

---

## 🚀 رفع أي تحديث جديد — 4 خطوات فقط

### الخطوة 1: احفظ تغييراتك وارفعها للكود
```powershell
git add -A
git commit -m "وصف التحديث: مثال - إضافة ميزة كذا"
git push
```

### الخطوة 2: ارفع رقم الإصدار
```powershell
npm version patch     # إصلاحات صغيرة:  1.0.0 → 1.0.1
npm version minor     # ميزة جديدة:      1.0.0 → 1.1.0
npm version major     # تغيير كبير:      1.0.0 → 2.0.0
```

### الخطوة 3: ابنِ نسخة exe
```powershell
npm run dist
```
ستجد الملفات في مجلد `dist\`:
| الملف | الاستخدام |
|---|---|
| `PremiumDM-Setup-x.x.x.exe` | ملف التثبيت — **ارفعه دائماً** |
| `latest.yml` | ⚠️ **ضروري للتحديث التلقائي** — ارفعه دائماً |
| `latest.yml.blockmap` | تحديثات تفاضلية سريعة — ارفعه دائماً |

### الخطوة 4: ارفع ملفات الإصدار إلى GitHub Releases
1. افتح صفحة المستودع → **Releases** → **Draft a new release**
2. **Choose a tag**: اكتب `v1.0.1` (نفس رقم الإصدار) → **Create new tag**
3. عنوان الإصدار: مثال `Premium DM v1.0.1`
4. الوصف: اكتب ما الجديد
5. **Attach files**: اسحب الملفات الثلاثة من `dist\` (exe + yml + blockmap)
6. اضغط **Publish release** 🎉

**من هذه اللحظة**: كل مستخدم لديه النسخة المثبتة سيستلم التحديث تلقائياً عند فتح البرنامج.

---

## ⚡ الطريق السريع (أمر واحد لكل شيء)

بعد ضبط الرمز مرة واحدة، هذا الأمر يفعل: رفع الإصدار + تنظيف + اختبار + بناء + نشر تلقائي:
```powershell
$env:GH_TOKEN = "ghp_رمزك"
node scripts/release.js --publish
```
ثم فقط: راجع المسودة في Releases → اكتب الوصف → Publish.

---

## 🔑 ضبط رمز GitHub (مرة واحدة — أعده عند انتهاء صلاحيته)

1. GitHub → صورة الحساب → **Settings** → **Developer settings**
2. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
3. الاسم: `pdm-release` — الصلاحية: ✅ **repo**
4. **Generate** → انسخ الرمز فوراً
5. استخدمه:
```powershell
$env:GH_TOKEN = "ghp_الرمز"          # جلسة PowerShell الحالية
node scripts/release.js --publish
```
> للتخزين الدائم: `git config --global credential.helper manager` ثم عند أول push سيحفظ المتصفح بياناتك.

---

## 📥 رفع المشروع من جهاز جديد (استنساخ)

```powershell
git clone https://github.com/jokertools12/premium-download-manager.git
cd premium-download-manager
npm install
npm start
```

---

## 🧹 التنظيف قبل/بعد البناء

```powershell
npm run clean      # يمسح dist + الملفات المؤقتة (لا يمس بيانات المستخدم)
```

---

## ⚠️ ملاحظات مهمة

1. **ملفات الإصدار الثلاثة يجب رفعها معاً** (exe + latest.yml + blockmap) — نقص latest.yml = التحديث التلقائي معطل عند المستخدمين
2. **SmartScreen**: عند أول تثبيت قد يظهر تحذير "Windows protected your PC" → المستخدم يضغط **More info → Run anyway** (طبيعي بدون توقيع رقمي)
3. **أرقام الإصدارات يجب أن تتزايد دائماً** — لا تنشر نفس الرقم مرتين
4. **تحديثات الإضافة (المتصفح)**: تُحدَّث تلقائياً مع كل تحديث للبرنامج (مرفقة داخل ملفات التثبيت) — المستخدم يعيد تشغيل المتصفح فقط
5. لا ترفع مجلد `node_modules` أبداً — `.gitignore` يمنعه تلقائياً
