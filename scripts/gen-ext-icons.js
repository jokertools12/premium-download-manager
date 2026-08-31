'use strict';

/* توليد أيقونات الإضافة (16/32/48/128) من مولد الأيقونة الأساسي */
const fs = require('fs');
const path = require('path');
const { buildPng } = require('../src/main/icon');

const OUT = path.join(__dirname, '..', 'src', 'extension', 'icons');
fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), buildPng(size));
  console.log('✓ icon' + size + '.png');
}
console.log('DONE');
