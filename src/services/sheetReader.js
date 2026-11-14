/**
 * Leitura de planilhas para importação de parâmetros.
 * - .xlsx: leitura em streaming (ExcelJS) — suporta arquivos grandes como o LFA1 (250 mil linhas)
 * - .txt/.csv: delimitado (TAB, ";" ou "|"), mesmo tratamento do parser de relatórios
 * Retorna [{ name, rows: any[][] }] com valores simples (string/number/data ISO).
 */
const { Readable } = require('node:stream');
const ExcelJS = require('exceljs');

const cellValue = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    if (v.error) return null;
    return null;
  }
  return v;
};

async function readXlsx(buffer) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit', entries: 'emit',
  });
  const sheets = [];
  for await (const ws of reader) {
    const rows = [];
    for await (const row of ws) {
      const values = Array.isArray(row.values) ? row.values.slice(1).map(cellValue) : [];
      rows[row.number - 1] = values;
    }
    sheets.push({ name: ws.name, rows: Array.from(rows, (r) => r || []) });
  }
  return sheets;
}

function readDelimited(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, ''); }
  catch { text = new TextDecoder('windows-1252').decode(buffer); }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^[\s\-=_|+*]+$/.test(l));
  const sample = lines.slice(0, 20);
  const delim = ['\t', ';', '|'].map((d) => [d, sample.filter((l) => l.includes(d)).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map((l) => {
    let s = l;
    if (delim === '|') s = s.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
    return s.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  });
  return [{ name: 'arquivo', rows }];
}

async function readSheets(buffer, fileName) {
  if (/\.xlsx$/i.test(fileName)) return readXlsx(buffer);
  if (/\.(txt|csv)$/i.test(fileName)) return readDelimited(buffer);
  throw new Error('Formato não suportado. Envie .xlsx, .txt ou .csv.');
}

module.exports = { readSheets };
