'use strict';

// مولّد أيقونة PNG برمجياً (سهم تحميل أبيض على مربع متدرج) - بدون ملفات خارجية
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function buildPng(size) {
  const W = size;
  const H = size;
  const stride = W * 4 + 1;
  const rows = Buffer.alloc(stride * H);
  const radius = W * 0.22;

  for (let y = 0; y < H; y++) {
    rows[y * stride] = 0; // فلتر الصف
    for (let x = 0; x < W; x++) {
      const o = y * stride + 1 + x * 4;
      // مربع بحواف دائرية
      const cx = Math.min(Math.max(x, radius), W - radius);
      const cy = Math.min(Math.max(y, radius), H - radius);
      const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius;
      if (!inside) { rows[o + 3] = 0; continue; }
      // تدرج لوني من #4f8cff إلى #7b5cff
      const t = y / H;
      rows[o] = Math.round(79 + t * (123 - 79));
      rows[o + 1] = Math.round(140 + t * (92 - 140));
      rows[o + 2] = 255;
      rows[o + 3] = 255;
      // سهم أبيض (عمود + رأس مثلث)
      const halfW = W / 2;
      const shaft = Math.abs(x - halfW) <= W * 0.085 && y >= H * 0.20 && y <= H * 0.52;
      let head = false;
      if (y >= H * 0.48 && y <= H * 0.80) {
        const hw = W * 0.30 * ((y - H * 0.48) / (H * 0.32));
        head = Math.abs(x - halfW) <= hw;
      }
      if (shaft || head) {
        rows[o] = 255;
        rows[o + 1] = 255;
        rows[o + 2] = 255;
        rows[o + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // عمق البت
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = { buildPng };
