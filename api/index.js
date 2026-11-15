/**
 * Ponto de entrada na Vercel (função serverless). Localmente continue usando `npm run dev` (server.js).
 *
 * Se faltar configuração, NÃO derruba a função: responde uma página explicando o que falta
 * (sem expor valores). Variáveis necessárias na Vercel:
 *   STORAGE_DRIVER=mongo, MONGODB_URI, MONGODB_DB, SESSION_SECRET
 */
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const config = require('../src/config');
const { paginaObra } = require('../src/views/errors/paginaObra');

function configProblems() {
  const p = [];
  if (config.storageDriver !== 'mongo') p.push('STORAGE_DRIVER deve ser "mongo" (o disco da Vercel é temporário).');
  const uriProblem = config.mongoUriProblem(config.mongoUri);
  if (uriProblem) p.push(uriProblem);
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
    res.end(paginaObra({
      status: 503,
      titulo: 'Configuração incompleta na Vercel',
      texto: 'Cadastre as variáveis em Settings › Environment Variables do projeto e faça um novo deploy (Redeploy). Nenhum valor secreto é exibido nesta página.',
      itens: problems,
    }));
  };
} else {
  try {
    handler = require('../src/app');
  } catch (err) {
    console.error('[startup] Falha ao carregar a aplicação:', err);
    handler = (req, res) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(paginaObra({
        status: 500,
        titulo: 'Falha ao iniciar o sistema',
        texto: 'O AG Cont Hub não conseguiu iniciar. Veja os logs da função na Vercel para o detalhe técnico.',
      }));
    };
  }
}

module.exports = handler;
