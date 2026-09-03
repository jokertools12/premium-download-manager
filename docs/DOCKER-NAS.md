# 🐳 دليل تشغيل Premium Download Manager على الخوادم وأنظمة NAS (المرحلة 16.1)

يتيح وضع **Headless** تشغيل Premium Download Manager كخدمة خلفية على أجهزة التخزين الشبكي (NAS) وسيرفرات Linux و Raspberry Pi دون الحاجة لواجهة رسومية، مع التحكم الكامل عبر المتصفح أو تطبيق الموبايل أو واجهة REST API.

---

## 1. التشغيل السريع عبر Docker Compose

أنشئ مجلداً جديداً وضع بداخله ملف `docker-compose.yml`:

```yaml
version: '3.8'

services:
  premium-dm:
    image: jokertools12/premium-download-manager:latest
    container_name: premium-download-manager
    restart: unless-stopped
    ports:
      - "45762:45762"
    environment:
      - PORT=45762
      - PDM_DOWNLOAD_DIR=/downloads
      - APPDATA=/data
    volumes:
      - /path/to/your/data:/data
      - /path/to/your/downloads:/downloads
```

ثم شغّل الحاوية:
```bash
docker-compose up -d
```

---

## 2. لوحة التحكم والوصول (Web UI & REST API)

- **رابط الواجهة للمتصفح والموبايل**:
  `http://YOUR_SERVER_IP:45762/mobile`
- **واجهة REST API العامة**:
  `http://YOUR_SERVER_IP:45762/api/v1/tasks`
- **فحص سلامة الخدمة (Health Check)**:
  `http://YOUR_SERVER_IP:45762/ping`

---

## 3. التوافق مع أنظمة NAS
- **Synology NAS**: يدعم Container Manager مباشرة مع تعيين مسار التخزين المشترك `/downloads`.
- **QNAP**: متوافق عبر Container Station.
- **TrueNAS SCALE**: يعمل كتطبيق Custom App بسلاسة.
- **Raspberry Pi**: خفيف جداً على المعالج والذاكرة (أقل من 60MB RAM).
