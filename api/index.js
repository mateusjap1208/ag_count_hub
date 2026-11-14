/**
 * Ponto de entrada na Vercel (função serverless). Localmente continue usando `npm run dev` (server.js).
 *
 * Se faltar configuração, NÃO derruba a função: responde uma página explicando o que falta
 * (sem expor valores). Variáveis necessárias na Vercel:
 *   STORAGE_DRIVER=mongo, MONGODB_URI, MONGODB_DB, SESSION_SECRET
 */
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const config = require('../src/config');

function configProblems() {
  const p = [];
  if (config.storageDriver !== 'mongo') p.push('STORAGE_DRIVER deve ser "mongo" (o disco da Vercel é temporário).');
  if (!config.mongoUri) p.push('MONGODB_URI não definida.');
  else if (config.mongoUri.includes('<db_')) p.push('MONGODB_URI ainda tem o texto de exemplo (<db_password>).');
  if (!process.env.SESSION_SECRET) p.push('SESSION_SECRET não definida.');
  return p;
}

let handler;
const problems = configProblems();
if (problems.length) {
  console.error('[config] Configuração incompleta:', problems.join(' | '));
  handler = (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>AG Cont Hub · configuração</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 16px;color:#06172B">
<h1 style="font-size:22px">AG Cont Hub: configuração incompleta na Vercel</h1>
<p>Cadastre as variáveis em <strong>Settings › Environment Variables</strong> do projeto e faça um novo deploy (Redeploy):</p>
<ul>${problems.map((x) => `<li>${x}</li>`).join('')}</ul>
<p style="color:#777">Nenhum valor secreto é exibido nesta página.</p></body></html>`);
  };
} else {
  try {
    handler = require('../src/app');
  } catch (err) {
    console.error('[startup] Falha ao carregar a aplicação:', err);
    handler = (req, res) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`AG Cont Hub: falha ao iniciar a aplicação (${err.message}). Veja os logs da função na Vercel.`);
    };
  }
}

module.exports = handler;
