'use strict';
/* فك الأرشيف تلقائياً (2.3) — بعد اكتمال تحميل ZIP/RAR/7z:
   - ZIP: عبر 7-Zip إن وُجد، وإلا PowerShell Expand-Archive (مدمج في ويندوز)
   - RAR/7z: عبر 7-Zip أو WinRAR إن كانت مثبتة (وإلا نتخطى بهدوء)
   لا تبعيات خارجية — أدوات النظام فقط. */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SEVENZIP_PATHS = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe'
];
const WINRAR_PATHS = [
  'C:\\Program Files\\WinRAR\\WinRAR.exe',
  'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe'
];

const EXTRACTABLE = new Set(['.zip', '.rar', '.7z']);

function findTool(ext) {
  for (const p of SEVENZIP_PATHS) {
    if (fs.existsSync(p)) return { exe: p, kind: '7z' };
  }
  if (ext === '.rar') {
    for (const p of WINRAR_PATHS) {
      if (fs.existsSync(p)) return { exe: p, kind: 'winrar' };
    }
  }
  return null;
}

function run(cmd, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise(resolve => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, err => {
      resolve(err ? { ok: false, reason: String(err.message || err) } : { ok: true });
    });
  });
}

/* يعيد { ok, dest, files? } عند المحاولة، أو { ok: false, reason } عند التخطي */
async function extractArchive(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTRACTABLE.has(ext)) return null; // ليس أرشيفاً — لا شيء نفعله
  const dest = filePath.slice(0, filePath.length - ext.length) + ' (extracted)';
  fs.mkdirSync(dest, { recursive: true });

  const tool = findTool(ext);
  if (tool) {
    const args = tool.kind === '7z'
      ? ['x', '-y', `-o${dest}`, filePath]
      : ['x', '-y', filePath, dest + '\\'];
    const r = await run(tool.exe, args);
    return r.ok
      ? { ok: true, dest, files: fs.readdirSync(dest).length, tool: path.basename(tool.exe) }
      : { ok: false, reason: r.reason, dest };
  }

  if (ext !== '.zip') return { ok: false, reason: 'no-tool', dest };

  // ZIP بدون 7-Zip: PowerShell المدمج
  const ps = `Expand-Archive -LiteralPath '${String(filePath).replace(/'/g, "''")}' -DestinationPath '${String(dest).replace(/'/g, "''")}' -Force`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 15 * 60 * 1000);
  return r.ok
    ? { ok: true, dest, files: fs.readdirSync(dest).length, tool: 'PowerShell' }
    : { ok: false, reason: r.reason, dest };
}

module.exports = { extractArchive, findTool, EXTRACTABLE };