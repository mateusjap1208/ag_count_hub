/**
 * Conversão das planilhas de parâmetros em registros normalizados.
 */
const { normalizeHeader } = require('./txtParser');

class ParamError extends Error {}

const str = (v) => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
};
const isAccount = (v) => /^\d{6,}[A-Z]?$/i.test(str(v));

/** Planilha tabular: localiza o cabeçalho pelos aliases e converte as linhas */
function parseTable(sheets, def) {
  const required = def.columns.filter((c) => c.required);
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 15); h++) {
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(str(c)));
      const map = {};
      for (const col of def.columns) {
        const names = [col.key, ...(col.aliases || [])].map(normalizeHeader);
        const hits = header.map((x, i) => (names.includes(x) ? i : -1)).filter((i) => i >= 0);
        const idx = hits[(col.occurrence || 1) - 1];
        if (idx !== undefined) map[col.key] = idx;
      }
      if (!required.every((c) => c.key in map)) continue;

      const rows = [];
      let skipped = 0;
      for (let i = h + 1; i < sheet.rows.length; i++) {
        const cells = sheet.rows[i];
        if (!cells || !cells.some((c) => c != null && str(c) !== '')) continue;
        const rec = {};
        for (const col of def.columns) if (col.key in map) rec[col.key] = str(cells[map[col.key]]);
        if (required.some((c) => !rec[c.key])) { skipped++; continue; }
        rows.push(rec);
      }
      return { rows, skipped, sheet: sheet.name };
    }
  }
  throw new ParamError(`Cabeçalho não reconhecido para "${def.title}". Colunas obrigatórias: ${required.map((c) => c.label).join(', ')}.`);
}

const pickSheet = (sheets, re) => {
  const s = sheets.find((x) => re.test(x.name));
  if (!s) throw new ParamError(`Aba não encontrada (esperado nome compatível com ${re}). Abas no arquivo: ${sheets.map((x) => x.name).join(', ')}.`);
  return s;
};

/** BPC — DRE: contas na ordem da demonstração, com seção (A.31, A.32…), títulos e subtotais */
function bpcDre(sheets, def) {
  const sheet = pickSheet(sheets, def.sheet);
  const rows = [];
  let secao = '';
  let ordem = 0;
  for (const r of sheet.rows) {
    if (!r) continue;
    const conta = str(r[1]);
    const texto = str(r[4]);
    if (isAccount(conta)) {
      rows.push({
        ordem: ++ordem, tipo: 'conta', secao, contaGrupo: conta,
        descricao: texto.replace(/^\d+\s*-\s*/, ''), classeDre: str(r[2]), classeNe: str(r[3]),
      });
    } else if (texto && (!/^conta$/i.test(conta) || /^A\.\d+/.test(texto))) {
      // A primeira seção (A.31) vem na mesma linha do cabeçalho "Conta"
      if (/^A\.\d+/.test(texto)) secao = texto;
      const classeNe = /^class ne$/i.test(str(r[3])) ? '' : str(r[3]);
      rows.push({ ordem: ++ordem, tipo: /^A\.\d+/.test(texto) ? 'secao' : 'subtotal', secao, contaGrupo: '', descricao: texto, classeDre: '', classeNe });
    }
  }
  if (!rows.some((x) => x.tipo === 'conta')) throw new ParamError('Nenhuma conta encontrada na aba da DRE.');
  return { rows, skipped: 0, sheet: sheet.name };
}

/** BPC — Balanço: níveis A.1 / A.11 / A.1101 / A.110101 e contas do grupo */
function bpcBp(sheets, def) {
  const sheet = pickSheet(sheets, def.sheet);
  const rows = [];
  const path = [];
  let ordem = 0;
  for (const r of sheet.rows) {
    if (!r) continue;
    const c1 = str(r[1]);
    const conta = str(r[2]);
    const m = c1.match(/^A\.(\d+)\s*-\s*(.+)$/);
    if (isAccount(conta)) {
      rows.push({
        ordem: ++ordem, tipo: 'conta', nivel: path.length + 1, codigo: '', contaGrupo: conta,
        descricao: c1.replace(/^\d+\s*-\s*/, ''), caminho: path.map((p) => p.codigo).join(' › '),
        classeSintetica: '', classeAnalitica: str(r[4]),
      });
    } else if (m) {
      const digits = m[1];
      const nivel = digits.length <= 1 ? 1 : digits.length <= 2 ? 2 : digits.length <= 4 ? 3 : 4;
      path.length = nivel - 1;
      const codigo = `A.${digits}`;
      path.push({ codigo, descricao: m[2] });
      rows.push({
        ordem: ++ordem, tipo: 'nivel', nivel, codigo, contaGrupo: '', descricao: m[2].trim(),
        caminho: path.slice(0, -1).map((p) => p.codigo).join(' › '), classeSintetica: str(r[3]), classeAnalitica: str(r[4]),
      });
    }
  }
  if (!rows.some((x) => x.tipo === 'conta')) throw new ParamError('Nenhuma conta encontrada na aba do Balanço.');
  return { rows, skipped: 0, sheet: sheet.name };
}

/**
 * QV Capital Empregado: tabela dinâmica com hierarquia em colunas.
 * Importa SOMENTE a estrutura (lado → grupo → linha → código gerencial); valores são descartados.
 */
function capitalEmpregado(sheets) {
  const sheet = sheets[0];
  const rows = [];
  const seen = new Set();
  let lado = ''; let grupo = ''; let linha = '';
  for (const r of sheet.rows.slice(1)) {
    if (!r) continue;
    const [, c1, c2, c3, c4] = r.map(str);
    if (c1) { lado = c1.replace(/^Total\s+/i, ''); grupo = ''; linha = ''; }
    else if (c2) { grupo = c2.replace(/\s+Total$/i, ''); linha = ''; }
    else if (c3) linha = c3;
    else if (/^C\d+$/i.test(c4) && lado && grupo && !seen.has(c4)) {
      seen.add(c4);
      rows.push({ ordem: rows.length + 1, lado, grupo, linha, codGerencial: c4 });
    }
  }
  if (!rows.length) throw new ParamError('Estrutura do Capital Empregado não reconhecida (esperados códigos C0000…).');
  return { rows, skipped: 0, sheet: sheet.name };
}

const custom = { bpcDre, bpcBp, capitalEmpregado };

function parseParameter(sheets, def) {
  if (def.type === 'custom') return custom[def.parser](sheets, def);
  return parseTable(sheets, def);
}

module.exports = { parseParameter, ParamError };
