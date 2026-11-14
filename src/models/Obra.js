/**
 * Cadastro de obras: centro de lucro → sigla gerencial, sigla da obra e estrutura.
 * Lista em cache na memória (≈ 2 mil registros); invalidada a cada gravação.
 */
const { obras } = require('../repositories');
const { readSheets } = require('../services/sheetReader');
const { normalizeHeader } = require('../services/txtParser');

class ObraError extends Error {}

// Códigos: letras (inclusive acentuadas), números, espaço e _ . / - % & (ex.: "EÓLICAS", "HLP 25%")
const CODE_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\/%&-]{0,29}$/u;
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

let cache = null;
async function all() {
  cache ||= obras.list().catch((e) => { cache = null; throw e; });
  return cache;
}
const invalidate = () => {
  cache = null;
  // Relatórios filtrados por estrutura/sigla dependem do cadastro: descarta os resumos em cache
  require('../services/cache').summaries.clear();
};

/** Normaliza e valida os campos de uma obra */
function normalize(input, { partial = false } = {}) {
  const o = {
    centroLucro: up(input.centroLucro),
    siglaGerencial: up(input.siglaGerencial),
    siglaObra: up(input.siglaObra),
    estrutura: txt(input.estrutura),
    ativa: input.ativa === undefined ? true : input.ativa === true || input.ativa === 'true' || input.ativa === 'on' || input.ativa === '1',
  };
  const errors = {};
  if (!CODE_RE.test(o.centroLucro)) errors.centroLucro = 'Informe o centro de lucro (até 30 caracteres).';
  if (o.siglaGerencial && !CODE_RE.test(o.siglaGerencial)) errors.siglaGerencial = 'Sigla gerencial inválida (até 30 caracteres).';
  if (!partial && !o.siglaObra) errors.siglaObra = 'Informe a sigla da obra.';
  else if (o.siglaObra && !CODE_RE.test(o.siglaObra)) errors.siglaObra = 'Sigla da obra inválida (até 30 caracteres).';
  if (!partial && !o.estrutura) errors.estrutura = 'Informe a estrutura.';
  else if (o.estrutura.length > 60) errors.estrutura = 'Estrutura com no máximo 60 caracteres.';
  return { obra: o, errors };
}

async function find(centroLucro) {
  const key = up(centroLucro);
  return (await all()).find((o) => o.centroLucro === key) || null;
}

/** Cria ou edita uma obra. `original` = centro de lucro antes da edição (permite renomear). */
async function save(input, { original, user } = {}) {
  const { obra, errors } = normalize(input);
  if (Object.keys(errors).length) { const e = new ObraError('Verifique os campos destacados.'); e.fields = errors; throw e; }
  const prev = original ? await find(original) : null;
  if (original && !prev) throw new ObraError('Obra não encontrada (pode ter sido excluída).');
  const clash = await find(obra.centroLucro);
  if (clash && (!prev || clash.centroLucro !== prev.centroLucro)) {
    const e = new ObraError('Já existe uma obra com esse centro de lucro.');
    e.fields = { centroLucro: 'Centro de lucro já cadastrado.' };
    throw e;
  }
  const now = new Date().toISOString();
  const record = { ...obra, createdAt: prev?.createdAt || now, updatedAt: now, updatedBy: user?.name || user?.email || 'sistema' };
  await obras.save(record, prev?.centroLucro);
  invalidate();
  return record;
}

async function remove(centroLucro) {
  await obras.remove(up(centroLucro));
  invalidate();
}

/** Estruturas existentes, com contagem (para filtros e sugestões) */
async function estruturas() {
  const m = new Map();
  for (const o of await all()) m.set(o.estrutura, (m.get(o.estrutura) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, total }));
}

const SORTABLE = ['centroLucro', 'siglaGerencial', 'siglaObra', 'estrutura', 'updatedAt'];

/** Lista paginada com busca, filtro de estrutura/situação e ordenação */
async function search({ q = '', estrutura = '', situacao = '', sort = 'centroLucro', dir = 'asc', page = 1, size = 50 } = {}) {
  let rows = await all();
  if (estrutura) rows = rows.filter((o) => o.estrutura === estrutura);
  if (situacao === 'ativas') rows = rows.filter((o) => o.ativa !== false);
  if (situacao === 'inativas') rows = rows.filter((o) => o.ativa === false);
  const term = q.trim().toLowerCase();
  if (term) rows = rows.filter((o) => [o.centroLucro, o.siglaGerencial, o.siglaObra, o.estrutura].some((v) => String(v || '').toLowerCase().includes(term)));
  if (!SORTABLE.includes(sort)) sort = 'centroLucro';
  const mult = dir === 'desc' ? -1 : 1;
  rows = [...rows].sort((a, b) => collator.compare(String(a[sort] || ''), String(b[sort] || '')) * mult);
  size = Math.min(Math.max(Number(size) || 50, 10), 200);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(Number(page) || 1, 1), pages);
  return { total, page, pages, size, sort, dir, rows: rows.slice((page - 1) * size, page * size) };
}

/**
 * Importação em lote (.xlsx, .txt ou .csv). Colunas: CENTRO_LUCRO, SIGLA_GERENCIAL, SIGLA_OBRA, ESTRUTURA.
 * Obras existentes são atualizadas; as novas, incluídas. Nenhuma obra é excluída.
 */
async function importFile({ buffer, fileName, user }) {
  const sheets = await readSheets(buffer, fileName);
  const COLS = {
    centroLucro: ['centro_lucro', 'centro_de_lucro', 'prctr'],
    siglaGerencial: ['sigla_gerencial', 'sigla_bpc'],
    siglaObra: ['sigla_obra'],
    estrutura: ['estrutura'],
  };
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 15); h++) {
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(String(c ?? '')));
      const map = {};
      for (const [k, names] of Object.entries(COLS)) { const i = header.findIndex((x) => names.includes(x)); if (i >= 0) map[k] = i; }
      if (!('centroLucro' in map) || !('siglaObra' in map) || !('estrutura' in map)) continue;

      const now = new Date().toISOString();
      const by = user?.name || user?.email || 'importação';
      const byKey = new Map();
      const invalid = [];
      let duplicadas = 0;
      for (let i = h + 1; i < sheet.rows.length; i++) {
        const r = sheet.rows[i];
        if (!r || !r.some((c) => c != null && String(c).trim() !== '')) continue;
        const { obra, errors } = normalize({
          centroLucro: r[map.centroLucro], siglaGerencial: r[map.siglaGerencial], siglaObra: r[map.siglaObra], estrutura: r[map.estrutura],
        });
        if (Object.keys(errors).length) { if (invalid.length < 20) invalid.push(`Linha ${i + 1}: ${Object.values(errors)[0]}`); continue; }
        if (byKey.has(obra.centroLucro)) duplicadas++;
        byKey.set(obra.centroLucro, { ...obra, createdAt: now, updatedAt: now, updatedBy: by }); // repetido: vale a última linha
      }
      if (!byKey.size) throw new ObraError('Nenhuma obra válida encontrada no arquivo.');
      const existentes = new Set((await all()).map((o) => o.centroLucro));
      const list = [...byKey.values()];
      await obras.saveMany(list);
      invalidate();
      return {
        fileName, total: list.length,
        novas: list.filter((o) => !existentes.has(o.centroLucro)).length,
        atualizadas: list.filter((o) => existentes.has(o.centroLucro)).length,
        duplicadas, invalidas: invalid,
      };
    }
  }
  throw new ObraError('Cabeçalho não reconhecido. Colunas esperadas: CENTRO_LUCRO, SIGLA_GERENCIAL, SIGLA_OBRA, ESTRUTURA.');
}

module.exports = { all, find, save, remove, search, estruturas, importFile, normalize, ObraError };
