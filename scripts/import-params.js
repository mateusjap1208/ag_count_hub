/**
 * Importa em lote as planilhas de parâmetros de uma pasta, identificando cada
 * tabela pelo nome do arquivo (ver `filePattern` em src/config/parameters.js).
 *
 * Uso: npm run params:import -- "C:\caminho\00_Parâmetros"
 */
const fs = require('node:fs');
const path = require('node:path');
const Parameter = require('../src/models/Parameter');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.log('Uso: npm run params:import -- "<pasta com as planilhas>"');
  process.exit(1);
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|txt|csv)$/i.test(f) && !f.startsWith('~$'));
  const done = new Set();
  for (const file of files) {
    const def = Parameter.definitions.find((d) => d.filePattern.test(file));
    if (!def) { console.log(`- ${file}: ignorado (nenhuma tabela de parâmetros corresponde ao nome)`); continue; }
    const ids = Parameter.targetsFor(def.id);
    const t = Date.now();
    try {
      const results = await Parameter.importFile(ids, { buffer: fs.readFileSync(path.join(dir, file)), fileName: file, user: { name: 'Importação em lote' } });
      for (const { def: d, record } of results) {
        done.add(d.id);
        console.log(`✓ ${file} → ${d.title}: ${record.rows.toLocaleString('pt-BR')} linha(s)${record.skipped ? `, ${record.skipped} ignorada(s)` : ''} (${Date.now() - t} ms)`);
      }
    } catch (e) {
      console.log(`✗ ${file} → ${def.title}: ${e.message}`);
    }
  }
  const missing = Parameter.definitions.filter((d) => !done.has(d.id));
  if (missing.length) console.log(`\nNão importadas nesta execução: ${missing.map((d) => d.title).join(', ')}`);

  console.log('\nChecagens de consistência:');
  for (const c of await Parameter.checks()) console.log(`  [${c.level}] ${Parameter.getDef(c.param).title}: ${c.text}`);
})().catch((e) => { console.error(e); process.exit(1); });
