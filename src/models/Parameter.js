/**
 * Model de parâmetros (dados-base): importação, cache em memória com índices,
 * consultas paginadas, checagens de consistência e funções de busca (lookup)
 * usadas pelos relatórios.
 */
const definitions = require('../config/parameters');
const { params } = require('../repositories');
const { readSheets } = require('../services/sheetReader');
const { parseParameter, ParamError } = require('../services/paramParsers');

const byId = Object.fromEntries(definitions.map((d) => [d.id, d]));
/** Normaliza códigos SAP para busca (ignora zeros à esquerda e caixa) */
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const normKey = (v) => String(v ?? '').trim().toUpperCase().replace(/^0+(?=.)/, '');

// Cache: id → { rows, index: Map<chave normalizada, linhas[]> }
const cache = new Map();
let checksCache = null;

function getDef(id) {
  const d = byId[id];
  if (!d) { const e = new Error('Parâmetro não encontrado.'); e.status = 404; throw e; }
  return d;
}

async function load(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const def = getDef(id);
    const rows = (await params.getRows(id)) || [];
    const build = (field) => {
      const map = new Map();
      for (const r of rows) {
        const k = normKey(r[field]);
        if (!k) continue;
        const list = map.get(k);
        if (list) list.push(r); else map.set(k, [r]);
      }
      return map;
    };
    const index = build(def.key);
    const extra = Object.fromEntries((def.indexes || []).map((f) => [f, build(f)]));
    return { rows, index, extra };
  })();
  cache.set(id, p);
  try { return await p; } catch (e) { cache.delete(id); throw e; }
}

function invalidate(ids) {
  ids.forEach((id) => cache.delete(id));
  checksCache = null;
}

/**
 * Importa um arquivo. Um mesmo arquivo pode alimentar mais de uma tabela
 * (ex.: BPC BP_DRE.xlsx → bpc-dre e bpc-bp): passe vários ids.
 */
/**
 * Rotina de gravação dos parâmetros: tabela só com textos (a maioria: plano de contas, LFA1, KNA1, EKKO…)
 * é gravada compacta, em texto. Tabelas com números ficam no formato normal.
 */
function colunasCompactas(def, rows) {
  if (def.compactar) return def.compactar;
  if (def.type !== 'table' || !rows.length) return undefined;
  const cols = def.columns.map((c) => c.key);
  const soTexto = rows.every((r) => Object.keys(r).every((k) => cols.includes(k)) && cols.every((c) => r[c] == null || typeof r[c] === 'string'));
  return soTexto ? cols : undefined;
}

async function importFile(ids, { buffer, fileName, user }) {
  const sheets = await readSheets(buffer, fileName);
  const results = [];
  for (const id of ids) {
    const def = getDef(id);
    const { rows, skipped, sheet } = parseParameter(sheets, def);
    const record = await params.save(id, rows, { fileName, sheet, skipped, uploadedBy: user?.name || user?.email || 'sistema', compactar: colunasCompactas(def, rows) });
    results.push({ def, record });
  }
  invalidate(ids);
  return results;
}

/** Tabelas que um arquivo alimenta (BPC gera DRE + BP) */
function targetsFor(id) {
  const def = getDef(id);
  if (def.id.startsWith('bpc-')) return ['bpc-dre', 'bpc-bp'];
  return [def.id];
}

async function list() {
  const meta = Object.fromEntries((await params.list()).map((m) => [m.id, m]));
  return definitions.map((d) => ({ ...d, meta: meta[d.id] || null }));
}

/* ---------------------------------------------------------------- lookups */

/** Busca pelo campo-chave da tabela ou por um índice secundário (`field`) */
async function find(id, code, field) {
  const { index, extra } = await load(id);
  const map = field && field !== getDef(id).key ? extra[field] : index;
  if (!map) throw new Error(`Campo "${field}" não indexado em ${id}.`);
  return map.get(normKey(code)) || [];
}

/** Todas as linhas de uma tabela (somente leitura; usado em classificações em lote) */
async function all(id) {
  getDef(id);
  return (await load(id)).rows;
}

/** Nome do cliente/fornecedor pelo código (KNA1/LFA1) */
async function nameOf(id, code) {
  return (await find(id, code))[0]?.nome || null;
}

/** Classificação completa de uma conta do razão: plano, mapeamento gerencial e estrutura do Capital Empregado */
async function classifyAccount(conta) {
  let plano = await find('plano-contas', conta);
  const porGrupo = !plano.length;
  if (porGrupo) plano = await find('plano-contas', conta, 'contaGrupo'); // conta do grupo (ex.: BPC)
  const mapa = (await find('mapeamento-contas', conta))[0] || null;
  const ce = mapa ? (await find('estrutura-ce', mapa.codGerencial))[0] || null : null;
  const classes = [...new Set(plano.map((p) => p.classe).filter(Boolean))];
  return {
    conta,
    encontrada: plano.length > 0,
    tipo: plano.length ? (porGrupo ? 'conta do grupo' : 'conta do razão') : null,
    contaGrupo: plano[0]?.contaGrupo || mapa?.contaGrupo || null,
    descricao: porGrupo ? null : plano[0]?.descricao || mapa?.descricao || null,
    n1: plano[0]?.n1, n2: plano[0]?.n2, n3: plano[0]?.n3, n4: plano[0]?.n4,
    classes,
    classeAmbigua: classes.length > 1,
    gerencial: mapa ? { codigo: mapa.codGerencial, linha: mapa.descGerencial } : null,
    capitalEmpregado: ce ? { lado: ce.lado, grupo: ce.grupo, linha: ce.linha } : null,
  };
}

/* ------------------------------------------------------- checagens/filtros */

// Cada checagem define um filtro aplicável na tela de consulta (?filtro=<id>)
const CHECKS = {
  'plano-contas': [{
    id: 'divergentes', level: 'warn',
    label: (n, d) => `${fmtN(d)} conta(s) (${fmtN(n)} linhas) com classe BP/DRE divergente entre as linhas da mesma conta`,
    build: async ({ index }) => {
      const bad = new Set();
      for (const [k, list] of index) if (new Set(list.map((r) => r.classe)).size > 1) bad.add(k);
      return (r) => bad.has(normKey(r.conta));
    },
  }],
  'mapeamento-contas': [{
    id: 'sem-plano', level: 'warn',
    label: (n) => `${fmtN(n)} conta(s) não encontradas no Plano de Contas`,
    needs: ['plano-contas'],
    build: async () => { const { index } = await load('plano-contas'); return (r) => !index.has(normKey(r.conta)); },
  }, {
    id: 'fora-ce', level: 'info',
    label: (n) => `${fmtN(n)} conta(s) com código gerencial fora da estrutura do Capital Empregado (não entram no relatório)`,
    needs: ['estrutura-ce'],
    build: async () => { const { index } = await load('estrutura-ce'); return (r) => !index.has(normKey(r.codGerencial)); },
  }],
  'bpc-dre': [{
    id: 'sem-plano', level: 'info',
    label: (n) => `${fmtN(n)} conta(s) do grupo sem correspondência no Plano de Contas`,
    needs: ['plano-contas'],
    build: async () => { const grp = await groupAccounts(); return (r) => r.tipo === 'conta' && !grp.has(normKey(r.contaGrupo)); },
  }],
  'bpc-bp': [{
    id: 'sem-plano', level: 'info',
    label: (n) => `${fmtN(n)} conta(s) do grupo sem correspondência no Plano de Contas`,
    needs: ['plano-contas'],
    build: async () => { const grp = await groupAccounts(); return (r) => r.tipo === 'conta' && !grp.has(normKey(r.contaGrupo)); },
  }],
  'contas-fixas': [{
    id: 'sem-classe', level: 'info',
    label: (n) => `${fmtN(n)} linha(s) com classe de avaliação sem cadastro na T025`,
    needs: ['classes-avaliacao'],
    build: async () => { const { index } = await load('classes-avaliacao'); return (r) => !!r.classe && !index.has(normKey(r.classe)); },
  }],
  clientes: [dupCheck()],
  fornecedores: [dupCheck()],
};

function dupCheck() {
  return {
    id: 'duplicados', level: 'warn',
    label: (n) => `${fmtN(n)} registro(s) com código repetido`,
    build: async ({ index }) => (r) => (index.get(normKey(r.codigo)) || []).length > 1,
  };
}

const fmtN = (n) => n.toLocaleString('pt-BR');

async function groupAccounts() {
  const { rows } = await load('plano-contas');
  return new Set(rows.map((r) => normKey(r.contaGrupo)));
}

async function loadedIds() { return new Set((await params.list()).map((m) => m.id)); }

/** Executa todas as checagens aplicáveis (resultado em cache até a próxima importação) */
async function checks() {
  if (checksCache) return checksCache;
  checksCache = (async () => {
    const loaded = await loadedIds();
    const out = [];
    for (const [id, list] of Object.entries(CHECKS)) {
      if (!loaded.has(id)) continue;
      const data = await load(id);
      for (const c of list) {
        if ((c.needs || []).some((n) => !loaded.has(n))) continue;
        const pred = await c.build(data);
        const hits = data.rows.filter(pred);
        const key = getDef(id).key;
        const distinct = new Set(hits.map((r) => normKey(r[key]))).size;
        if (hits.length) out.push({ param: id, id: c.id, level: c.level, count: hits.length, text: c.label(hits.length, distinct) });
      }
    }
    return out;
  })();
  try { return await checksCache; } catch (e) { checksCache = null; throw e; }
}

/** Linhas paginadas com busca, ordenação e filtro de checagem */
async function getRows(id, { page = 1, size = 25, q = '', sort, dir = 'asc', filtro } = {}) {
  const def = getDef(id);
  const data = await load(id);
  let rows = data.rows;
  if (filtro) {
    const c = (CHECKS[id] || []).find((x) => x.id === filtro);
    if (c) rows = rows.filter(await c.build(data));
  }
  if (q) {
    const term = q.toLowerCase();
    rows = rows.filter((r) => Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(term)));
  }
  if (def.columns.some((c) => c.key === sort)) {
    const desc = dir === 'desc';
    if (rows === data.rows) {
      // Ordenação da tabela inteira fica em cache (ex.: LFA1 com 250 mil linhas)
      data.sorted ||= new Map();
      if (!data.sorted.has(sort)) data.sorted.set(sort, [...rows].sort((a, b) => collator.compare(a[sort] ?? '', b[sort] ?? '')));
      rows = data.sorted.get(sort);
      if (desc) rows = rows.slice().reverse();
    } else {
      rows = [...rows].sort((a, b) => collator.compare(a[sort] ?? '', b[sort] ?? '') * (desc ? -1 : 1));
    }
  }
  size = Math.min(Math.max(Number(size) || 25, 10), 200);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(Number(page) || 1, 1), pages);
  // _i = posição da linha na tabela inteira (usada para editar/excluir)
  if (!data.pos) { data.pos = new Map(); data.rows.forEach((r, i) => data.pos.set(r, i)); }
  return { total, page, pages, size, rows: rows.slice((page - 1) * size, page * size).map((r) => ({ ...r, _i: data.pos.get(r) })) };
}

/* ------------------------------------------------------- edição de linhas */

/** Valores do formulário → linha da tabela (só as colunas da definição; números convertidos) */
function linhaDoFormulario(def, valores) {
  const out = {};
  for (const c of def.columns) {
    if (!(c.key in (valores || {}))) continue;
    let v = String(valores[c.key] ?? '').trim().slice(0, 300);
    if (c.type === 'number') v = v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'));
    out[c.key] = v;
  }
  return out;
}

async function gravarTabela(id, rows, user, acao) {
  const def = getDef(id);
  const meta = (await params.list()).find((m) => m.id === id) || {};
  const { id: _id, rows: _n, updatedAt, ...resto } = meta;
  const record = await params.save(id, rows, { ...resto, uploadedBy: `${user?.name || user?.email || 'sistema'} (${acao})`, compactar: colunasCompactas(def, rows) });
  invalidate([id]);
  return record;
}

/** Confere se a linha i ainda é a mesma que o usuário viu (ninguém alterou a tabela no meio) */
function conferir(def, rows, i, chave) {
  const r = rows[i];
  if (!r) throw new ParamError('Registro não encontrado. Recarregue a página.');
  if (normKey(r[def.key]) !== normKey(chave)) throw new ParamError('A tabela mudou desde que você abriu a página. Recarregue e tente de novo.');
  return r;
}

function validar(def, linha) {
  const falta = def.columns.filter((c) => c.required && (linha[c.key] == null || linha[c.key] === ''));
  if (falta.length) throw new ParamError(`Preencha: ${falta.map((c) => c.label).join(', ')}.`);
  const num = def.columns.find((c) => c.type === 'number' && linha[c.key] != null && !Number.isFinite(linha[c.key]));
  if (num) throw new ParamError(`"${num.label}" precisa ser um número.`);
}

async function updateRow(id, i, valores, chaveOriginal, user) {
  const def = getDef(id);
  const rows = [...(await load(id)).rows];
  const atual = conferir(def, rows, Number(i), chaveOriginal);
  const nova = { ...atual, ...linhaDoFormulario(def, valores) };
  validar(def, nova);
  rows[Number(i)] = nova;
  await gravarTabela(id, rows, user, 'edição');
  return nova;
}

async function deleteRow(id, i, chaveOriginal, user) {
  const def = getDef(id);
  const rows = [...(await load(id)).rows];
  conferir(def, rows, Number(i), chaveOriginal);
  rows.splice(Number(i), 1);
  await gravarTabela(id, rows, user, 'exclusão');
}

/**
 * Vincula uma conta do razão sem classificação: copia do Plano de Contas a classificação de uma
 * conta de referência (conta do grupo, N1 a N4 e classe BP/DRE) e, se a referência tiver,
 * também a linha gerencial do Mapeamento de Contas (Capital Empregado).
 */
async function vincularConta({ conta, referencia, descricao }, user) {
  const c = String(conta || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{4,20}$/.test(c)) throw new ParamError('Conta inválida.');
  if ((await find('plano-contas', c)).length) throw new ParamError(`A conta ${c} já está no Plano de Contas.`);
  const ref = (await find('plano-contas', String(referencia || '').trim()))[0];
  if (!ref) throw new ParamError('Escolha uma conta de referência que exista no Plano de Contas.');
  const desc = String(descricao || '').trim().slice(0, 120) || ref.descricao || '';
  const plano = await addRow('plano-contas', {
    conta: c, contaGrupo: ref.contaGrupo, descricao: desc, n1: ref.n1 || '', n2: ref.n2 || '', n3: ref.n3 || '', n4: ref.n4 || '', classe: ref.classe || '',
  }, user);
  let mapeamento = null;
  const loaded = await loadedIds();
  if (loaded.has('mapeamento-contas') && !(await find('mapeamento-contas', c)).length) {
    const m = (await find('mapeamento-contas', ref.conta))[0];
    if (m) mapeamento = await addRow('mapeamento-contas', { contaGrupo: m.contaGrupo || ref.contaGrupo, conta: c, descricao: desc, codGerencial: m.codGerencial, descGerencial: m.descGerencial || '' }, user);
  }
  return { plano, mapeamento };
}

async function addRow(id, valores, user) {
  const def = getDef(id);
  const nova = linhaDoFormulario(def, valores);
  validar(def, nova);
  const rows = [...(await load(id)).rows, nova];
  await gravarTabela(id, rows, user, 'inclusão');
  return nova;
}

module.exports = {
  definitions, getDef, list, importFile, targetsFor, getRows, checks, CHECKS,
  find, all, nameOf, classifyAccount, normKey, ParamError, loadedIds, colunasCompactas, updateRow, deleteRow, addRow, vincularConta,
};
