const fs = require('node:fs/promises');
const path = require('node:path');

/** Leitura/escrita de JSON com gravação atômica (arquivo temporário + rename). */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

async function remove(file) {
  await fs.rm(file, { force: true });
}

module.exports = { readJson, writeJson, remove };
