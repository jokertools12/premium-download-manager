'use strict';
/* فحص استجابة الخوادم لطلبات Range */
const URLS = [
  'https://ash-speed.hetzner.com/10MB.bin',
  'https://proof.ovh.net/files/10Mb.dat'
];

(async () => {
  for (const u of URLS) {
    try {
      const r = await fetch(u, {
        headers: { 'user-agent': 'Mozilla/5.0 PremiumDM/1.0', range: 'bytes=0-0' }
      });
      console.log('URL:', u);
      console.log('  status:', r.status);
      console.log('  content-range:', r.headers.get('content-range'));
      console.log('  accept-ranges:', r.headers.get('accept-ranges'));
      console.log('  content-length:', r.headers.get('content-length'));
      if (r.body) { try { await r.body.cancel(); } catch (_e) {} }
    } catch (e) {
      console.log('URL:', u, 'FAIL:', e.message);
    }
  }
  process.exit(0);
})();
