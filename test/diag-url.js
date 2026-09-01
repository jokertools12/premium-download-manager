'use strict';
/* تشخيص رابط المستخدم: سلوك Range / Referer / تدفق البيانات */
const url = 'https://deva-cpmav9sk6x16.cimanowtv.com/uploads/2021/11/11/_Cima-Now.CoM_%20La.Brea.S01E07.HD/%5BCima-Now.CoM%5D%20La.Brea.S01E07.HD-480p.mp4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function probe(useReferer, useRange) {
  const headers = { 'user-agent': UA };
  if (useReferer) headers.referer = 'https://cimanowtv.com/';
  if (useRange) headers.range = 'bytes=0-0';
  const res = await fetch(url, { headers });
  const h = res.headers;
  const info = {
    useReferer, useRange,
    status: res.status,
    type: h.get('content-type'),
    len: h.get('content-length'),
    range: h.get('content-range'),
    acceptRanges: h.get('accept-ranges'),
    encoding: h.get('content-encoding'),
    server: h.get('server')
  };
  // قياس أول دفعة بيانات
  let firstChunk = 0, chunks = 0;
  if (res.body) {
    try {
      for await (const c of res.body) { chunks++; firstChunk += c.length; if (firstChunk > 262144) break; }
    } catch (e) { info.streamErr = e.message; }
  }
  info.firstBytes = firstChunk;
  info.chunks = chunks;
  return info;
}

(async () => {
  console.log('A) بدون Referer، بدون Range:', JSON.stringify(await probe(false, false)));
  console.log('B) بدون Referer، مع Range:', JSON.stringify(await probe(false, true)));
  console.log('C) مع Referer، مع Range:', JSON.stringify(await probe(true, true)));
  console.log('D) مع Referer، بدون Range:', JSON.stringify(await probe(true, false)));
  // E) Referer تلقائي من نفس نطاق الرابط (الحل الآلي المقترح)
  {
    const o = new URL(url);
    const autoRef = o.origin + '/';
    const headers = { 'user-agent': UA, referer: autoRef, range: 'bytes=0-0' };
    const res = await fetch(url, { headers });
    const infoE = { status: res.status, range: res.headers.get('content-range'), autoRef };
    if (res.body) { try { await res.body.cancel(); } catch (_e) {} }
    console.log('E) Referer تلقائي من نطاق الرابط:', JSON.stringify(infoE));
  }
  process.exit(0);
})().catch(e => { console.error('DIAG-FAIL:', e.message); process.exit(1); });
