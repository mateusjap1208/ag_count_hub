/**
 * Parser de arquivos .txt exportados do SAP.
 *
 * - Detecta encoding (UTF-8 ou Windows-1252/Latin-1, comum em exports SAP)
 * - Detecta delimitador: TAB, ";" ou "|" (relatórios ALV com pipes nas bordas)
 * - Ignora linhas vazias e separadores ("-----", "=====")
 * - Localiza a linha de cabeçalho pelos nomes/aliases das colunas do módulo
 * - Converte números no padrão brasileiro e SAP: 1.234,56 | 1.234,56- | (1.234,56) | -1234.56
 * - Converte datas: DD/MM/AAAA, DD.MM.AAAA, AAAA-MM-DD, AAAAMMDD
 */
const { norm } = require('../config/modules');

const normalizeHeader = (h) =>
  norm(h).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function decodeBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function detectDelimiter(lines) {
  const candidates = ['\t', ';', '|'];
  const sample = lines.slice(0, 20);
  let best = '\t';
  let bestScore = 0;
  for (const d of candidates) {
    const counts = sample.map((l) => l.split(d).length - 1).filter((c) => c > 0);
    if (!counts.length) continue;
    // Prefere o delimitador mais frequente e consistente entre as linhas
    const score = counts.length * Math.min(...counts);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitLine(line, delimiter) {
  let l = line;
  if (delimiter === '|') l = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  return l.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
}

function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s|R\$/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // padrão BR
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234.567 sem decimais
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

function parseDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m) return valid(`${m[3]}-${m[2]}-${m[1]}`);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  return undefined;
}
const valid = (iso) => (Number.isNaN(Date.parse(iso)) ? undefined : iso);

function buildColumnMap(headerCells, columns) {
  const normalized = headerCells.map(normalizeHeader);
  const map = {};
  for (const col of columns) {
    const names = [col.key, ...(col.aliases || [])].map(normalizeHeader);
    const idx = normalized.findIndex((h) => names.includes(h));
    if (idx >= 0) map[col.key] = idx;
  }
  return map;
}

/**
 * Lê um .txt/.csv delimitado.
 * @param {Buffer} buffer conteúdo do arquivo
 * @param {object} moduleDef definição do módulo (src/config/modules.js)
 * @returns {{ rows: object[], warnings: string[], delimiter: string, totalLines: number }}
 */
function parse(buffer, moduleDef) {
  const text = decodeBuffer(buffer);
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^[\s\-=_|+*]+$/.test(l));
  if (!lines.length) throw new ParseError('O arquivo está vazio.');
  const delimiter = detectDelimiter(lines);
  return { ...parseTable(lines.map((l) => splitLine(l, delimiter)), moduleDef), delimiter };
}

/**
 * Interpreta uma tabela já dividida em células (linhas de .txt ou de planilha Excel).
 * Células numéricas/data vindas do Excel são aceitas diretamente.
 */
function parseTable(table, moduleDef) {
  const cellsOf = (r) => (r || []).map((c) => (c == null ? '' : c));
  const asText = (r) => cellsOf(r).map((c) => String(c).trim());
  const lines = table.filter((r) => r && r.some((c) => c != null && String(c).trim() !== ''));
  if (!lines.length) throw new ParseError('O arquivo está vazio.');
  const required = moduleDef.columns.filter((c) => c.required);

  // Procura o cabeçalho nas primeiras linhas (exports SAP costumam ter título antes)
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const map = buildColumnMap(asText(lines[i]), moduleDef.columns);
    if (required.every((c) => c.key in map)) { headerIdx = i; colMap = map; break; }
  }
  if (headerIdx < 0) {
    const expected = required.map((c) => c.label).join(', ');
    throw new ParseError(`Cabeçalho não reconhecido para "${moduleDef.title}". Colunas obrigatórias: ${expected}.`);
  }

  const headerSig = asText(lines[headerIdx]).join('\u0001');
  const rows = [];
  const warnings = [];
  const MAX_WARNINGS = 50;
  const warn = (msg) => { if (warnings.length < MAX_WARNINGS) warnings.push(msg); };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (asText(lines[i]).join('\u0001') === headerSig) continue; // cabeçalho repetido (quebra de página SAP)
    const cells = cellsOf(lines[i]);
    const row = {};
    let ok = true;
    for (const col of moduleDef.columns) {
      if (!(col.key in colMap)) continue;
      const raw = cells[colMap[col.key]];
      if (col.type === 'number') {
        const n = typeof raw === 'number' ? raw : parseNumber(raw);
        if (Number.isNaN(n)) { warn(`Linha ${i + 1}: valor inválido em "${col.label}" (${raw}).`); ok = false; break; }
        row[col.key] = n ?? 0;
      } else if (col.type === 'date') {
        const d = parseDate(raw);
        if (d === undefined) { warn(`Linha ${i + 1}: data inválida em "${col.label}" (${raw}).`); ok = false; break; }
        row[col.key] = d;
      } else {
        row[col.key] = String(raw ?? '').trim();
      }
      if (col.required && (row[col.key] === '' || row[col.key] == null)) {
        warn(`Linha ${i + 1}: campo obrigatório "${col.label}" vazio.`); ok = false; break;
      }
    }
    if (!ok) continue;
    for (const col of moduleDef.columns) {
      if (col.compute && (row[col.key] == null)) row[col.key] = col.compute(row);
    }
    rows.push(row);
  }

  if (!rows.length) throw new ParseError('Nenhuma linha válida encontrada no arquivo.');
  const skipped = lines.length - headerIdx - 1 - rows.length;
  if (skipped > MAX_WARNINGS) warnings.push(`... e mais ${skipped - MAX_WARNINGS} linha(s) ignorada(s).`);

  return { rows, warnings, totalLines: lines.length };
}

class ParseError extends Error {}

module.exports = { parse, parseTable, parseNumber, parseDate, ParseError, normalizeHeader };
