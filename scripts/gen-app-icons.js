'use strict';

const fs = require('fs');
const path = require('path');
const { buildPng } = require('../src/main/icon');

function makeIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    const w = item.size >= 256 ? 0 : item.size;
    const h = item.size >= 256 ? 0 : item.size;
    entry.writeUInt8(w, 0);
    entry.writeUInt8(h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)]);
}

const buildDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(buildDir, { recursive: true });

// توليد أحجام الأيقونات: 256, 128, 64, 48, 32, 16
const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map(size => ({ size, buffer: buildPng(size) }));

const icoBuf = makeIco(pngs);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf);
fs.writeFileSync(path.join(buildDir, 'icon.png'), buildPng(512));

console.log('✓ Generated build/icon.ico (' + icoBuf.length + ' bytes)');
console.log('✓ Generated build/icon.png (512x512)');
