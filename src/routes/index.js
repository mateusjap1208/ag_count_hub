const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { requireAuth, requireAdmin, requireTela, redirectIfAuthenticated, invalidateUser } = require('../middlewares/auth');
const Telas = require('../config/telas');
const telaModulo = requireTela((req) => req.params.slug);
const { csrfToken, verifyCsrf } = require('../middlewares/csrf');
const { viewLocals } = require('../middlewares/locals');
const novidadesSvc = require('../services/novidades');
const versaoAtual = require('../config/versao');
const User = require('../models/User');
const mensagensCtl = require('../controllers/mensagemController');
const pendencias = require('../services/pendencias');
const indicadores = require('../services/indicadores');
const Report = require('../models/Report');
const auth = require('../controllers/authController');
const dashboard = require('../controllers/dashboardController');
const modules = require('../controllers/moduleController');
const upload = require('../controllers/uploadController');
const parameters = require('../controllers/parameterController');
const obrasCtl = require('../controllers/obraController');
const arrendamentoCtl = require('../controllers/arrendamentoController');
const usersCtl = require('../controllers/userController');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).render('auth/login', {
    error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
    email: req.body?.email || '', csrfToken: res.locals.csrfToken,
  }),
});

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.(txt|csv|xlsx)$/i.test(file.originalname)) return cb(null, true);
    return cb(new Error('Formato não suportado. Envie Excel (.xlsx) ou texto (.txt/.csv).'));
  },
});

const paramUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(config.uploadMaxBytes, 100 * 1024 * 1024), files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|txt|csv)$/i.test(file.originalname)) return cb(null, true);
    return cb(new Error('Formato não suportado. Envie .xlsx, .txt ou .csv.'));
  },
});

// Autenticação
router.get('/login', csrfToken, redirectIfAuthenticated, auth.showLogin);
// Página de login aberta há muito tempo (ou restaurada pelo navegador) traz um token vencido:
// em vez da tela 403, mostra o login de novo com um token novo e o e-mail já preenchido.
const csrfLogin = (req, res, next) => verifyCsrf(req, res, (err) => {
  if (!err) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(403).render('auth/login', {
    error: 'A página de login ficou aberta por muito tempo. Digite a senha e entre novamente.',
    email: String(req.body?.email || '').slice(0, 200),
  });
});
// Sair com token vencido: encerra a sessão do mesmo jeito (sair não traz risco)
const csrfLogout = (req, res, next) => verifyCsrf(req, res, (err) => (err ? auth.logout(req, res) : next()));
router.post('/login', csrfToken, loginLimiter, csrfLogin, auth.login);
router.post('/logout', csrfToken, csrfLogout, auth.logout);

// Área autenticada
router.use(requireAuth, csrfToken);

router.get('/api/modulos/:slug/linhas', telaModulo, modules.rows);
router.get('/api/seguros/linha-do-tempo', requireTela('seguros-garantias'), modules.seguroTimeline);
router.get('/api/dre/contas', requireTela('dre'), modules.dreContas);
router.get('/modulos/:slug/exportar.csv', telaModulo, modules.exportCsv);
router.get('/modulos/:slug/exportar.xlsx', telaModulo, modules.exportXlsx);
router.get('/api/parametros/conta/:conta', parameters.classify);
router.get('/api/parametros/:id/linhas', requireAdmin, parameters.rows);
// Vincular conta "a classificar" a partir da tela (popup no olho das contas)
router.post('/api/vincular-conta', requireAdmin, express.json({ limit: '5kb' }), verifyCsrf, async (req, res, next) => {
  try {
    const r = await require('../models/Parameter').vincularConta(req.body || {}, req.user);
    pendencias.limpar();
    res.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof require('../models/Parameter').ParamError) return res.status(400).json({ error: e.message });
    next(e);
  }
});
router.post('/api/parametros/:id/linhas', requireAdmin, express.json({ limit: '20kb' }), verifyCsrf, parameters.addRow);
router.put('/api/parametros/:id/linhas/:i', requireAdmin, express.json({ limit: '20kb' }), verifyCsrf, parameters.updateRow);
router.delete('/api/parametros/:id/linhas/:i', requireAdmin, express.json({ limit: '20kb' }), verifyCsrf, parameters.deleteRow);

router.use(viewLocals);
// Visão Geral: sem essa tela liberada, vai para a primeira tela que o usuário pode ver
router.get('/', (req, res, next) => {
  if (Telas.podeVer(req.user, 'visao-geral')) return dashboard.index(req, res, next);
  const t = Telas.primeiraTela(req.user);
  if (t) return res.redirect(t.path);
  const err = new Error('Nenhuma tela liberada para o seu usuário. Peça a liberação a um administrador.');
  err.status = 403;
  return next(err);
});
// Novidades: histórico das versões e "Entendi" do aviso de atualização
router.get('/novidades', (req, res) => res.render('novidades/index', {
  title: 'Novidades', subtitle: 'O que mudou em cada versão', hideFilters: true, historico: novidadesSvc.historico(),
}));
// Personalizar cores (preferência de cada usuário)
const coresCfg = require('../config/cores');
const Avatar = require('../models/Avatar');
router.get('/personalizar', async (req, res, next) => {
  try {
    // Avatar comemorativo: cadastro só para administradores
    const admin = req.user.role === 'admin';
    const avatarForm = req.session.avatarForm || null;
    delete req.session.avatarForm;
    res.render('personalizar/index', {
      title: 'Personalizar', subtitle: 'Escolha as cores do sistema', hideFilters: true,
      campos: coresCfg.CAMPOS, paletas: coresCfg.PALETAS, menu: coresCfg.MENU, menuPadrao: coresCfg.MENU_PADRAO, atuais: req.user.cores || {},
      avatarAdmin: admin,
      avatares: admin ? (await Avatar.list()).map((a) => ({ ...a, situacao: Avatar.situacao(a) })) : [],
      avatarForm: avatarForm || { values: {}, errors: {}, error: null, flash: null },
    });
  } catch (e) { next(e); }
});

// Avatar comemorativo (imagem SVG flutuante para todos, com período de exibição)
const avatarUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Avatar.MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.svg$/i.test(file.originalname)) return cb(null, true);
    return cb(new Error('Envie a imagem em formato vetorial (.svg).'));
  },
});
const voltarAvatar = (req, res, form) => { req.session.avatarForm = form; return res.redirect('/personalizar#avatar'); };
router.post('/personalizar/avatar', requireAdmin, avatarUploader.single('arquivo'), verifyCsrf, async (req, res, next) => {
  try {
    await Avatar.save(req.body, req.file, { actor: req.user });
    return voltarAvatar(req, res, { values: {}, errors: {}, flash: 'Avatar cadastrado. Ele aparece para todos no período escolhido.' });
  } catch (e) {
    if (e instanceof Avatar.AvatarError) return voltarAvatar(req, res, { values: req.body, errors: e.fields || {}, error: e.message });
    return next(e);
  }
}, (err, req, res, next) => {
  // Erros do envio (arquivo grande demais ou formato errado)
  if (err instanceof multer.MulterError || /svg/i.test(err?.message || '')) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'A imagem precisa ter no máximo 300 KB.' : err.message;
    return voltarAvatar(req, res, { values: {}, errors: { arquivo: msg }, error: 'Verifique os campos destacados.' });
  }
  return next(err);
});
router.post('/personalizar/avatar/:id/excluir', requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    await Avatar.remove(req.params.id);
    return voltarAvatar(req, res, { values: {}, errors: {}, flash: 'Avatar excluído.' });
  } catch (e) { return next(e); }
});
// A imagem é servida com CSP própria e restrita: sem scripts e isolada (sandbox), só estilos e animações
router.get('/avatar/:id.svg', async (req, res, next) => {
  try {
    const a = await Avatar.get(req.params.id);
    if (!a) return res.status(404).end();
    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      'Cache-Control': req.query.v ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    });
    return res.send(a.svg);
  } catch (e) { return next(e); }
});
router.post('/api/preferencias/cores', express.json({ limit: '2kb' }), verifyCsrf, async (req, res, next) => {
  try {
    const cores = await User.saveCores(req.user.id, req.body?.cores);
    invalidateUser(req.user.id);
    return res.json({ ok: true, cores, versao: coresCfg.versao(cores) });
  } catch (e) { return next(e); }
});
router.get('/preferencias/cores.css', (req, res) => {
  res.type('text/css');
  // O endereço muda quando as cores mudam (?v=), então pode ficar em cache no navegador
  res.set('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'no-store');
  res.send(coresCfg.css(req.user.cores));
});

// Ordem dos cards e gráficos de cada tela (preferência do usuário)
router.post('/api/preferencias/ordem', express.json({ limit: '10kb' }), verifyCsrf, async (req, res, next) => {
  try {
    await User.saveOrdem(req.user.id, req.body?.chave, req.body?.ordem);
    invalidateUser(req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    if (e instanceof User.UserError) return res.status(400).json({ error: e.message });
    return next(e);
  }
});
router.post('/novidades/visto', verifyCsrf, async (req, res, next) => {
  try {
    await User.markSeen(req.user.id, versaoAtual.build);
    invalidateUser(req.user.id);
    if (req.get('accept')?.includes('application/json')) return res.json({ ok: true });
    const volta = String(req.body?.voltar || '/');
    return res.redirect(volta.startsWith('/') && !volta.startsWith('//') ? volta : '/');
  } catch (e) { return next(e); }
});
// Relatórios: extração dos detalhamentos (relatórios analíticos) de cada tema
router.get('/relatorios', requireTela('relatorios'), modules.relatorios);
// Indicadores da análise do balanço (liquidez, rentabilidade, estrutura de capital)
router.get('/indicadores', requireTela('indicadores'), async (req, res, next) => {
  try {
    const { scope } = res.locals;
    const ind = scope.period ? await indicadores.calcular(scope) : null;
    const cur = await Report.displayCurrency(Report.getModule('bp'), scope);
    res.render('indicadores/index', { title: 'Indicadores', ind, cur });
  } catch (e) { next(e); }
});
// Visualizar a página de erro do servidor (500) com a animação da obra (administradores)
router.get('/erro-servidor', requireAdmin, (req, res) => {
  res.status(500).render('errors/error', { status: 500, message: 'Esta é uma visualização da página de erro do servidor.', user: req.session?.user });
});
// Visualizar a página autônoma (a usada quando o sistema nem inicia, ex.: configuração da Vercel)
router.get('/erro-servidor/indisponivel', requireAdmin, (req, res) => {
  const { paginaObra } = require('../views/errors/paginaObra');
  // página autônoma tem o CSS embutido: libera só estilos inline nesta resposta
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
  res.status(503).type('html').send(paginaObra({ status: 503, titulo: 'Sistema indisponível (visualização)', texto: 'É assim que a página aparece quando falta configuração na Vercel.', itens: ['Exemplo: SESSION_SECRET não definida.'] }));
});
// Pendências de parâmetros e cadastros (somente administradores)
router.get('/pendencias', requireAdmin, async (req, res, next) => {
  try {
    const p = await pendencias.doPeriodo(res.locals.filter.periodo);
    res.render('pendencias/index', { title: 'Pendências', subtitle: 'Parâmetros e cadastros a completar', hideFilters: true, p });
  } catch (e) { next(e); }
});
// Mensagens do rodapé (somente administradores)
router.get('/mensagens', requireAdmin, mensagensCtl.index);
router.post('/mensagens', requireAdmin, verifyCsrf, mensagensCtl.save);
router.post('/mensagens/:id', requireAdmin, verifyCsrf, mensagensCtl.save);
router.post('/mensagens/:id/excluir', requireAdmin, verifyCsrf, mensagensCtl.remove);
router.get('/sobre', (req, res) => res.render('about/index', {
  title: 'Sobre', subtitle: 'Informações do sistema', hideFilters: true,
  devs: [
    { nome: 'Marcelo Santos', github: 'pioriamm', email: 'pioriam@gmail.com' },
    { nome: 'Mateus Aguiar Paula', github: 'mateusjap1208', email: 'mateus.paula@agnet.com.br' },
  ],
}));
router.get('/modulos/:slug', telaModulo, modules.show);

router.get('/upload', requireAdmin, upload.index);
router.get('/upload/modelo/:slug.txt', requireAdmin, upload.template);
router.post('/upload', requireAdmin, uploader.single('file'), verifyCsrf, upload.upload, upload.handleMulterError);
router.post('/upload/remover', requireAdmin, verifyCsrf, upload.remove);

// Usuários e permissões
router.get('/usuarios', requireAdmin, usersCtl.index);
router.get('/usuarios/novo', requireAdmin, usersCtl.newForm);
router.post('/usuarios', requireAdmin, verifyCsrf, usersCtl.save);
router.get('/usuarios/:id/editar', requireAdmin, usersCtl.editForm);
router.post('/usuarios/:id', requireAdmin, verifyCsrf, usersCtl.save);
router.post('/usuarios/:id/excluir', requireAdmin, verifyCsrf, usersCtl.remove);

// Auditoria de login (somente administradores)
router.get('/auditoria-login', requireAdmin, async (req, res, next) => {
  try {
    const LoginAudit = require('../models/LoginAudit');
    const f = { q: String(req.query.q || ''), de: String(req.query.de || ''), ate: String(req.query.ate || ''), resultado: String(req.query.resultado || '') };
    const registros = await LoginAudit.listar(f);
    res.render('auditoria/index', {
      title: 'Auditoria de login', subtitle: 'Quem entrou no sistema, quando e de onde', hideFilters: true,
      registros, f, dispositivo: LoginAudit.dispositivo,
    });
  } catch (e) { next(e); }
});

// Arrendamento (IFRS 16)
router.get('/arrendamento/importar', requireAdmin, arrendamentoCtl.index);
router.post('/arrendamento/importar', requireAdmin, paramUploader.single('file'), verifyCsrf, arrendamentoCtl.upload, arrendamentoCtl.uploadError);
router.post('/arrendamento/remover', requireAdmin, verifyCsrf, arrendamentoCtl.remove);
router.get('/arrendamento', (req, res) => res.redirect('/modulos/arrendamento'));

// Cadastro de obras
router.get('/obras', requireAdmin, obrasCtl.index);
router.get('/obras/nova', requireAdmin, obrasCtl.newForm);
router.get('/obras/modelo.txt', requireAdmin, obrasCtl.template);
router.post('/obras', requireAdmin, verifyCsrf, obrasCtl.save);
router.post('/obras/importar', requireAdmin, paramUploader.single('file'), verifyCsrf, obrasCtl.import, obrasCtl.uploadError);
router.get('/obras/:centro/editar', requireAdmin, obrasCtl.editForm);
router.post('/obras/:centro', requireAdmin, verifyCsrf, obrasCtl.save);
router.post('/obras/:centro/excluir', requireAdmin, verifyCsrf, obrasCtl.remove);

router.get('/parametros', requireAdmin, parameters.index);
router.get('/parametros/:id', requireAdmin, parameters.show);
router.post('/parametros/:id', requireAdmin, paramUploader.single('file'), verifyCsrf, parameters.upload, parameters.uploadError);

module.exports = router;
