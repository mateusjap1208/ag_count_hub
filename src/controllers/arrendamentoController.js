const Report = require('../models/Report');
const { ArrendamentoError } = require('../services/arrendamento');

async function render(res, extra = {}) {
  const loads = (await Report.listUploads({ module: 'arrendamento' }));
  // Uma linha por competência (a carga gera um registro por empresa × moeda)
  const byBatch = new Map();
  for (const u of loads) {
    const b = byBatch.get(u.batch) || { period: u.period, fileName: u.fileName, uploadedBy: u.uploadedBy, uploadedAt: u.uploadedAt, empresas: new Set(), moedas: new Set(), linhas: 0, batch: u.batch };
    b.empresas.add(u.company); b.moedas.add(u.currencyType); b.linhas += u.rows;
    byBatch.set(u.batch, b);
  }
  const history = [...byBatch.values()].sort((a, b) => b.period.localeCompare(a.period))
    .map((b) => ({ ...b, empresas: b.empresas.size, moedas: [...b.moedas].join(', ') }));
  res.render('arrendamento/import', {
    title: 'Importar arrendamento', hideFilters: true, subtitle: 'IFRS 16 · cronograma de contratos',
    history, result: null, error: null, form: {}, ...extra,
  });
}

exports.index = async (req, res, next) => {
  try {
    const result = req.session.leaseFlash || null;
    delete req.session.leaseFlash;
    await render(res, { result });
  } catch (e) { next(e); }
};

exports.upload = async (req, res, next) => {
  const form = { period: req.body.period || '' };
  try {
    if (!req.file) throw new ArrendamentoError('Selecione o arquivo (.xlsx ou .txt).');
    if (form.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.period)) throw new ArrendamentoError('Competência inválida.');
    const result = await Report.importArrendamento({
      buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user, period: form.period || null,
    });
    req.session.leaseFlash = result;
    // Abre o relatório já na competência importada
    req.session.filter = { ...(req.session.filter || {}), periodo: result.period };
    res.redirect('/arrendamento/importar');
  } catch (e) {
    if (e instanceof ArrendamentoError || /formato/i.test(e.message)) {
      res.status(422);
      return render(res, { error: e.message, form }).catch(next);
    }
    next(e);
  }
};

exports.uploadError = (err, req, res, next) => {
  const known = err.name === 'MulterError' || err.status === 403 || /formato/i.test(err.message);
  if (!known) return next(err);
  res.status(422);
  return render(res, { error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima do tamanho máximo permitido.' : err.message }).catch(next);
};

exports.remove = async (req, res, next) => {
  try {
    const batch = String(req.body.batch || '');
    if (!batch.startsWith('arrendamento:')) { const e = new Error('Carga inválida.'); e.status = 400; throw e; }
    await Report.removeBatch(batch);
    req.session.leaseFlash = { removed: batch.split(':')[1] };
    res.redirect('/arrendamento/importar');
  } catch (e) { next(e); }
};
