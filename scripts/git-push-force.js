'use strict';
/* دفع main + v1.0.1 في الخلفية بالرمز المخزن */
const { execSync } = require('child_process');
const fs = require('fs');

let tok = '';
try { tok = fs.readFileSync(process.env.USERPROFILE + '\\.pdm-gh-token', 'utf8').trim(); } catch (_e) {}
if (!tok) { console.error('NO-TOKEN'); process.exit(1); }

process.env.GIT_TERMINAL_PROMPT = '0';
const REMOTE = 'https://jokertools12:' + encodeURIComponent(tok) + '@github.com/jokertools12/premium-download-manager.git';
const out = [];

for (const ref of ['main', 'v1.0.1']) {
  try {
    const r = execSync('git push ' + REMOTE + ' ' + ref + ' 2>&1', { encoding: 'utf8', timeout: 240000, windowsHide: true });
    out.push('OK ' + ref + ' :: ' + r.trim().split('\n').slice(-2).join(' | '));
  } catch (e) {
    const m = String((e.stdout || '') + ' ' + (e.stderr || ''));
    out.push(ref + ' ERR: ' + m.trim().slice(0, 300));
  }
}
fs.writeFileSync(process.env.TEMP + '\\gp3.log', out.join('\n'), 'utf8');
process.exit(0);