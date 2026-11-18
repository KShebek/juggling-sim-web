// Bundle the app into one self-contained file: dist/juggle.html
// No dependencies:  node tools/build.js
//
// Each ES module becomes a function in a small registry, so modules keep their
// own scopes. Supported syntax (what src/ uses): single-line
//   import { a, b as c } from './x.js';
//   export function / class / const / let NAME
//   export { a, b };            export { a, b } from './x.js';

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src/modes/free-juggle.js');
const mods = new Map();   // abs path -> transformed source

const names = list => list.split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const m = /^(\w+)\s+as\s+(\w+)$/.exec(s);
  return m ? { from: m[1], to: m[2] } : { from: s, to: s };
});

function load(file) {
  if (mods.has(file)) return;
  mods.set(file, null);
  const src = readFileSync(file, 'utf8');
  const exportsList = [];
  const deps = [];
  const out = src.split('\n').map(line => {
    let m;
    if ((m = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/.exec(line))) {
      const dep = resolve(dirname(file), m[2]); deps.push(dep);
      return `const { ${names(m[1]).map(n => n.from === n.to ? n.from : `${n.from}: ${n.to}`).join(', ')} } = __req(${JSON.stringify(key(dep))});`;
    }
    if (/^import\s/.test(line)) throw new Error(`${key(file)}: unsupported import: ${line}`);
    if ((m = /^export\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/.exec(line))) {
      const dep = resolve(dirname(file), m[2]); deps.push(dep);
      const ns = names(m[1]);
      ns.forEach(n => exportsList.push(n.to));
      return `const { ${ns.map(n => n.from === n.to ? n.from : `${n.from}: ${n.to}`).join(', ')} } = __req(${JSON.stringify(key(dep))});`;
    }
    if ((m = /^export\s*\{([^}]*)\};?\s*$/.exec(line))) { names(m[1]).forEach(n => exportsList.push(n.to)); return ''; }
    if ((m = /^export\s+(?:async\s+)?(function\*?|class|const|let|var)\s+(\w+)/.exec(line))) { exportsList.push(m[2]); return line.replace(/^export\s+/, ''); }
    if (/^export\s/.test(line)) throw new Error(`${key(file)}: unsupported export: ${line}`);
    return line;
  });
  const body = out.join('\n') + `\nreturn { ${[...new Set(exportsList)].join(', ')} };`;
  mods.set(file, body);
  deps.forEach(load);
}
const key = f => relative(root, f).split('\\').join('/');

load(entry);
let js = `(function () {
"use strict";
const __defs = {}, __cache = {};
function __req(k) { if (!(k in __cache)) { if (!__defs[k]) throw new Error('missing module ' + k); __cache[k] = __defs[k](); } return __cache[k]; }
`;
for (const [file, body] of mods) js += `__defs[${JSON.stringify(key(file))}] = function () {\n${body}\n};\n`;
js += `__req(${JSON.stringify(key(entry))});\n})();\n`;

let html = readFileSync(join(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="src/modes/free-juggle.js"></script>';
if (!html.includes(tag)) throw new Error('index.html: module script tag not found');
html = html.replace(tag, () => `<script>\n${js.replace(/<\/script>/g, '<\\/script>')}</script>`);
html = html.replace(/href="archive\//g, 'href="../archive/');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/juggle.html'), html);
console.log(`dist/juggle.html written: ${mods.size} modules, ${(html.length / 1024).toFixed(0)} KB`);
