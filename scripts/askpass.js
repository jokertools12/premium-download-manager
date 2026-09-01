'use strict';
// GIT_ASKPASS: يعيد الرمز من ملف محلي — يستخدمه git تلقائياً عند طلب كلمة المرور
const fs = require('fs');
const os = require('os');
const path = require('path');
try {
  const tok = fs.readFileSync(path.join(os.homedir(), '.pdm-gh-token'), 'utf8').trim();
  if (tok) { process.stdout.write(tok); process.exit(0); }
} catch (_e) {}
process.exit(1);