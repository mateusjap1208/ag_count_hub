const User = require('../models/User');
const Report = require('../models/Report');
const Company = require('../models/Company');
const { invalidateUser } = require('../middlewares/auth');

/**
 * Catálogo de centros de lucro para o seletor de permissões:
 * cadastro de obras + centros com movimento no FGI0 (com as empresas onde aparecem).
 */
async function centrosCatalog() {
  const period = (await Report.periods())[0] || null;
  const [obras, map, companies] = await Promise.all([
    Report.effectiveObras(period, 'grupo'), Report.companyCentros(period, 'grupo'), Company.list(),
  ]);
  const empresasPorCentro = new Map();
  for (const [code, set] of map) for (const c of set) (empresasPorCentro.get(c) || empresasPorCentro.set(c, []).get(c)).push(code);
  const names = Object.fromEntries(companies.map((c) => [c.code, c.name]));
  const centros = obras
    .filter((o) => o.centroLucro)
    .map((o) => ({ c: o.centroLucro, s: o.siglaObra || '', e: o.estrutura || '', emp: (empresasPorCentro.get(o.centroLucro) || []).sort() }))
    .sort((a, b) => a.c.localeCompare(b.c, 'pt-BR', { numeric: true }));
  return { centros, empresas: names };
}

exports.index = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    let users = await User.list();
    if (q) users = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
    users.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'pt-BR') : a.role === 'admin' ? -1 : 1));
    const flash = req.session.userFlash || null;
    delete req.session.userFlash;
    res.render('users/index', { title: 'Usuários', hideFilters: true, subtitle: 'Acessos e permissões por centro de lucro', users, q, flash, ROLES: User.ROLES });
  } catch (e) { next(e); }
};

async function renderForm(res, { form, editing, errors = {}, error = null }) {
  const catalog = await centrosCatalog();
  res.render('users/form', {
    title: editing ? `Editar usuário` : 'Novo usuário', hideFilters: true, subtitle: 'Usuários',
    form, editing, errors, error, catalog, ROLES: User.ROLES,
  });
}

exports.newForm = async (req, res, next) => {
  try { await renderForm(res, { form: { role: 'viewer', active: true, todosCentros: false, centros: [] }, editing: null }); } catch (e) { next(e); }
};

exports.editForm = async (req, res, next) => {
  try {
    const u = await User.get(req.params.id);
    if (!u) { const e = new Error('Usuário não encontrado.'); e.status = 404; throw e; }
    await renderForm(res, { form: u, editing: u });
  } catch (e) { next(e); }
};

const fromBody = (b) => ({
  name: b.name, email: b.email, password: b.password, passwordConfirm: b.passwordConfirm,
  role: b.role, active: b.active === 'on', todosCentros: b.todosCentros === 'on', centros: b.centros,
});

exports.save = async (req, res, next) => {
  const id = req.params.id || null;
  const input = fromBody(req.body);
  try {
    const saved = id ? await User.update(id, input, { actor: req.user }) : await User.create(input);
    invalidateUser(saved.id);
    req.session.userFlash = { ok: `Usuário ${saved.name} ${id ? 'atualizado' : 'cadastrado'} com sucesso.` };
    res.redirect('/usuarios');
  } catch (e) {
    if (e instanceof User.UserError) {
      res.status(422);
      const editing = id ? await User.get(id) : null;
      const centros = String(input.centros || '').split(',').map((c) => c.trim()).filter(Boolean);
      return renderForm(res, { form: { ...input, centros, password: '', passwordConfirm: '' }, editing, errors: e.fields || {}, error: e.message }).catch(next);
    }
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const u = await User.get(req.params.id);
    await User.remove(req.params.id, { actor: req.user });
    invalidateUser(req.params.id);
    req.session.userFlash = { ok: `Usuário ${u?.name || ''} excluído.` };
    res.redirect('/usuarios');
  } catch (e) {
    if (e instanceof User.UserError) { req.session.userFlash = { error: e.message }; return res.redirect('/usuarios'); }
    next(e);
  }
};
