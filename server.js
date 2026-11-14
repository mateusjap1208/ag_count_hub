/**
 * Servidor local (`npm run dev` / `npm start`).
 * Na Vercel este arquivo apenas exporta a aplicação (a Vercel pode detectá-lo como entrada Express);
 * lá não se abre porta nem se encerra o processo.
 */
if (process.env.VERCEL) {
  module.exports = require('./api/index');
} else {
  const config = require('./src/config');

  if (config.isProd && config.sessionSecret === 'dev-secret-change-me') {
    console.error('Defina SESSION_SECRET no .env antes de rodar em produção.');
    process.exit(1);
  }

  (async () => {
    if (config.storageDriver === 'mongo') {
      const repos = require('./src/repositories');
      try {
        await repos.ping();
        console.log(`MongoDB conectado (banco "${repos.dbName}").`);
      } catch (e) {
        console.error(`Não foi possível conectar ao MongoDB: ${e.message}`);
        console.error('Confira MONGODB_URI no .env e se o IP desta máquina está liberado em Network Access no Atlas.');
        process.exit(1);
      }
    }
    const app = require('./src/app');
    app.listen(config.port, () => {
      console.log(`AG Cont Hub rodando em http://localhost:${config.port} (dados: ${config.storageDriver})`);
    });
  })();
}
