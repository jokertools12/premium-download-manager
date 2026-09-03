'use strict';

/**
 * ⚡ Premium Download Manager — Automated Multi-File Version Synchronization
 * تقوم هذه الدالة بتحديث رقم الإصدار تلقائياً وبشكل متناسق في كل ملفات المشروع:
 * 1) package.json
 * 2) src/extension/manifest.json
 * 3) src/extension/background.js
 * 4) src/renderer/index.html
 * 5) src/main/integrations/LocalServer.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function syncAllVersions(targetVersion) {
  if (!targetVersion) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    targetVersion = pkg.version;
  }
  targetVersion = String(targetVersion).trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+/.test(targetVersion)) {
    throw new Error(`رقم الإصدار غير صالح (${targetVersion}). يجب أن يكون بصيغة مثل: 4.3.0 أو 4.3.1`);
  }

  const updatedFiles = [];

  // 1. package.json
  const pkgPath = path.join(ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version !== targetVersion) {
      pkg.version = targetVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      updatedFiles.push('package.json');
    }
  }

  // 2. src/extension/manifest.json
  const manifestPath = path.join(ROOT, 'src', 'extension', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== targetVersion) {
      manifest.version = targetVersion;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      updatedFiles.push('src/extension/manifest.json');
    }
  }

  // 3. src/extension/background.js
  const bgPath = path.join(ROOT, 'src', 'extension', 'background.js');
  if (fs.existsSync(bgPath)) {
    const bg = fs.readFileSync(bgPath, 'utf8');
    const newBg = bg.replace(/\/\*\s*Premium DM Extension v[^\s—]+/i, `/* Premium DM Extension v${targetVersion}`);
    if (newBg !== bg) {
      fs.writeFileSync(bgPath, newBg, 'utf8');
      updatedFiles.push('src/extension/background.js');
    }
  }

  // 4. src/renderer/index.html
  const htmlPath = path.join(ROOT, 'src', 'renderer', 'index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const newHtml = html.replace(/<span class="v-tag">v[^<]+<\/span>/i, `<span class="v-tag">v${targetVersion}</span>`);
    if (newHtml !== html) {
      fs.writeFileSync(htmlPath, newHtml, 'utf8');
      updatedFiles.push('src/renderer/index.html');
    }
  }

  // 5. src/main/integrations/LocalServer.js
  const serverPath = path.join(ROOT, 'src', 'main', 'integrations', 'LocalServer.js');
  if (fs.existsSync(serverPath)) {
    const server = fs.readFileSync(serverPath, 'utf8');
    const newServer = server.replace(/version:\s*this\.version\s*\|\|\s*'[^']+'/g, `version: this.version || '${targetVersion}'`);
    if (newServer !== server) {
      fs.writeFileSync(serverPath, newServer, 'utf8');
      updatedFiles.push('src/main/integrations/LocalServer.js');
    }
  }

  return { targetVersion, updatedFiles };
}

module.exports = { syncAllVersions };

if (require.main === module) {
  const arg = process.argv[2];
  try {
    const res = syncAllVersions(arg);
    console.log(`✓ تم تحديث ومزامنة جميع ملفات المشروع بنجاح إلى الإصدار v${res.targetVersion}`);
    if (res.updatedFiles.length) {
      console.log(`  الملفات المحدثة:`);
      res.updatedFiles.forEach(f => console.log(`   - ${f}`));
    } else {
      console.log(`  جميع الملفات كانت محدثة بالفعل.`);
    }
  } catch (err) {
    console.error(`✖ فشل تحديث الإصدار:`, err.message);
    process.exit(1);
  }
}
