'use strict';
const s = require('fs').readFileSync('src/renderer/index.html', 'utf8');
const open = (s.match(/<div/g) || []).length;
const close = (s.match(/<\/div>/g) || []).length;
console.log('div open:', open, '| close:', close, open === close ? 'BALANCED ✓' : 'UNBALANCED ✖');
