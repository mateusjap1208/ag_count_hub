/**
 * Soma +1 ao número do build em version.json.
 * Roda sozinho a cada commit (hook .githooks/pre-commit), então cada build publicado na Vercel
 * tem um número novo. Uso manual: node scripts/bump-build.js
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'version.json');
const v = JSON.parse(fs.readFileSync(file, 'utf8'));
v.build = (Number(v.build) || 0) + 1;
fs.writeFileSync(file, `${JSON.stringify(v, null, 2)}\n`);
console.log(`Versão ${v.version}.${v.build}`);
