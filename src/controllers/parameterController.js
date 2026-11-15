const Parameter = require('../models/Parameter');
const { ParamError } = require('../services/paramParsers');

async function renderIndex(res, extra = {}) {
  const [tables, checks] = await Promise.all([Parameter.list(), Parameter.checks()]);
  const groups = [...new Set(tables.map((t) => t.group))].map((g) => ({ name: g, tables: tables.filter((t) => t.group === g) }));
  res.render('parameters/index', {
    title: 'Parâmetros',
    hideFilters: true,
    groups,
    checks: checks.map((c) => ({ ...c, title: Parameter.getDef(c.param).title })),
    loaded: tables.filter((t) => t.meta).length,
    storage: require('../config').storageDriver,
    total: tables.length,
    result: null,
    error: null,
    ...extra,
  });
}

exports.index = async (req, res, next) => {
  try {
    const result = req.session.paramFlash || null;
    delete req.session.paramFlash;
    await renderIndex(res, { result });
  } catch (e) { next(e); }
};

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) throw new ParamError('Selecione o arquivo.');
    const ids = Parameter.targetsFor(req.params.id);
    const results = await Parameter.importFile(ids, { buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user });
    req.session.paramFlash = {
      fileName: req.file.originalname,
      items: results.map(({ def, record }) => ({ title: def.title, rows: record.rows, skipped: record.skipped })),
    };
    res.redirect('/parametros');
  } catch (e) {
    if (e instanceof ParamError || e.status === 404 || /formato/i.test(e.message)) {
      res.status(422);
      return renderIndex(res, { error: e.message }).catch(next);
    }
    next(e);
  }
};

exports.uploadError = (err, req, res, next) => {
  const known = err.name === 'MulterError' || err.status === 403 || /formato/i.test(err.message);
  if (!known) return next(err);
  res.status(422);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima do tamanho máximo permitido.' : err.message;
  return renderIndex(res, { error: msg }).catch(next);
};

exports.show = async (req, res, next) => {
  try {
    const def = Parameter.getDef(req.params.id);
    const meta = (await Parameter.list()).find((t) => t.id === def.id).meta;
    const checks = (await Parameter.checks()).filter((c) => c.param === def.id);
    const filtro = checks.some((c) => c.id === req.query.filtro) ? req.query.filtro : '';
    res.render('parameters/show', {
      title: def.title,
      hideFilters: true,
      def,
      meta,
      checks,
      filtro,
      columns: def.columns.map(({ key, label, type }) => ({ key, label, type: type || 'string' })),
    });
  } catch (e) { next(e); }
};

exports.rows = async (req, res, next) => {
  try {
    const data = await Parameter.getRows(req.params.id, {
      page: req.query.page, size: req.query.size, q: String(req.query.q || '').slice(0, 100),
      sort: req.query.sort, dir: req.query.dir, filtro: req.query.filtro,
    });
    res.json(data);
  } catch (e) { next(e); }
};

/** Consulta rápida de classificação de uma conta (API) */
exports.classify = async (req, res, next) => {
  try { res.json(await Parameter.classifyAccount(String(req.params.conta).slice(0, 20))); } catch (e) { next(e); }
};

/* Edição de linhas da tabela de parâmetros (administradores) */
const responder = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, ...(await fn(req)) }); } catch (e) {
    if (e instanceof Parameter.ParamError) return res.status(400).json({ error: e.message });
    return next(e);
  }
};
exports.addRow = responder(async (req) => ({ linha: await Parameter.addRow(req.params.id, req.body?.valores, req.user) }));
exports.updateRow = responder(async (req) => ({ linha: await Parameter.updateRow(req.params.id, req.params.i, req.body?.valores, req.body?.chave, req.user) }));
exports.deleteRow = responder(async (req) => { await Parameter.deleteRow(req.params.id, req.params.i, req.body?.chave, req.user); return {}; });
