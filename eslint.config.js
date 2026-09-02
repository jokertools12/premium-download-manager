'use strict';
/* ESLint Flat Config — Premium Download Manager
   قواعد متحفظة: أخطاء حقيقية فقط (no-undef)، وتحذيرات للمتغيرات المهملة. */

const NODE_GLOBALS = {
  require: 'writable', module: 'writable', exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly', global: 'readonly',
  fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly',
  WebSocket: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', queueMicrotask: 'readonly', structuredClone: 'readonly', crypto: 'readonly'
};

const BROWSER_GLOBALS = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  console: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly',
  WebSocket: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  alert: 'readonly', confirm: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
  FileReader: 'readonly', Blob: 'readonly', FormData: 'readonly',
  MutationObserver: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
  history: 'readonly', getComputedStyle: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly', HTMLCanvasElement: 'readonly', CanvasRenderingContext2D: 'readonly',
  /* متغيرات عالمية يعرّفها سكربتات الـ renderer المُحمّلة قبل app.js */
  escapeHtml: 'readonly', escapeAttr: 'readonly', escapeUrl: 'readonly', t: 'readonly', STR: 'readonly',
  /* واجهة إضافات كروميوم */
  chrome: 'readonly'
};

const RULES = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-fallthrough': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'warn',
  'eqeqeq': ['warn', 'smart']
};

module.exports = [
  {
    ignores: [
      'node_modules/**', 'dist/**', 'build-out/**', 'build/**',
      'crash-test/**', 'release/**', 'coverage/**'
    ]
  },
  /* عمليات Node (main/preload/scripts) + سكربتات الاختبار اليدوية القديمة */
  {
    files: ['src/main/**/*.js', 'src/preload.js', 'test/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...NODE_GLOBALS, chrome: 'readonly' }
    },
    rules: RULES
  },
  /* اختبارات Vitest — ESM */
  {
    files: ['test/unit/**/*.js', 'test/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: NODE_GLOBALS
    },
    rules: RULES
  },
  /* الـ renderer (نصوص داخل الصفحة) */
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...BROWSER_GLOBALS, module: 'writable', exports: 'writable', require: 'readonly', process: 'readonly' }
    },
    rules: RULES
  },
  /* إضافة المتصفح */
  {
    files: ['src/extension/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...BROWSER_GLOBALS, ...NODE_GLOBALS }
    },
    rules: RULES
  }
];
