/**
 * Importador genérico para relatórios tabulares do SAP (Excel ou .txt).
 * Cada módulo descreve o arquivo em `importer` (src/config/modules.js):
 *   fields:   { campo: { names: [cabeçalhos normalizados], type: 'string'|'number'|'date', upper? } }
 *   required: campos obrigatórios para reconhecer o cabeçalho e aceitar a linha
 *   company / currency: campos de empresa e moeda da linha
 *   skip(row): ignora a linha (ex.: sem valores)
 *   derive(row, ctx): campos calculados; ctx traz dicionários dos Parâmetros
 */
const { readSheets } = require('./sheetReader');
const { normalizeHeader, parseNumber, parseDate } = require('./txtParser');
const Parameter = require('../models/Parameter');

class ImportError extends Error {}

const str = (v) => (v == null ? '' : String(v).trim());
const stripCode = (s) => str(s).replace(/^[A-Z]\.[\d.]+\s*-\s*/, '').trim();

function toValue(raw, type) {
  if (type === 'number') {
    if (typeof raw === 'number') return raw;
    const n = parseNumber(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'date') {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number') return raw > 2900000 ? null : new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000).toISOString().slice(0, 10);
    const d = parseDate(str(raw));
    return d || null;
  }
  return str(raw);
}

/** Dicionários dos Parâmetros usados nos campos calculados (carregados uma vez por importação) */
async function buildContext() {
  const plano = await Parameter.all('plano-contas').catch(() => []);
  const porConta = new Map();
  const porGrupo = new Map();
  for (const p of plano) {
    if (!porConta.has(String(p.conta))) porConta.set(String(p.conta), p);
    if (!porGrupo.has(String(p.contaGrupo))) porGrupo.set(String(p.contaGrupo), p);
  }
  return {
    /** Descrição de uma conta do razão (ou da conta do grupo) */
    contaDescricao: (c) => (porConta.get(String(c)) || porGrupo.get(String(c)))?.descricao || '',
    /** Classe (nível N4 do Plano de Contas) de uma conta do grupo ou do razão */
    contaClasse: (c) => stripCode((porGrupo.get(String(c)) || porConta.get(String(c)))?.n4) || '',
  };
}

async function importRows(buffer, fileName, def) {
  const spec = def.importer;
  const sheets = await readSheets(buffer, fileName);
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 30); h++) {
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(str(c)));
      const map = {};
      for (const [k, f] of Object.entries(spec.fields)) {
        const i = header.findIndex((x) => f.names.includes(x));
        if (i >= 0) map[k] = i;
      }
      if (!spec.required.every((k) => k in map)) continue;

      const ctx = await buildContext();
      const all = [];
      let ignoradas = 0;
      for (let i = h + 1; i < sheet.rows.length; i++) {
        const r = sheet.rows[i];
        if (!r || !r.some((c) => c != null && str(c) !== '')) continue;
        const row = {};
        for (const [k, f] of Object.entries(spec.fields)) {
          if (!(k in map)) { row[k] = f.type === 'number' ? 0 : (f.type === 'date' ? null : ''); continue; }
          let v = toValue(r[map[k]], f.type);
          if (f.upper && typeof v === 'string') v = v.toUpperCase();
          row[k] = v;
        }
        if (spec.required.some((k) => row[k] === '' || row[k] == null)) { ignoradas++; continue; }
        if (spec.skip && spec.skip(row)) { ignoradas++; continue; }
        if (spec.derive) Object.assign(row, spec.derive(row, ctx));
        all.push(row);
      }
      if (!all.length) throw new ImportError('Nenhuma linha válida encontrada no arquivo.');
      // Ajustes que dependem de várias linhas (ex.: valores da obra repetidos em cada obrigação)
      if (spec.postProcess) spec.postProcess(all);
      const byCompany = new Map();
      for (const row of all) {
        const company = str(row[spec.company]);
        const currency = str(row[spec.currency]) || spec.defaultCurrency || 'BRL';
        let comp = byCompany.get(company);
        if (!comp) { comp = new Map(); byCompany.set(company, comp); }
        (comp.get(currency) || comp.set(currency, []).get(currency)).push(row);
      }
      return { byCompany, linhas: all.length, ignoradas };
    }
  }
  const labels = spec.required.map((k) => spec.fields[k].label || k).join(', ');
  throw new ImportError(`Layout não reconhecido para "${spec.label}". Colunas obrigatórias: ${labels}.`);
}

module.exports = { importRows, ImportError };
