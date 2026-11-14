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

module.exports = {
  root: ROOT,
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  sessionSecret: env.SESSION_SECRET || 'dev-secret-change-me',
  storageDriver: env.STORAGE_DRIVER || 'json',
  dataDir: path.resolve(ROOT, env.DATA_DIR || './data'),
  mongoUri: env.MONGODB_URI || '',
  mongoDb: env.MONGODB_DB || 'ag_cont_hub',
  // FGI0: contas desconsideradas pelo primeiro dígito (contas técnicas/de apuração). Ex.: "6,9"
  fgi0IgnorePrefixes: String(env.FGI0_IGNORAR_PREFIXOS ?? '6,9').split(',').map((s) => s.trim()).filter(Boolean),
  uploadMaxBytes: (Number(env.UPLOAD_MAX_MB) || 50) * 1024 * 1024,
  admin: {
    email: env.ADMIN_EMAIL || 'admin@agconthub.local',
    name: env.ADMIN_NAME || 'Administrador',
    password: env.ADMIN_PASSWORD || '',
  },
};
