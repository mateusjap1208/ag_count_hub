const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { requireAuth, requireAdmin, redirectIfAuthenticated, invalidateUser } = require('../middlewares/auth');
const { csrfToken, verifyCsrf } = require('../middlewares/csrf');
const { viewLocals } = require('../middlewares/locals');
const novidadesSvc = require('../services/novidades');
const versaoAtual = require('../config/versao');
const User = require('../models/User');
const mensagensCtl = require('../controllers/mensagemController');
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
router.post('/login', csrfToken, loginLimiter, verifyCsrf, auth.login);
router.post('/logout', csrfToken, verifyCsrf, auth.logout);

// Área autenticada
router.use(requireAuth, csrfToken);

router.get('/api/modulos/:slug/linhas', modules.rows);
router.get('/modulos/:slug/exportar.csv', modules.exportCsv);
router.get('/modulos/:slug/exportar.xlsx', modules.exportXlsx);
router.get('/api/parametros/conta/:conta', parameters.classify);
router.get('/api/parametros/:id/linhas', requireAdmin, parameters.rows);

router.use(viewLocals);
router.get('/', dashboard.index);
// Novidades: histórico das versões e "Entendi" do aviso de atualização
router.get('/novidades', (req, res) => res.render('novidades/index', {
  title: 'Novidades', subtitle: 'O que mudou em cada versão', hideFilters: true, historico: novidadesSvc.historico(),
}));
router.post('/novidades/visto', verifyCsrf, async (req, res, next) => {
  try {
    await User.markSeen(req.user.id, versaoAtual.build);
    invalidateUser(req.user.id);
    if (req.get('accept')?.includes('application/json')) return res.json({ ok: true });
    const volta = String(req.body?.voltar || '/');
    return res.redirect(volta.startsWith('/') && !volta.startsWith('//') ? volta : '/');
  } catch (e) { return next(e); }
});
// Mensagens do rodapé (somente administradores)
router.get('/mensagens', requireAdmin, mensagensCtl.index);
router.post('/mensagens', requireAdmin, verifyCsrf, mensagensCtl.save);
router.post('/mensagens/:id', requireAdmin, verifyCsrf, mensagensCtl.save);
router.post('/mensagens/:id/excluir', requireAdmin, verifyCsrf, mensagensCtl.remove);
router.get('/sobre', (req, res) => res.render('about/index', {
  title: 'Sobre', subtitle: 'Informações do sistema', hideFilters: true,
  devs: ['Marcelo Santos', 'Mateus Aguiar Paula'],
}));
router.get('/modulos/:slug', modules.show);

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
