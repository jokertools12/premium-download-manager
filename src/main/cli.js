'use strict';
/* واجهات النظام البيئي (5.5): أوامر CLI ومخطط pdm:// — نقية وقابلة للاختبار
   أمثلة:
     PremiumDM.exe add https://example.com/f.zip
     PremiumDM.exe https://example.com/f.zip
     pdm://add?url=https%3A%2F%2Fexample.com%2Ff.zip
     pdm://open
*/

const URL_RE = /^https?:\/\/\S+$/i;

/* يحلل وسائط سطر الأوامر إلى أمر موحد */
function parseCliArgs(argv) {
  const list = (argv || []).filter(a => typeof a === 'string' && !a.startsWith('-'));
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.toLowerCase() === 'add') {
      const next = list[i + 1];
      if (next && URL_RE.test(next)) return { cmd: 'add', url: next };
      return { cmd: 'add', url: null };
    }
    if (URL_RE.test(a)) return { cmd: 'add', url: a };
    if (/^pdm:\/\//i.test(a)) return parsePdmUrl(a);
  }
  return { cmd: null, url: null };
}

/* يحلل pdm://add?url=... أو pdm://open */
function parsePdmUrl(u) {
  try {
    const parsed = new URL(String(u || '').replace(/^pdm:/i, 'pdm:').trim());
    const cmd = (parsed.hostname || parsed.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cmd === 'add' || parsed.searchParams.has('url')) {
      const url = parsed.searchParams.get('url') || '';
      if (URL_RE.test(url)) return { cmd: 'add', url };
      return { cmd: 'add', url: null };
    }
    if (cmd === 'open') return { cmd: 'open', url: null };
    return { cmd: null, url: null };
  } catch (_e) {
    return { cmd: null, url: null };
  }
}

module.exports = { URL_RE, parseCliArgs, parsePdmUrl };