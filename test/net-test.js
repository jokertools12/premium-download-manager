'use strict';
const t = async u => {
  try {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), 8000);
    const r = await fetch(u, { signal: c.signal });
    console.log(u, '=>', r.status);
    clearTimeout(id);
  } catch (e) {
    console.log(u, '=> FAIL:', e.message);
  }
};
Promise.all([
  t('https://speed.cloudflare.com/__down?bytes=1000'),
  t('https://proof.ovh.net/files/1Mb.dat'),
  t('https://ash-speed.hetzner.com/100MB.bin'),
  t('https://www.google.com')
]).then(() => process.exit(0));
