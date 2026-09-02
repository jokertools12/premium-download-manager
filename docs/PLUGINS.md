# 🧩 نظام الإضافات — Premium Download Manager (v2.0)

نظام إضافات بسيط يتيح توسيع سلوك البرنامج بملف JavaScript واحد — بدون بناء أو تعقيد.

## أين تضع الإضافة؟

| النوع | المجلد |
|---|---|
| مدمجة مع البرنامج | `plugins-builtin/` داخل مجلد التطبيق |
| من المستخدم (موصى به) | `<مجلد بيانات البرنامج>/plugins/` |

مجلد البيانات: ويندوز `%APPDATA%\PremiumDownloadManager\plugins` — ماك `~/Library/Application Support/PremiumDownloadManager/plugins` — لينكس `~/.local/share/PremiumDownloadManager/plugins`

## شكل الإضافة

```js
// <userData>/plugins/my-plugin.js
module.exports = {
  name: 'اسم الإضافة',            // مطلوب
  version: '1.0.0',
  description: 'ماذا تفعل',

  init(ctx) {
    // ctx = واجهة محدودة يمنحها البرنامج
    ctx.log('بدأت العمل');

    // خطافات الأحداث:
    ctx.onTaskCompleted(task => {
      // task = { id, url, filename, filePath, size, ... }
      ctx.log('اكتمل:', task.filename);
    });

    ctx.onTaskFailed(task => { /* ... */ });

    // إضافة تحميل برمجياً:
    // ctx.addDownload('https://example.com/f.zip', { filename: 'f.zip' });

    // قراءة المهام:
    // ctx.getTasks();
  }
};
```

## إدارة الإضافات
من **الإعدادات → 🧩 المكوّنات الإضافية**: فعّل/عطّل أي إضافة. الحالة تُحفظ في `plugins-state.json`.

## ⚠️ تنبيه أمني
الإضافات تعمل بامتيازات كاملة داخل عملية main (كما في معظم التطبيقات). **ثبّت الإضافات من مصادر تثق بها فقط**، وراجع الكود قبل التشغيل.

## أمثلة أفكار
- إشعار Webhook عند اكتمال التحميل (Discord/Telegram)
- نسخ الملفات المكتملة تلقائياً لمجلد آخر
- تصنيف ذكي إضافي حسب قواعدك الخاصة
