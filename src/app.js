const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const routes = require('./routes');

const app = express();

app.set('view engine', 'ejs');
// Versão do sistema (version.json): o build soma +1 a cada commit — exibida no login e no menu
app.locals.appVersion = require('./config/versao').label;
app.locals.redesSociais = require('./config/social');
// Vídeo de fundo da tela de login (YouTube): mudo, em loop, sem controles, começando aos 34s
const VIDEO_LOGIN = '-JeCqQeFdkk';
app.locals.videoLogin = `https://www.youtube-nocookie.com/embed/${VIDEO_LOGIN}?autoplay=1&mute=1&loop=1&playlist=${VIDEO_LOGIN}&start=34&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0`;
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      // Vídeo de fundo do login (YouTube, modo de privacidade aprimorada)
      'frame-src': ['https://www.youtube-nocookie.com'],
    },
  },
}));
app.use(compression());

// Arquivos estáticos com cache (fontes e libs mudam só em novas versões)
const staticOpts = { maxAge: config.isProd ? '7d' : 0 };
app.use('/static', express.static(path.join(config.root, 'public'), staticOpts));
app.use('/vendor/chart.js', express.static(path.join(config.root, 'node_modules/chart.js/dist'), { maxAge: '30d' }));
app.use('/vendor/flags', express.static(path.join(config.root, 'node_modules/flag-icons/flags/1x1'), { maxAge: '30d' }));
app.use('/vendor/montserrat', express.static(path.join(config.root, 'node_modules/@fontsource/montserrat/files'), { maxAge: '30d' }));

app.use(express.urlencoded({ extended: false, limit: '100kb' }));

/**
 * Diagnóstico de implantação (sem login): mostra se a configuração e o banco estão ok.
 * Não expõe valores secretos; mensagens de erro têm usuário/senha removidos.
 */
app.get('/saude', async (req, res) => {
  const out = {
    aplicacao: 'ok',
    ambiente: config.isProd ? 'produção' : 'desenvolvimento',
    vercel: !!process.env.VERCEL,
    armazenamento: config.storageDriver,
    variaveis: {
      MONGODB_URI: !!config.mongoUri && !config.mongoUri.includes('<db_'),
      MONGODB_DB: config.mongoDb,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
    },
  };
  if (config.storageDriver === 'mongo') {
    try {
      const repos = require('./repositories');
      await Promise.race([repos.ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado (10 s) ao conectar')), 10000))]);
      out.banco = 'conectado';
    } catch (e) {
      out.banco = `erro: ${String(e.message).replace(/\/\/[^@/\s]+@/g, '//***@')}`;
      out.dica = /tempo esgotado|Server selection|ENOTFOUND|ECONNREFUSED|timed out/i.test(e.message)
        ? 'O Atlas pode estar bloqueando a Vercel: libere o acesso em Network Access.'
        : /auth/i.test(e.message) ? 'Usuário ou senha do banco incorretos em MONGODB_URI.' : undefined;
    }
  }
  res.set('Cache-Control', 'no-store');
  res.status(out.banco && out.banco !== 'conectado' ? 503 : 200).json(out);
});

app.use(session({
  name: 'agch.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 8 * 60 * 60 * 1000 },
  // Com MongoDB as sessões sobrevivem a reinícios do servidor e funcionam com várias instâncias
  ...(config.storageDriver === 'mongo' ? { store: mongoSessionStore() } : {}),
}));

function mongoSessionStore() {
  const { MongoStore } = require('connect-mongo');
  const repos = require('./repositories');
  // Falha de conexão não derruba o processo: o erro aparece nas requisições (e em /saude)
  const clientPromise = repos.db().then(() => repos.client);
  clientPromise.catch((e) => console.error('[sessões] Falha ao conectar no MongoDB:', e.message));
  return MongoStore.create({
    clientPromise,
    dbName: repos.dbName,
    collectionName: 'sessions',
    ttl: 8 * 60 * 60,
    touchAfter: 10 * 60,
  });
}

app.use(routes);

// 404
app.use((req, res) => {
  res.status(404).render('errors/error', { status: 404, message: 'Página não encontrada.', user: req.session?.user });
});

// Erros
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Erro depois da resposta enviada (ex.: falha ao gravar a sessão): só registra, não responde de novo
  if (res.headersSent) { console.error(err); return next(err); }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Ocorreu um erro inesperado. Tente novamente.' : err.message;
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).render('errors/error', { status, message, user: req.session?.user });
});

module.exports = app;
