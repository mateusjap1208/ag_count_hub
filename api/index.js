/**
 * Ponto de entrada na Vercel (função serverless). Localmente continue usando `npm run dev` (server.js).
 * Requisitos no ambiente da Vercel: STORAGE_DRIVER=mongo, MONGODB_URI, MONGODB_DB e SESSION_SECRET.
 */
const config = require('../src/config');

if (config.isProd && config.sessionSecret === 'dev-secret-change-me') {
  throw new Error('Defina SESSION_SECRET nas variáveis de ambiente da Vercel.');
}
if (config.storageDriver !== 'mongo') {
  // Na Vercel o disco é temporário: sem MongoDB, usuários e cargas se perderiam a cada execução
  throw new Error('Na Vercel use STORAGE_DRIVER=mongo (e MONGODB_URI) nas variáveis de ambiente.');
}

module.exports = require('../src/app');
