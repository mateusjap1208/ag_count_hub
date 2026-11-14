const Obra = require('../models/Obra');

const pick = (q) => ({
  q: String(q.q || '').slice(0, 60),
  estrutura: String(q.estrutura || ''),
  situacao: ['ativas', 'inativas'].includes(q.situacao) ? q.situacao : '',
  sort: String(q.sort || 'centroLucro'),
  dir: q.dir === 'desc' ? 'desc' : 'asc',
  page: Number(q.page) || 1,
});

exports.index = async (req, res, next) => {
  try {
    const filtros = pick(req.query);
    const [result, estruturas] = await Promise.all([Obra.search(filtros), Obra.estruturas()]);
    const flash = req.session.obraFlash || null;
    delete req.session.obraFlash;
    res.render('obras/index', {
      title: 'Cadastro de obras', hideFilters: true, subtitle: 'Centros de lucro, siglas e estrutura',
      result, estruturas, filtros, flash, importError: null,
    });
  } catch (e) { next(e); }
};

async function renderForm(res, { obra, original, errors = {}, error = null }) {
  res.render('obras/form', {
    title: original ? `Editar obra ${original}` : 'Nova obra', hideFilters: true, subtitle: 'Cadastro de obras',
    obra, original, errors, error, estruturas: await Obra.estruturas(),
  });
}

exports.newForm = async (req, res, next) => {
  try { await renderForm(res, { obra: { ativa: true, estrutura: String(req.query.estrutura || '') } }); } catch (e) { next(e); }
};

exports.editForm = async (req, res, next) => {
  try {
    const obra = await Obra.find(req.params.centro);
    if (!obra) { const e = new Error('Obra não encontrada.'); e.status = 404; throw e; }
    await renderForm(res, { obra, original: obra.centroLucro });
  } catch (e) { next(e); }
};

exports.save = async (req, res, next) => {
  const original = req.params.centro || null;
  const input = {
    centroLucro: req.body.centroLucro, siglaGerencial: req.body.siglaGerencial, siglaObra: req.body.siglaObra,
    estrutura: req.body.estrutura, ativa: req.body.ativa === 'on',
  };
  try {
    const obra = await Obra.save(input, { original, user: req.session.user });
    req.session.obraFlash = { ok: `Obra ${obra.centroLucro} ${original ? 'atualizada' : 'cadastrada'} com sucesso.` };
    res.redirect(`/obras?q=${encodeURIComponent(obra.centroLucro)}`);
  } catch (e) {
    if (e instanceof Obra.ObraError) {
      res.status(422);
      return renderForm(res, { obra: input, original, errors: e.fields || {}, error: e.message }).catch(next);
    }
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await Obra.remove(req.params.centro);
    req.session.obraFlash = { ok: `Obra ${req.params.centro} excluída.` };
    res.redirect('/obras');
  } catch (e) { next(e); }
};

exports.import = async (req, res, next) => {
  try {
    if (!req.file) throw new Obra.ObraError('Selecione o arquivo (.xlsx, .txt ou .csv).');
    const r = await Obra.importFile({ buffer: req.file.buffer, fileName: req.file.originalname, user: req.session.user });
    req.session.obraFlash = { import: r };
    res.redirect('/obras');
  } catch (e) {
    if (e instanceof Obra.ObraError || /formato/i.test(e.message)) {
      const filtros = pick({});
      const [result, estruturas] = await Promise.all([Obra.search(filtros), Obra.estruturas()]);
      res.status(422);
      return res.render('obras/index', { title: 'Cadastro de obras', hideFilters: true, subtitle: 'Centros de lucro, siglas e estrutura', result, estruturas, filtros, flash: null, importError: e.message });
    }
    next(e);
  }
};

/** Erros do upload (tipo/tamanho do arquivo, formulário expirado) voltam para a lista */
exports.uploadError = (err, req, res, next) => {
  const known = err.name === 'MulterError' || err.status === 403 || /formato/i.test(err.message);
  if (!known) return next(err);
  req.session.obraFlash = { error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima do tamanho máximo permitido.' : err.message };
  return res.redirect('/obras');
};

/** Modelo de planilha para importação */
exports.template = (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="modelo_obras.txt"');
  res.send('﻿CENTRO_LUCRO\tSIGLA_GERENCIAL\tSIGLA_OBRA\tESTRUTURA\r\n');
};
