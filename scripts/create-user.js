/**
 * Cria um usuário (grava no armazenamento ativo: cache local ou MongoDB).
 * Uso: npm run user:create -- <email> "<nome>" "<senha>" [admin|viewer]
 */
const User = require('../src/models/User');
const repos = require('../src/repositories');

const [email, name, password, role = 'viewer'] = process.argv.slice(2);
if (!email || !name || !password || !['admin', 'viewer'].includes(role)) {
  console.log('Uso: npm run user:create -- <email> "<nome>" "<senha>" [admin|viewer]');
  process.exit(1);
}

User.create({ email, name, password, role, todosCentros: true })
  .then((u) => console.log(`Usuário criado: ${u.email} (${u.role === 'admin' ? 'administrador' : 'leitura'})`))
  .catch((e) => { console.error(e.message, e.fields ? Object.values(e.fields).join(' ') : ''); process.exitCode = 1; })
  .finally(() => repos.close?.());
