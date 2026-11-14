const Report = require('../models/Report');
const Company = require('../models/Company');
const { ParseError } = require('../services/txtParser');
const { Fgi0Error } = require('../services/fgi0');
const { EstoqueError } = require('../services/estoque');
const { ArrendamentoError } = require('../services/arrendamento');

const layout = (slug, title, cols, req) => ({ slug, title, columns: cols.map((label, i) => ({ label, key: label, required: req.includes(i) })) });
const FGI0_LAYOUT = layout('fgi0', 'FGI0 — Saldos contábeis',
  ['Empresa', 'Centro de lucro', 'Nº conta', 'Moeda', 'Saldo acumulado', 'Área funcional', 'Tipo de moeda'], [0, 2, 4]);
const ESTOQUE_LAYOUT = layout('estoque', 'ZL0190 — Estoque',
  ['Centro', 'Depósito', 'Tipo de material', 'Empresa', 'Classe de avaliação', 'Material', 'Texto breve material', 'Qtd. Estoque no Depósito', 'Valor Total MI', 'Valor Total M2', 'Último movimento'], [3, 5, 8]);
const ARR_LAYOUT = layout('arrendamento', 'Arrendamento (IFRS 16)',
  ['Contrato avaliado', 'Ano civil', 'Período', 'Carteira final', 'Carteira final_2', 'Empresa', 'Centro de lucro'], [0, 3, 4, 5]);
const { ImportError } = require('../services/genericImport');
const AUTO_ERRORS = [ParseError, Fgi0Error, EstoqueError, ArrendamentoError, ImportError];
/** Relatórios que trazem a empresa no próprio arquivo (não pedem empresa na tela) */
const AUTO_SLUGS = () => ['fgi0', 'estoque', 'arrendamento', ...Report.modules.filter((m) => m.importer).map((m) => m.slug)];
const genericLayout = (m) => ({ slug: m.slug, title: m.importer.label, columns: Object.entries(m.importer.fields).map(([k, f]) => ({ label: f.label || f.names[0], key: f.label || f.names[0], required: m.importer.required.includes(k) })) });

/** Histórico: cada FGI0 vira uma linha (gera centenas de cargas: empresas × BP/DRE/CE) */
function groupUploads(uploads, companies) {
  const companyName = Object.fromEntries(companies.map((c) => [c.code, c.name]));
  const moduleName = Object.fromEntries(Report.modules.map((m) => [m.slug, m.menu]));
  const batches = new Map();
  const out = [];
  for (const u of uploads) {
    if (u.batch) {
      let b = batches.get(u.batch);
      if (!b) {
        b = {
          kind: 'fgi0', batch: u.batch, period: u.period, currencyType: u.currencyType, fileName: u.fileName,
          uploadedBy: u.uploadedBy, uploadedAt: u.uploadedAt, rows: 0, companies: new Set(), currencies: new Set(),
          moduleName: u.source === 'arrendamento' ? 'Arrendamento (IFRS 16)' : u.source === 'estoque' ? 'ZL0190 → Estoque'
            : Report.modules.find((m) => m.slug === u.source && m.importer)?.importer.label || 'FGI0 → BP, DRE e Capital Empregado',
          source: u.source,
        };
        batches.set(u.batch, b);
        out.push(b);
      }
      b.rows += u.rows;
      b.companies.add(u.company);
      if (u.currency) b.currencies.add(u.currency);
    } else {
      out.push({ ...u, kind: 'single', companyName: companyName[u.company] || u.company, moduleName: moduleName[u.module] || u.module });
    }
  }
  return out.map((u) => (u.kind === 'fgi0'
    ? {
      ...u,
      companyName: `${u.companies.size} empresa(s)`,
      moeda: (u.source === 'arrendamento' || Report.modules.some((m) => m.slug === u.source && m.importer)) ? `Moeda (${[...u.currencies].join(', ')})`
        : u.currencyType === 'grupo' ? `Moeda do grupo (${[...u.currencies].join(', ')})` : `Moeda da empresa (${[...u.currencies].length} moedas)`,
      companies: u.companies.size,
    }
    : u));
}

async function renderPage(res, extra = {}) {
  const uploads = groupUploads(await Report.listUploads(), res.locals.companies);
  const simple = Report.modules.filter((m) => !m.source && !m.inativo);
  const generic = Report.modules.filter((m) => m.importer);
  res.render('upload/index', {
    title: 'Upload de relatórios',
    hideFilters: true,
    uploads,
    uploadModules: [
      { slug: 'fgi0', title: 'FGI0 — Saldos contábeis (gera BP, DRE e Capital Empregado)' },
      { slug: 'estoque', title: 'ZL0190 — Estoque (posição e giro)' },
      { slug: 'arrendamento', title: 'Arrendamento (IFRS 16)' },
      ...generic.map((m) => ({ slug: m.slug, title: m.importer.label })),
      ...simple.map((m) => ({ slug: m.slug, title: m.title }))],
    layouts: [FGI0_LAYOUT, ESTOQUE_LAYOUT, ARR_LAYOUT, ...generic.map(genericLayout), ...simple.map((m) => ({ slug: m.slug, title: m.title, columns: m.columns.map((c) => ({ label: c.label, key: c.key, required: !!c.required })) }))],
    autoSlugs: AUTO_SLUGS(),
    result: null,
    error: null,
    form: {},
    ...extra,
  });
}

exports.index = async (req, res, next) => {
  try { await renderPage(res, { result: req.session.flash || null }); delete req.session.flash; } catch (e) { next(e); }
};

exports.upload = async (req, res, next) => {
  const form = { module: req.body.module, period: req.body.period, company: req.body.company, currencyType: req.body.currencyType };
  try {
    if (!req.file) throw new ParseError('Selecione o arquivo (.xlsx ou .txt).');

    const genericDef = Report.modules.find((m) => m.slug === req.body.module && m.importer);
    if (genericDef) {
      const result = await Report.importGeneric(genericDef.slug, { buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user, period: req.body.period || null });
      req.session.flash = { ok: true, generic: result };
      req.session.filter = { ...(req.session.filter || {}), periodo: result.period };
      return res.redirect('/upload');
    }
    if (req.body.module === 'estoque') {
      const result = await Report.importEstoque({ buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user, period: req.body.period || null });
      req.session.flash = { ok: true, estoque: result };
      req.session.filter = { ...(req.session.filter || {}), periodo: result.period };
      return res.redirect('/upload');
    }
    if (req.body.module === 'arrendamento') {
      const result = await Report.importArrendamento({ buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user, period: req.body.period || null });
      req.session.leaseFlash = result;
      req.session.filter = { ...(req.session.filter || {}), periodo: result.period };
      return res.redirect('/arrendamento/importar');
    }
    if (req.body.module === 'fgi0') {
      const result = await Report.importFgi0({
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        user: req.session.user,
        period: req.body.period || null,
        currencyType: ['grupo', 'empresa'].includes(req.body.currencyType) ? req.body.currencyType : null,
      });
      req.session.flash = { ok: true, fgi0: result };
      // Já abre os relatórios na competência e moeda importadas
      req.session.filter = {
        ...(req.session.filter || {}),
        periodo: result.period,
        moeda: result.currencyType === 'grupo' ? 'grupo' : `empresa:${result.mainCurrency}`,
      };
      return res.redirect('/upload');
    }

    let company = req.body.company;
    if (company === '__new__') {
      const c = await Company.upsert({ code: req.body.newCompanyCode, name: req.body.newCompanyName });
      company = c.code;
    } else if (!res.locals.companies.some((c) => c.code === company)) {
      throw new ParseError('Selecione a empresa.');
    }
    const { record, warnings } = await Report.importFile({
      module: req.body.module,
      period: req.body.period,
      company,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      user: req.session.user,
    });
    // Post/Redirect/Get: evita reenvio do arquivo ao atualizar a página
    req.session.flash = { ok: true, record, warnings };
    res.redirect('/upload');
  } catch (e) {
    if (AUTO_ERRORS.some((C) => e instanceof C) || e.status === 404 || /empresa|formato/i.test(e.message)) {
      res.status(422);
      return renderPage(res, { error: e.message, form }).catch(next);
    }
    next(e);
  }
};

/** Erros do multer (tamanho/tipo de arquivo) exibidos na própria tela */
exports.handleMulterError = (err, req, res, next) => {
  const known = err.name === 'MulterError' || err.status === 403 || /formato|\.txt|\.xlsx/i.test(err.message);
  if (!known) return next(err);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima do tamanho máximo permitido.' : err.message;
  res.status(422);
  renderPage(res, { error: msg, form: {} }).catch(next);
};

exports.remove = async (req, res, next) => {
  try {
    const { module, period, company, batch } = req.body;
    if (batch) await Report.removeBatch(String(batch));
    else await Report.removeDataset({ module, period, company, currencyType: null });
    req.session.flash = { ok: true, removed: true };
    res.redirect('/upload');
  } catch (e) { next(e); }
};

/** Modelo de arquivo .txt com o cabeçalho esperado do módulo */
exports.template = (req, res, next) => {
  try {
    const gen = Report.modules.find((m) => m.slug === req.params.slug && m.importer);
    const fixed = gen ? genericLayout(gen) : { fgi0: FGI0_LAYOUT, estoque: ESTOQUE_LAYOUT, arrendamento: ARR_LAYOUT }[req.params.slug];
    const cols = fixed
      ? fixed.columns.map((c) => c.label)
      : Report.getModule(req.params.slug).columns.map((c) => c.key);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="modelo_${req.params.slug}.txt"`);
    res.send(`﻿${cols.join('\t')}\r\n`);
  } catch (e) { next(e); }
};
