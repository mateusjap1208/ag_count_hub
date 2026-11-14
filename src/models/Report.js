/**
 * Model de relatórios contábeis: importação (.txt/.xlsx e FGI0), consultas agregadas e linhas paginadas.
 *
 * Escopo de consulta: { period, company, moeda }
 *   company: código da empresa ou 'all' (consolidado)
 *   moeda (só relatórios do FGI0): 'grupo' | 'empresa:<código da moeda>'
 *     Na moeda da empresa o consolidado soma apenas empresas com a mesma moeda (não se somam BRL e ARS).
 */
const { datasets } = require('../repositories');
const { modules, bySlug } = require('../config/modules');
const parser = require('../services/txtParser');
const agg = require('../services/aggregator');
const cache = require('../services/cache');
const fgi0 = require('../services/fgi0');
const arrendamento = require('../services/arrendamento');
const estoque = require('../services/estoque');
const { resolvePeriod, CompetenciaError } = require('../utils/competencia');
const { statusGiro } = require('../config/modules');
const { readSheets } = require('../services/sheetReader');
const Company = require('./Company');
const Parameter = require('./Parameter');
const Obra = require('./Obra');

const ALL = 'all';
const FGI0_MODULES = modules.filter((m) => m.source === 'fgi0').map((m) => m.slug);
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function getModule(slug) {
  const m = bySlug[slug];
  if (!m) { const e = new Error('Módulo não encontrado.'); e.status = 404; throw e; }
  return m;
}

const parseMoeda = (moeda) => {
  const [type, cur] = String(moeda || 'grupo').split(':');
  return { type: type === 'empresa' ? 'empresa' : 'grupo', cur: cur || null };
};

/** Filtro de cargas para um módulo e escopo */
function scopeFilter(def, { period, company, moeda, moedaContrato }) {
  const f = { module: def.slug, period };
  if (company && company !== ALL) f.company = company;
  let currency = null;
  if (usesGroupCurrency(def)) {
    const m = parseMoeda(moeda);
    f.currencyType = m.type;
    if (m.type === 'empresa' && (!company || company === ALL)) currency = m.cur;
  } else if (def.source === 'arrendamento') {
    // Arrendamento: cargas separadas pela moeda do contrato (guardada em currencyType)
    f.currencyType = moedaContrato || 'BRL';
  } else {
    f.currencyType = null;
  }
  return { filter: f, currency };
}
/** Módulos com centro de lucro nas linhas (aceitam os filtros de obra) */
const hasCentro = (def) => def.source === 'fgi0' || def.source === 'arrendamento';
/** Módulos com o esquema de moedas do FGI0 (moeda do grupo × moeda da empresa) */
function usesGroupCurrency(def) { return def.source === 'fgi0' || def.currencyMode === 'grupo-empresa'; }
/** Filtros de linha próprios do módulo (ex.: Status Giro do estoque) ativos no escopo */
const activeRowFilters = (def, s) => (def.rowFilters || []).filter((f) => s.rowFilters?.[f.param]);
const rowFilterKey = (def, s) => activeRowFilters(def, s).map((f) => `${f.param}=${s.rowFilters[f.param]}`).join('&');
// A chave de cache inclui a permissão do usuário (allowedKey): usuários com centros diferentes nunca compartilham resultados
const scopeKey = (slug, s) => {
  const def = bySlug[slug];
  const a = `|A${s.allowedKey || ''}`;
  if (def?.source === 'fgi0') return `${slug}|${s.period}|${s.company}|${s.moeda}|${s.estrutura || ''}|${s.sigla || ''}|${s.centro || ''}${a}`;
  if (def?.source === 'arrendamento') return `${slug}|${s.period}|${s.company}|${s.moedaContrato || 'BRL'}|${s.estrutura || ''}|${s.sigla || ''}|${s.centro || ''}${a}`;
  if (def && usesGroupCurrency(def)) return `${slug}|${s.period}|${s.company}|${s.moeda}|${rowFilterKey(def, s)}${a}`;
  return `${slug}|${s.period}|${s.company}|-${a}`;
};
/** Escopo base (sem filtros de obra). Mantém a permissão: as linhas carregadas já respeitam o usuário. */
const baseScope = (s) => ({ period: s.period, company: s.company, moeda: s.moeda, moedaContrato: s.moedaContrato, allowed: s.allowed, allowedKey: s.allowedKey });
const upper = (v) => String(v ?? '').trim().toUpperCase();

/**
 * Centros de lucro do escopo: filtros de obra (Estrutura → Sigla → Centro de lucro)
 * intersectados com os centros liberados ao usuário. null = sem restrição.
 */
async function centroFilter(scope) {
  let set = null;
  if (scope.centro) set = new Set([upper(scope.centro)]);
  else if (scope.estrutura || scope.sigla) {
    const obras = await effectiveObras(scope.period, scope.moeda);
    set = new Set(obras
      .filter((o) => (!scope.estrutura || o.estrutura === scope.estrutura) && (!scope.sigla || o.siglaObra === scope.sigla))
      .map((o) => o.centroLucro));
  }
  if (scope.allowed) set = set ? new Set([...set].filter((c) => scope.allowed.has(c))) : new Set(scope.allowed);
  return set;
}

/** Empresas liberadas ao usuário (as que têm algum centro de lucro permitido). null = todas. */
async function allowedCompanies(scope) {
  if (!scope.allowed) return null;
  const map = await companyCentros(scope.period, scope.moeda);
  return new Set([...map].filter(([, set]) => [...set].some((c) => scope.allowed.has(c))).map(([code]) => code));
}

function clearCaches() {
  cache.summaries.clear();
  cache.rows.clear();
}

/* --------------------------------------------------------------- importação */

/** Relatórios simples (clientes, fornecedores…): aceita .txt, .csv ou .xlsx */
/** Competência da carga (nome do arquivo ou tela), convertida no erro de validação do importador */
function periodOf(fileName, informed, ErrorClass) {
  try {
    return resolvePeriod(fileName, informed).period;
  } catch (e) {
    if (e instanceof CompetenciaError) { const err = new ErrorClass(e.message); err.code = 'COMPETENCIA'; throw err; }
    throw e;
  }
}

async function importFile({ module, period: periodIn, company, buffer, fileName, user }) {
  const def = getModule(module);
  if (def.source) throw new parser.ParseError(`"${def.title}" tem importação própria. Escolha o relatório correspondente na lista.`);
  const period = periodOf(fileName, periodIn, parser.ParseError);
  let result;
  if (/\.xlsx$/i.test(fileName)) {
    const sheets = await readSheets(buffer, fileName);
    result = parser.parseTable(sheets[0].rows, def);
  } else {
    result = parser.parse(buffer, def);
  }
  const { rows, warnings, delimiter } = result;
  if (def.nameLookup) await fillNames(rows, def.nameLookup, warnings);
  const summary = agg.computeSummary(rows, def, period);
  const record = await datasets.save({
    module, period, company, currencyType: null, rows, summary,
    meta: { fileName, uploadedBy: user?.name || user?.email || 'sistema', warnings: warnings.length },
  });
  clearCaches();
  return { record, warnings, delimiter };
}

/**
 * FGI0 — saldos contábeis: gera BP, DRE e Capital Empregado de todas as empresas do arquivo.
 * Competência e tipo de moeda vêm do nome do arquivo (ou dos campos informados na tela).
 */
async function importFgi0({ buffer, fileName, user, period: periodIn, currencyType: ctIn }) {
  const period = periodOf(fileName, periodIn, fgi0.Fgi0Error);
  const data = await fgi0.readFgi0(buffer, fileName);
  const currencyType = ctIn || data.currencyType;
  if (!currencyType) throw new fgi0.Fgi0Error('Tipo de moeda não identificado. Informe "Moeda do grupo" ou "Moeda da empresa" na tela.');

  const built = await fgi0.buildReports(data.rows);
  const batch = `fgi0:${period}:${currencyType}`;
  const uploadedBy = user?.name || user?.email || 'sistema';
  const items = [];
  for (const [company, comp] of built.byCompany) {
    for (const slug of FGI0_MODULES) {
      const rows = slug === 'bp' ? comp.bp : slug === 'dre' ? comp.dre : comp.ce;
      if (!rows.length) continue;
      const def = getModule(slug);
      items.push({
        module: slug, period, company, currencyType, rows,
        summary: agg.computeSummary(rows, def, period),
        meta: { fileName, uploadedBy, batch, source: 'fgi0', currency: comp.moeda || null, warnings: 0 },
      });
    }
  }

  // Substitui a carga anterior da mesma competência e moeda (inclusive empresas que saíram do arquivo)
  await datasets.removeWhere({ batch });
  for (let i = 0; i < items.length; i += 60) await datasets.saveMany(items.slice(i, i + 60));

  // Empresas novas são cadastradas automaticamente (nome pelo parâmetro T001, se carregado)
  const known = new Set((await Company.list()).map((c) => c.code));
  for (const code of built.byCompany.keys()) {
    if (!known.has(code)) await Company.upsert({ code, name: (await Parameter.nameOf('empresas', code)) || code });
  }
  clearCaches();

  const naoClass = built.naoClassificadas;
  const curCount = new Map();
  for (const c of built.byCompany.values()) curCount.set(c.moeda, (curCount.get(c.moeda) || 0) + 1);
  return {
    period, currencyType, fileName,
    mainCurrency: [...curCount].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    currencies: [...curCount].sort((a, b) => b[1] - a[1]).map(([cur, n]) => ({ cur, n })),
    companies: built.byCompany.size,
    rows: data.rows.length,
    datasets: items.length,
    ambiguas: built.ambiguas,
    ignoradas: built.ignoradas,
    herdadas: { contas: built.herdadas.length, top: built.herdadas.slice(0, 8) },
    naoClassificadas: { contas: naoClass.length, saldo: naoClass.reduce((a, x) => a + x.saldo, 0), top: naoClass.slice(0, 8) },
  };
}

/**
 * Arrendamento (IFRS 16): grava a fotografia da competência, separada por empresa e moeda do contrato.
 * Uma nova carga da mesma competência substitui a anterior.
 */
async function importArrendamento({ buffer, fileName, user, period }) {
  const snap = await arrendamento.buildSnapshot(buffer, fileName, periodOf(fileName, period, arrendamento.ArrendamentoError));
  const def = getModule('arrendamento');
  const batch = `arrendamento:${snap.period}`;
  const uploadedBy = user?.name || user?.email || 'sistema';
  const items = [];
  const totals = new Map();
  for (const [company, comp] of snap.byCompany) {
    const byCur = new Map();
    for (const r of comp.rows) (byCur.get(r.moeda) || byCur.set(r.moeda, []).get(r.moeda)).push(r);
    for (const [cur, rows] of byCur) {
      items.push({
        module: 'arrendamento', period: snap.period, company, currencyType: cur, rows,
        summary: agg.computeSummary(rows, def, snap.period),
        meta: { fileName, uploadedBy, batch, source: 'arrendamento', currency: cur, warnings: 0 },
      });
      const t = totals.get(cur) || { moeda: cur, contratos: 0, direitoUso: 0, passivo: 0 };
      t.contratos += new Set(rows.map((r) => r.contrato)).size;
      t.direitoUso += rows.reduce((a, r) => a + r.ativoFinal, 0);
      t.passivo += rows.reduce((a, r) => a + r.passivoFinal, 0);
      totals.set(cur, t);
    }
  }
  await datasets.removeWhere({ batch });
  for (let i = 0; i < items.length; i += 60) await datasets.saveMany(items.slice(i, i + 60));
  const known = new Set((await Company.list()).map((c) => c.code));
  for (const code of snap.byCompany.keys()) {
    if (!known.has(code)) await Company.upsert({ code, name: (await Parameter.nameOf('empresas', code)) || code });
  }
  clearCaches();
  return { fileName, period: snap.period, months: snap.months, ...snap.stats, totais: [...totals.values()].sort((a, b) => b.contratos - a.contratos) };
}

/**
 * Estoque (ZL0190): por empresa, uma carga na moeda do grupo (M2) e outra na moeda da empresa (MI).
 * Calcula dias sem movimento e Status Giro em relação ao último dia da competência.
 */
async function importEstoque({ buffer, fileName, user, period: periodIn }) {
  const period = periodOf(fileName, periodIn, estoque.EstoqueError);
  const data = await estoque.read(buffer, fileName);
  const def = getModule('estoque');
  const ref = agg.periodEnd(period);
  const batch = `estoque:${period}`;
  const uploadedBy = user?.name || user?.email || 'sistema';
  const giro = new Map();
  const items = [];
  for (const [company, comp] of data.byCompany) {
    for (const r of comp.rows) {
      const dias = r.ultimoMovimento ? Math.max(0, Math.floor((ref - Date.parse(r.ultimoMovimento)) / 86400000)) : null;
      r.diasSemMov = dias;
      r.statusGiro = statusGiro(dias);
    }
    // Moeda interna: a informada no arquivo; senão, a da empresa no FGI0 da competência; senão BRL
    const moedaMI = [...comp.moedas].sort((a, b) => b[1] - a[1])[0]?.[0] || (await companyCurrency(period, company)) || 'BRL';
    const variants = [['empresa', 'MI', moedaMI]];
    if (data.hasM2) variants.push(['grupo', 'M2', 'USD']);
    for (const [currencyType, which, currency] of variants) {
      const rows = estoque.rowsFor(comp.rows, which);
      items.push({
        module: 'estoque', period, company, currencyType, rows,
        summary: agg.computeSummary(rows, def, period),
        meta: { fileName, uploadedBy, batch, source: 'estoque', currency, warnings: 0 },
      });
      if (which === 'MI' && moedaMI === 'BRL') rows.forEach((r) => giro.set(r.statusGiro, (giro.get(r.statusGiro) || 0) + r.valor));
    }
  }
  await datasets.removeWhere({ batch });
  for (let i = 0; i < items.length; i += 60) await datasets.saveMany(items.slice(i, i + 60));
  const known = new Set((await Company.list()).map((c) => c.code));
  for (const code of data.byCompany.keys()) if (!known.has(code)) await Company.upsert({ code, name: (await Parameter.nameOf('empresas', code)) || code });
  clearCaches();
  return {
    fileName, period, linhas: data.linhas, empresas: data.byCompany.size,
    giroBRL: ['Saudável', 'Atenção', 'Baixo Giro', 'Obsoleto', 'Sem dados'].map((s) => ({ status: s, valor: giro.get(s) || 0 })),
  };
}

/** Moedas de contrato com arrendamento na competência (BRL, EUR, COP…) */
async function leaseCurrencies(period) {
  if (!period) return [];
  return cache.summaries.wrap(`lease-cur|${period}`, async () => {
    const m = new Map();
    for (const d of await datasets.list({ module: 'arrendamento', period })) m.set(d.currencyType, (m.get(d.currencyType) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([cur, n]) => ({ code: cur, empresas: n, symbol: currencySymbol(cur), flag: currencyFlag(cur) }));
  });
}

/** Preenche nomes vazios a partir do cadastro mestre (KNA1/LFA1) */
async function fillNames(rows, { param, codeField, nameField }, warnings) {
  let missing = 0;
  for (const r of rows) {
    if (r[nameField]) continue;
    r[nameField] = (await Parameter.nameOf(param, r[codeField])) || '';
    if (!r[nameField]) { r[nameField] = `Código ${r[codeField]}`; missing++; }
  }
  if (missing) warnings.push(`${missing} código(s) sem nome no cadastro mestre (${Parameter.getDef(param).title}).`);
}

async function removeDataset(key) {
  await datasets.remove(key);
  clearCaches();
}

async function removeBatch(batch) {
  const n = await datasets.removeWhere({ batch });
  clearCaches();
  return n;
}

async function listUploads(filter) {
  const list = await datasets.list(filter);
  return list.sort((a, b) => b.period.localeCompare(a.period) || a.module.localeCompare(b.module) || a.company.localeCompare(b.company));
}

/* ---------------------------------------------------------------- consultas */

/** Períodos disponíveis (mais recente primeiro) */
async function periods() {
  return cache.summaries.wrap('periods', async () =>
    [...new Set((await datasets.list()).map((d) => d.period))].sort().reverse());
}

/**
 * Símbolo exibido no ícone de cada moeda (pacote currency-symbol-map).
 * Moedas que o pacote não conhece (ex.: VED, bolívar digital de 2021) usam um símbolo de reserva ou o próprio código.
 */
const getSymbolFromCurrency = require('currency-symbol-map');
const FALLBACK_SYMBOLS = { VED: 'Bs.D' };
const currencySymbol = (cur) => getSymbolFromCurrency(cur) || FALLBACK_SYMBOLS[cur] || cur || '¤';

/**
 * Bandeira usada como ícone da moeda (pacote flag-icons, SVG servido em /vendor/flags).
 * Pela ISO 4217 as duas primeiras letras do código da moeda são o país; o euro usa a bandeira da UE.
 */
const fs = require('node:fs');
const pathMod = require('node:path');
const FLAG_DIR = pathMod.join(__dirname, '..', '..', 'node_modules', 'flag-icons', 'flags', '1x1');
const FLAG_OVERRIDES = { EUR: 'eu', XAF: 'cm', XOF: 'sn', XCD: 'ag', ANG: 'cw' };
const flagCache = new Map();
function currencyFlag(cur) {
  if (!cur) return null;
  if (flagCache.has(cur)) return flagCache.get(cur);
  const code = FLAG_OVERRIDES[cur] || cur.slice(0, 2).toLowerCase();
  const ok = fs.existsSync(pathMod.join(FLAG_DIR, `${code}.svg`));
  flagCache.set(cur, ok ? `/vendor/flags/${code}.svg` : null);
  return flagCache.get(cur);
}

/** Opções de moeda disponíveis numa competência (para o filtro das telas) */
async function currencyOptions(period) {
  if (!period) return [];
  return cache.summaries.wrap(`cur|${period}`, async () => {
    const list = await datasets.list({ period, module: 'bp' });
    const grupo = list.filter((d) => d.currencyType === 'grupo');
    const opts = [];
    const opt = (value, type, cur, count) => ({
      value, type, currency: cur, count, symbol: currencySymbol(cur), flag: currencyFlag(cur),
      label: `${type === 'grupo' ? 'Moeda do grupo' : 'Moeda da empresa'} · ${cur}`,
    });
    if (grupo.length) opts.push(opt('grupo', 'grupo', grupo[0].currency || 'USD', grupo.length));
    const byCur = new Map();
    list.filter((d) => d.currencyType === 'empresa').forEach((d) => byCur.set(d.currency, (byCur.get(d.currency) || 0) + 1));
    [...byCur].sort((a, b) => b[1] - a[1]).forEach(([cur, n]) => opts.push(opt(`empresa:${cur}`, 'empresa', cur, n)));
    return opts;
  });
}

/** Moeda das empresas na moeda local (para exibir a moeda certa ao filtrar uma empresa) */
async function companyCurrency(period, company) {
  if (!period || !company || company === ALL) return null;
  return cache.summaries.wrap(`cc|${period}|${company}`, async () =>
    (await datasets.list({ period, company, module: 'bp', currencyType: 'empresa' }))[0]?.currency || null);
}

/** Código da moeda em que os valores do escopo estão expressos */
async function displayCurrency(def, scope) {
  if (def.source === 'arrendamento') return scope.moedaContrato || 'BRL';
  if (!usesGroupCurrency(def)) return 'BRL';
  const m = parseMoeda(scope.moeda);
  if (m.type === 'grupo') return (await currencyOptions(scope.period)).find((o) => o.value === 'grupo')?.currency || 'USD';
  if (scope.company && scope.company !== ALL) {
    const own = (await datasets.list({ module: def.slug, period: scope.period, company: scope.company, currencyType: 'empresa' }))[0]?.currency;
    if (own) return own;
  }
  return (await companyCurrency(scope.period, scope.company)) || m.cur || 'BRL';
}

/** Aplica os filtros de linha do módulo (ex.: Status Giro) */
function applyRowFilters(def, scope, rows) {
  let out = rows;
  for (const f of activeRowFilters(def, scope)) out = out.filter((r) => r[f.field] === scope.rowFilters[f.param]);
  return out;
}

/** Resumo de um módulo para uma empresa ou para o consolidado (soma de resumos, sem reprocessar linhas) */
async function getSummary(slug, scope) {
  const def = getModule(slug);
  return cache.summaries.wrap(`s|${scopeKey(slug, scope)}`, async () => {
    // Filtro de obra (estrutura/sigla/centro): recalcula o resumo a partir das linhas filtradas
    const centros = hasCentro(def) ? await centroFilter(scope) : null;
    if (centros || activeRowFilters(def, scope).length) {
      let rows = await loadRawRows(slug, baseScope(scope));
      if (centros) rows = rows.filter((r) => centros.has(upper(r.centroLucro)));
      rows = applyRowFilters(def, scope, rows);
      return rows.length ? agg.computeSummary(rows, def, scope.period) : null;
    }
    const { filter, currency } = scopeFilter(def, scope);
    let parts = await datasets.getSummaries(filter);
    if (currency) parts = parts.filter((p) => p.currency === currency);
    // Relatórios sem centro de lucro nas linhas: restringe às empresas liberadas ao usuário
    const empresas = await allowedCompanies(scope);
    if (empresas) parts = parts.filter((p) => empresas.has(p.company));
    if (!parts.length) return null;
    return agg.mergeSummaries(parts.map((p) => p.summary).filter(Boolean));
  });
}

/** Dados prontos para a tela do módulo: KPIs, gráficos e demonstração */
async function getModuleView(slug, scope) {
  const def = getModule(slug);
  const summary = scope.period ? await getSummary(slug, scope) : null;
  const currency = await displayCurrency(def, scope);
  if (!summary) return { def, empty: true, currency };
  return {
    def,
    empty: false,
    currency,
    count: summary.count,
    kpis: def.kpis(summary),
    charts: def.breakdowns.filter((b) => b.chart).map((b) => ({
      id: b.id, label: b.label, type: b.chart,
      isCount: b.value === '_count',
      ...agg.breakdownSeries(b, summary.breakdowns[b.id], def),
    })),
    statement: def.statementFn ? def.statementFn(summary) : agg.buildStatement(def, summary),
    tree: agg.buildTree(def, summary),
  };
}

/** Linhas completas (com campos internos) de empresa/competência/moeda — base para filtros de obra */
async function loadRawRows(slug, scope) {
  const def = getModule(slug);
  // Módulos com centro de lucro: linhas brutas compartilhadas (a permissão é aplicada depois, por centro);
  // demais módulos: linhas já restritas às empresas liberadas ao usuário
  const s = hasCentro(def) ? { ...baseScope(scope), allowed: null, allowedKey: '' } : baseScope(scope);
  return cache.rows.wrap(`r|${scopeKey(slug, s)}`, async () => {
    const { filter, currency } = scopeFilter(def, s);
    let meta = await datasets.list(filter);
    if (currency) meta = meta.filter((d) => d.currency === currency);
    const empresas = await allowedCompanies(s);
    if (empresas) meta = meta.filter((d) => empresas.has(d.company));
    const companies = Object.fromEntries((await Company.list()).map((c) => [c.code, c.name]));
    const parts = await Promise.all(meta.map(async (d) =>
      (await datasets.getRows(d)).map((r) => ({ empresa: companies[d.company] || d.company, ...r }))));
    return parts.flat();
  });
}

/** Linhas do escopo (com filtro de obra aplicado), sem campos internos */
async function loadRows(slug, scope) {
  const def = getModule(slug);
  let rows = await loadRawRows(slug, scope);
  const centros = hasCentro(def) ? await centroFilter(scope) : null;
  if (centros) rows = rows.filter((r) => centros.has(upper(r.centroLucro)));
  return applyRowFilters(def, scope, rows);
}
const stripInternal = ({ arvore, ...r }) => r;

/** Linhas paginadas com busca e ordenação (server-side, para arquivos grandes) */
async function getRows(slug, scope, { page = 1, size = 25, q = '', sort, dir = 'asc' } = {}) {
  const def = getModule(slug);
  let rows = await loadRows(slug, scope);
  if (q) {
    const term = q.toLowerCase();
    rows = rows.filter((r) => Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(term)));
  }
  const validSort = sort === 'empresa' || def.columns.some((c) => c.key === sort);
  if (validSort) {
    const mult = dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const x = a[sort]; const y = b[sort];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * mult;
      return collator.compare(String(x ?? ''), String(y ?? '')) * mult;
    });
  }
  size = Math.min(Math.max(Number(size) || 25, 10), 200);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(Number(page) || 1, 1), pages);
  return { total, page, pages, size, rows: rows.slice((page - 1) * size, page * size).map(stripInternal) };
}

/** Todas as linhas (exportação CSV) */
async function getAllRows(slug, scope) {
  getModule(slug);
  return (await loadRows(slug, scope)).map(stripInternal);
}

/**
 * Opções dos filtros em cascata: Estrutura → Sigla → Empresa → Centro de lucro.
 * A relação empresa × centro de lucro vem das cargas do FGI0 (competência e tipo de moeda).
 */
async function companyCentros(period, moeda) {
  if (!period) return new Map();
  const type = parseMoeda(moeda).type;
  return cache.summaries.wrap(`cc-map|${period}|${type}`, async () => {
    const map = new Map();
    for (const slug of ['bp', 'dre']) {
      const id = slug === 'bp' ? 'centros' : 'centro';
      for (const p of await datasets.getSummaries({ module: slug, period, currencyType: type })) {
        const set = map.get(p.company) || new Set();
        // "Não informado" = linha do FGI0 sem centro de lucro (guardada como '')
        Object.keys(p.summary?.breakdowns?.[id] || {}).forEach((c) => set.add(c === 'Não informado' ? '' : upper(c)));
        map.set(p.company, set);
      }
    }
    return map;
  });
}

/**
 * Cadastro de obras + "obras virtuais" para centros de lucro do FGI0 sem cadastro:
 * a sigla da obra repete o próprio centro de lucro e a estrutura fica "Sem cadastro de obra".
 */
const SEM_CADASTRO = 'Sem cadastro de obra';
async function effectiveObras(period, moeda) {
  const obras = await Obra.all();
  const known = new Set(obras.map((o) => o.centroLucro));
  const map = await companyCentros(period, moeda);
  const extra = [];
  for (const c of new Set([...map.values()].flatMap((s) => [...s]))) {
    if (!known.has(c)) extra.push({ centroLucro: c, siglaObra: c || '(SEM CENTRO)', siglaGerencial: '', estrutura: SEM_CADASTRO, virtual: true });
  }
  return extra.length ? obras.concat(extra) : obras;
}

async function filterOptions({ period, moeda, estrutura, sigla, company, allowed }) {
  const obras = await effectiveObras(period, moeda);
  const fullMap = await companyCentros(period, moeda);
  // Usuário restrito: só os seus centros de lucro (e as empresas que os possuem)
  const map = allowed
    ? new Map([...fullMap].map(([code, set]) => [code, new Set([...set].filter((c) => allowed.has(c)))]).filter(([, set]) => set.size))
    : fullMap;
  // Só obras com movimento no FGI0 da competência (evita escolher uma sigla que não tem dados)
  const comDados = new Set([...map.values()].flatMap((s) => [...s]));
  const obrasDados = obras.filter((o) => (!comDados.size && !allowed) || comDados.has(o.centroLucro) || (allowed && !fullMap.size && allowed.has(o.centroLucro)));
  const cont = new Map();
  obrasDados.forEach((o) => cont.set(o.estrutura, (cont.get(o.estrutura) || 0) + 1));
  const estruturas = [...cont.keys()].sort((a, b) => (a === SEM_CADASTRO) - (b === SEM_CADASTRO) || cont.get(b) - cont.get(a));
  const obrasEstr = estrutura ? obrasDados.filter((o) => o.estrutura === estrutura) : obrasDados;
  const siglas = [...new Set(obrasEstr.map((o) => o.siglaObra).filter(Boolean))].sort(collator.compare);
  const obraSet = (estrutura || sigla)
    ? new Set(obrasEstr.filter((o) => !sigla || o.siglaObra === sigla).map((o) => o.centroLucro))
    : null;
  let companies = obraSet ? [...map].filter(([, set]) => [...set].some((c) => obraSet.has(c))).map(([code]) => code) : null;
  if (!companies && allowed) companies = [...map.keys()];
  let centros = company && company !== ALL ? [...(map.get(company) || [])] : [...new Set([...map.values()].flatMap((s) => [...s]))];
  if (obraSet) centros = centros.filter((c) => obraSet.has(c));
  centros = centros.filter(Boolean); // linhas sem centro só pelo filtro de sigla "(SEM CENTRO)"
  const obraBy = new Map(obras.map((o) => [o.centroLucro, o]));
  return {
    estruturas,
    siglas,
    companies, // null = todas
    centros: centros.sort(collator.compare).map((c) => ({ code: c, siglaObra: obraBy.get(c)?.siglaObra || '' })),
  };
}

/** Série histórica de KPIs de um módulo (ex.: receita x lucro por mês) */
async function trend(slug, scope, limit = 12) {
  const def = getModule(slug);
  const all = (await periods()).slice(0, limit).reverse();
  const out = [];
  for (const p of all) {
    const s = await getSummary(slug, { ...scope, period: p });
    if (s) out.push({ period: p, kpis: def.kpis(s) });
  }
  return out;
}

module.exports = {
  ALL, modules, FGI0_MODULES, getModule, importFile, importFgi0, removeDataset, removeBatch, listUploads,
  periods, currencyOptions, displayCurrency, getSummary, getModuleView, getRows, getAllRows, trend, filterOptions,
  importArrendamento, importEstoque, leaseCurrencies, effectiveObras, companyCentros, allowedCompanies,
};
