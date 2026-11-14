const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');

// Carrega o .env (Node >= 20.12 tem suporte nativo)
const envFile = path.join(ROOT, '.env');
// Na Vercel as variáveis vêm do painel do projeto (o .env local não é usado)
if (!process.env.VERCEL && fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const env = process.env;

/**
 * Limpa a string de conexão colada em painéis (ex.: Vercel): remove espaços/quebras de linha,
 * aspas em volta e o prefixo "MONGODB_URI=" colado por engano.
 */
function cleanUri(v) {
  let s = String(v || '').trim();
  s = s.replace(/^MONGODB_URI\s*=\s*/i, '').trim();
  s = s.replace(/^(['"])(.*)\1$/, '$2').trim();
  return s;
}

/** Problema na string de conexão do MongoDB (sem expor o valor) ou null se parece válida */
function mongoUriProblem(uri) {
  if (!uri) return 'MONGODB_URI não definida.';
  if (uri.includes('<db_')) return 'MONGODB_URI ainda tem o texto de exemplo (<db_password>).';
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) return 'MONGODB_URI deve começar com "mongodb+srv://" (cole só o valor, sem aspas nem o nome da variável).';
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const host = afterScheme.split(/[/?]/)[0];
  if ((host.match(/@/g) || []).length > 1) return 'A senha em MONGODB_URI tem "@" sem codificar: troque cada "@" da senha por "%40".';
  if (/\s/.test(uri)) return 'MONGODB_URI contém espaços ou quebras de linha no meio.';
  return null;
}

module.exports = {
  root: ROOT,
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  sessionSecret: env.SESSION_SECRET || 'dev-secret-change-me',
  storageDriver: String(env.STORAGE_DRIVER || 'json').trim().toLowerCase(),
  dataDir: path.resolve(ROOT, env.DATA_DIR || './data'),
  mongoUri: cleanUri(env.MONGODB_URI),
  mongoUriProblem,
  mongoDb: cleanUri(env.MONGODB_DB) || 'ag_cont_hub',
  // FGI0: contas desconsideradas pelo primeiro dígito (contas técnicas/de apuração). Ex.: "6,9"
  fgi0IgnorePrefixes: String(env.FGI0_IGNORAR_PREFIXOS ?? '6,9').split(',').map((s) => s.trim()).filter(Boolean),
  uploadMaxBytes: (Number(env.UPLOAD_MAX_MB) || 50) * 1024 * 1024,
  admin: {
    email: env.ADMIN_EMAIL || 'admin@agconthub.local',
    name: env.ADMIN_NAME || 'Administrador',
    password: env.ADMIN_PASSWORD || '',
  },
};
