// Finner identifikatorer som BRUKES men aldri er deklarert, importert
// eller globale.
//
// Grunnen: src/lib/offers.js kalte kr() uten å importere den, og
// Tilbud-fanen ble helt blank hos Jon. Vite bygger uten et pip — feilen
// finnes først når noen åpner fanen. Denne kjører i test-løpet i stedet.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

const GLOBALS = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'console', 'fetch', 'Response', 'Request', 'Headers', 'FormData', 'Blob', 'File',
  'FileReader', 'URL', 'URLSearchParams', 'AbortController', 'Image', 'Audio',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', 'structuredClone', 'crypto', 'atob', 'btoa',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError',
  'RangeError', 'Intl', 'BigInt', 'Proxy', 'Reflect', 'globalThis', 'process',
  'SpeechRecognition', 'webkitSpeechRecognition', 'MediaRecorder', 'IntersectionObserver',
  'ResizeObserver', 'MutationObserver', 'CustomEvent', 'Event', 'DOMParser', 'TextEncoder',
  'TextDecoder', 'Uint8Array', 'ArrayBuffer', 'Deno', 'undefined', 'NaN', 'Infinity',
  'caches', 'self', 'clients', 'skipWaiting', 'importScripts', 'performance', 'matchMedia',
  'Notification', 'ServiceWorkerGlobalScope', 'Element', 'HTMLElement', 'Node', 'CSS',
  'Record', 'ReturnType', 'Partial', 'Pick', 'Omit',
  'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'createImageBitmap',
  'OffscreenCanvas', 'ImageData', 'canvas', 'alert', 'confirm', 'prompt',
  // Brukes inne i page.evaluate() i nettlesertestene — de kjører i
  // nettleseren, ikke i Node.
  'getComputedStyle', 'getSelection', 'scrollTo', 'scrollBy', 'innerWidth',
  'innerHeight', 'devicePixelRatio', 'history', 'screen', 'DOMRect',
]);

const files = execSync(
  "git ls-files 'src/**/*.js' 'src/**/*.jsx' 'scripts/*.mjs'", { encoding: 'utf-8' },
).trim().split('\n').filter(Boolean);

const problems = [];
for (const file of files) {
  const code = readFileSync(file, 'utf-8');
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'topLevelAwait', 'importAssertions'],
      errorRecovery: true,
    });
  } catch (e) {
    problems.push({ file, name: `(kunne ikke parses: ${e.message})`, line: 0 });
    continue;
  }
  traverse(ast, {
    Program(path) {
      for (const [name, refs] of Object.entries(path.scope.globals)) {
        if (GLOBALS.has(name)) continue;
        const line = refs.loc?.start?.line ?? 0;
        problems.push({ file, name, line });
      }
    },
  });
}

if (problems.length) {
  console.error('Udeklarerte identifikatorer — dette blir en blank skjerm:');
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.name}`);
  process.exit(1);
}
console.log(`${files.length} filer sjekket — ingen udeklarerte identifikatorer.`);
