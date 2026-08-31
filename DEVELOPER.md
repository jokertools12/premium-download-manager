# 🛠️ دليل المطور — Premium Download Manager

> هذا الدليل لك أنت (المطور). يشرح كل شيء: البنية، التشغيل، الاختبار، بناء exe، إصدار تحديثات للمستخدمين، التنظيف، وحل المشاكل.

---

## 📁 1) بنية المشروع

```
PremiumDM/
├── package.json              ⚙️ الإعدادات + الأوامر + إعدادات التحديث (publish)
├── DEVELOPER.md              ← هذا الدليل
├── RELEASE-CHECKLIST.md      ✅ قائمة فحص سريعة قبل كل إصدار
├── scripts/clean.js          🧹 سكربت التنظيف (npm run clean)
│
├── src/
│   ├── main/                 🧠 النواة (تعمل في خلفية البرنامج)
│   │   ├── main.js           نقطة البداية: النوافذ، Tray، ربط كل المكونات
│   │   ├── ipc.js            كل أوامر الواجهة (قائمة كاملة بالأوامر هنا)
│   │   ├── icon.js           مولّد أيقونة PNG برمجياً
│   │   ├── updater.js        🔄 نظام التحديث التلقائي
│   │   ├── db/database.js    💾 التخزين (SQLite عند توفره وإلا JSON تلقائياً)
│   │   ├── engine/
│   │   │   ├── DownloadEngine.js   إدارة المهام + الطابور + الأولويات
│   │   │   ├── DownloadTask.js     ⚡ قلب التحميل: 32 اتصالاً + استئناف + Mirrors
│   │   │   └── SpeedLimiter.js     محدد السرعة (Token Bucket)
│   │   ├── queue/QueueManager.js   الجدولة الزمنية
│   │   ├── stats/Statistics.js     الإحصائيات اليومية
│   │   └── integrations/
│   │       ├── VideoManager.js     🎬 الفيديو (yt-dlp) + قوائم التشغيل + M3U8
│   │       ├── TorrentManager.js   🧲 التورنت (WebTorrent)
│   │       ├── ClipboardMonitor.js مراقبة الحافظة
│   │       ├── LocalServer.js      خادم محلي:45762 يستقبل روابط المتصفح
│   │       └── native-host.js      جسر Native Messaging
│   ├── preload.js            🔒 الجسر الآمن بين النواة والواجهة
│   ├── renderer/             🎨 الواجهة
│   │   ├── index.html        الصفحة الرئيسية (مترجمة عبر data-i18n)
│   │   ├── app.js            منطق الواجهة
│   │   ├── i18n.js           🌍 الترجمات (جدول STR[key] = [عربي, English, Türkçe])
│   │   ├── styles.css        التصميم
│   │   └── float.*           النافذة العائمة (html/css/js)
│   └── extension/            🌐 إضافة المتصفح + install.bat
├── test/                     🧪 ملفات الاختبار (كل ملف مستقل)
└── dist/                     📦 مخرجات البناء (تنشأ بعد npm run dist)
```

**بيانات المستخدم** (منفصلة تماماً عن المشروع):
`%APPDATA%\PremiumDownloadManager\` — قاعدة البيانات، الإعدادات، أدوات yt-dlp/ffmpeg

---

## 🖥️ 2) التطوير والتشغيل

```bash
npm install        # أول مرة فقط
npm start          # تشغيل البرنامج للتطوير
```

- أي تعديل في `src/` يتطلب إعادة تشغيل (Ctrl+C ثم npm start)
- أدوات yt-dlp/ffmpeg تُنزّل تلقائياً إلى `%APPDATA%\PremiumDownloadManager\bin`
- ⚠️ عداد السرعة يعمل حياً بفضل `patchTaskCard` — لا تستخدم إعادة بناء القائمة في أحداث التقدم

---

## 🧪 3) الاختبارات

| الملف | ماذا يختبر | إنترنت |
|---|---|---|
| `test/engine-test.js` | تحميل متعدد الاتصالات + إيقاف/استئناف | ✅ |
| `test/limiter-test.js` | محدد السرعة (1MB بحد 200KB/s = ~5 ثوانٍ) | ✅ |
| `test/integration-test.js` | محاكاة إضافة المتصفح (POST للخادم المحلي) | ✅ |
| `test/queue-test.js` | أولويات الطابور ▲▼⚡ | ❌ |
| `test/phase2-test.js` | القواعد التلقائية + الاستيراد الجماعي | ❌ |
| `test/phase3-test.js` | yt-dlp + فيديو + M3U8 + ffmpeg | ✅ |
| `test/phase4-test.js` | Mirrors + التورنت + i18n | ✅ |
| `test/cdp-freeze-test.js` | فحص حي للواجهة (شريط التقدم + الاستجابة) | ✅ |

```bash
node test/اسم-الملف.js
```

**فحص الواجهة حياً**: شغّل البرنامج بـ `--remote-debugging-port=9222` ثم `node test/cdp-freeze-test.js`

---

## 📦 4) بناء نسخة exe

```bash
npm run dist
```

الناتج في مجلد `dist/`:
- `PremiumDM-Setup-1.0.0.exe` ← ملف التثبيت للمستخدمين
- `latest.yml` ← ⚠️ **ضروري للتحديث التلقائي** (ارفعه دائماً مع الإصدار)
- `.blockmap` ← يتيح تحديثات تفاضلية سريعة (ارفعه أيضاً)

**قبل البناء الأول**: افتح `package.json` وعدّل `publish.owner` إلى اسم مستخدم GitHub الخاص بك.

---

## 🔄 5) نظام التحديث التلقائي (الأهم)

### كيف يعمل عند المستخدم؟
1. النسخة المثبتة تفحص تلقائياً عند التشغيل + كل 6 ساعات
2. عند وجود إصدار أحدث: **شريط ذهبي** أعلى البرنامج + تنزيل تلقائي بنسبة تقدم
3. عند الاكتمال: زر **"🔄 تثبيت وإعادة تشغيل"** → يثبت ويعيد التشغيل في ثوانٍ
4. فحص يدوي أيضاً: **⚙️ الإعدادات → 🔄 التحقق من التحديثات**
5. في وضع التطوير (`npm start`) لا يفحص — يوضح أن التحديث للنسخة المثبتة

### مصدر التحديث — خياران:

**الخيار أ: GitHub Releases (موصى به، مجاني)**
1. أنشئ مستودعاً باسم `premium-download-manager` على GitHub
2. في `package.json` عدّل `publish.owner` إلى حسابك
3. أنشئ Token: GitHub → Settings → Developer settings → Tokens (صلاحية `repo`)
4. عند الإصدار: `set GH_TOKEN=رمزك` ثم `npm run release`

**الخيار ب: خادم خاص (أي استضافة)**
```json
"publish": { "provider": "generic", "url": "https://موقعك.com/updates" }
```
ارفع ملفات `dist` (exe + latest.yml + blockmap) إلى الرابط.

### 🚀 خطوات إصدار نسخة جديدة (سير العمل)

```bash
# 1) ارفع رقم الإصدار
npm version patch        # إصلاح: 1.0.0→1.0.1 (minor=ميزة، major=كبير)

# 2) نظّف البناء القديم
npm run clean

# 3) اختبر
npm start                # جرّب يدوياً
node test/engine-test.js # الاختبارات الأساسية

# 4) ابنِ وانشر (يتطلب GH_TOKEN لخيار GitHub)
set GH_TOKEN=ghp_xxxxxxxx
npm run release          # يبني وينشر مسودة Release

# 5) GitHub → Releases → راجع المسودة → اكتب ملاحظات الإصدار → Publish
```

**من هذه اللحظة**: كل مستخدم مثبّت يستلم التحديث تلقائياً عند فتح البرنامج.

### ⚙️ تفاصيل تقنية
- electron-updater يقارن `latest.yml` بالإصدار المحلي
- `.blockmap` = تنزيل الفروق فقط (تحديثات سريعة)
- التثبيت عبر NSIS quitAndInstall
- خادم مؤقت للتطوير: `set PDM_UPDATE_URL=https://...` ثم شغّل النسخة المثبتة

---

## 🧹 6) التنظيف

```bash
npm run clean
```
يمسح: `dist/` + `crash-test/` + كاش البناء — **لا يمس بيانات المستخدم إطلاقاً**.

**تصفير بياناتك المحلية للاختبار** (⚠️ يمسح إعداداتك وسجلك):
```powershell
Get-Process electron | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\PremiumDownloadManager\*" -Recurse -Force
```
(ملفات `*.migrated` هي نسخة أمان من ترحيل SQLite — احتفظ بها)

---

## 💾 7) تفعيل SQLite في النسخة المثبتة

الوضع الحالي: JSON تلقائياً في Electron (أمان كامل). لتفعيل SQLite:
```bash
npm install @electron/rebuild --save-dev
npx electron-rebuild -f -w better-sqlite3
echo ok > "%APPDATA%\PremiumDownloadManager\sqlite-electron-ok"
```
عند أي فشل → JSON تلقائياً بدون فقدان بيانات.

---

## 🌍 8) إضافة لغة جديدة

1. في `src/renderer/i18n.js`: أضف عنصراً رابعاً لكل مفتاح في جدول `STR`:
   `'key': ['عربي', 'English', 'Türkçe', 'الجديدة'],`
2. أضف `fr: {}` لكائن `I18N` وأضف `I18N.fr[k] = v[3]` في حلقة التعبئة
3. أضف `<option value="fr">` في `index.html` (قائمة اللغة)

---

## 🚨 9) استكشاف الأخطاء (مشاكل واجهتنا فعلاً)

| المشكلة | الحل |
|---|---|
| `npm install` يفشل بـ ps1 | استخدم `npm.cmd install` (سياسة PowerShell) |
| البرنامج ينهار فور الإقلاع بـ crashpad | احذف الكاش: `Remove-Item "$env:APPDATA\premium-download-manager\GPUCache" -Recurse -Force` |
| `require('webtorrent')` يفشل | طبيعي — وحدة ESM، الكود يستخدم `import()` ديناميكي |
| better-sqlite3 يسبب انهيار في Electron | ABI مختلف — راجع قسم 7 |
| ملف 10Mb.dat = 1.25MB فقط | proof.ovh بالميغابت — استخدم 100Mb.dat للاختبار الطويل |
| شريط التقدم يتجمد | استخدم `patchTaskCard` — ممنوع إعادة بناء `#list` في أحداث التقدم |
| أزرار لا تعمل | تأكد من إضافة case في `ipc.js` + البحث في المديرين الثلاثة (engine/video/torrent) |

---

## ✅ 10) قواعد ذهبية عند أي تعديل

1. **زر جديد**: `data-act` في الواجهة → عالجه في `wireEvents` + case في `ipc.js` + مفاتيح i18n الثلاث
2. **نص جديد**: أضفه لجدول `STR` (الثلاث لغات معاً) واستخدم `data-i18n` أو `window.t()`
3. **تحديث حي**: استخدم `patchTaskCard` — ممنوع إعادة بناء `#list` في أحداث التقدم
4. **حدث جديد للنواة**: أرسله لكل من `win` و `floatWin`
5. **حقل بيانات جديد**: يجب أن يمر عبر `snapshot()` ليُحفظ
6. بعد كل تعديل: `node --check الملف.js` + اختبار واحد على الأقل

---

## 📋 11) قائمة فحص الإصدار السريع

راجع `RELEASE-CHECKLIST.md` قبل كل إصدار — فيها الخطوات مرتبة بالترتيب.

---

## 🐙 12) رفع المشروع إلى GitHub خطوة بخطوة (من الصفر)

### الخطوة 1: إنشاء المستودع على الموقع (مرة واحدة)
1. سجّل دخول إلى github.com
2. اضغط **+** أعلى اليمين → **New repository**
3. الاسم: `premium-download-manager`
4. اختر **Private** أو **Public** (البرنامج يعمل مع الاثنين)
5. **لا تختر** أي من خيارات README / .gitignore / license (لأن المشروع موجود عندك)
6. **Create repository**

### الخطوة 2: ربط المشروع المحلي بـ Git (مرة واحدة، من مجلد المشروع)
```powershell
# إعداد هويتك (مرة واحدة على الجهاز)
git config --global user.name "اسمك"
git config --global user.email "بريدك@example.com"

# تهيئة المستودع المحلي وربطه
git init
git add -A
git commit -m "الإصدار الأول: Premium Download Manager v1.0.0"
git branch -M main
git remote add origin https://github.com/اسم-حسابك/premium-download-manager.git
git push -u origin main
```
> عند طلب كلمة المرور: GitHub لم يعد يقبل كلمات المرور — استخدم **Personal Access Token** (الخطوة 3) بدلاً منها، أو **Git Credential Manager** (يأتي مع Git وسيفتح نافذة تسجيل دخول للمتصفح).

### الخطوة 3: إنشاء Personal Access Token (ضروري للنشر)
1. GitHub → الصورة الشخصية → **Settings** → **Developer settings** (آخر الصفحة)
2. **Personal access tokens → Tokens (classic) → Generate new token (classic)**
3. الاسم: `pdm-release` — الصلاحية: **repo** فقط
4. **Generate** → انسخ الرمز `ghp_...` فوراً (لا يُعرض مرة أخرى!)

---

## 🚀 13) دورة إصدار تحديث جديد (بعد أول رفع)

```powershell
# 1) اضبط الرمز مرة واحدة لكل جلسة
$env:GH_TOKEN = "ghp_رمزك"

# 2) سكربت واحد يفعل كل شيء: رفع الإصدار + تنظيف + اختبار + بناء + نشر
node scripts/release.js --publish

# أو بشكل مرحلي (بدون نشر):
node scripts/release.js           # بناء محلي فقط للتجربة
node scripts/release.js --minor   # ميزة جديدة (1.1.0)
node scripts/release.js --major   # إصدار كبير (2.0.0)
```

**بعد اكتمال السكربت**:
1. افتح `github.com/اسمك/premium-download-manager/releases`
2. ستجد **مسودة إصدار (Draft)** جاهزة تحتوي exe + latest.yml + blockmap
3. اكتب ملاحظات الإصدار (ما الجديد) → اضغط **Publish release**

**من هذه اللحظة**: كل مستخدم مثبّت يستلم التحديث تلقائياً عند فتح البرنامج! 🎉

### حفظ تغييرات الكود على GitHub (عادة عمل يومية)
```powershell
git add -A
git commit -m "وصف ما فعلته"
git push
```

---

## 🔧 14) تعديل بيانات المستودع والإعدادات لاحقاً

| ماذا تريد تغييره | أين |
|---|---|
| رقم الإصدار | `package.json` → `"version"` (أو `npm version patch/minor/major`) |
| حساب GitHub المرتبط بالتحديثات | `package.json` → `publish.owner` و `publish.repo` |
| التحويل لخادم خاص | `package.json` → `publish` = `{ "provider": "generic", "url": "https://..." }` |
| اسم البرنامج الظاهر للمستخدم | `package.json` → `build.productName` |
| معرف التطبيق | `package.json` → `build.appId` |
| أيقونة البرنامج | ضع `build/icon.ico` (256×256+) قبل البناء |
| تغيير رابط المستودع بعد نقله | `git remote set-url origin الرابط-الجديد` |
| مراجعة ما تغير | `git log --oneline` و `git diff` |
