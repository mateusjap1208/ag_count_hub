/**
 * Prepara o ambiente local de testes:
 *  1. Cria o usuário administrador (ADMIN_* do .env)
 *  2. (opcional, --samples) importa os arquivos fictícios da pasta samples/
 *
 * Uso: npm run seed              → só o administrador
 *      npm run seed -- --samples → administrador + dados fictícios
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../src/config');
const User = require('../src/models/User');
const Company = require('../src/models/Company');
const Report = require('../src/models/Report');

(async () => {
  const { email, name } = config.admin;
  if (await User.findByEmail(email)) {
    console.log(`Administrador ${email} já existe.`);
  } else {
    let password = config.admin.password;
    if (!password) {
      password = crypto.randomBytes(9).toString('base64url');
      console.log(`ADMIN_PASSWORD não definido no .env. Senha gerada (anote e troque depois): ${password}`);
    }
    await User.create({ email, name, password, role: 'admin' });
    console.log(`Administrador criado: ${email}`);
  }

  if (process.argv.includes('--samples')) {
    const dir = path.resolve(__dirname, '..', 'samples');
    if (!fs.existsSync(dir)) require('./generate-samples');
    const companies = JSON.parse(fs.readFileSync(path.join(dir, 'empresas.json'), 'utf8'));
    for (const c of companies) await Company.upsert(c);

    const periods = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
    let n = 0;
    for (const period of periods) {
      for (const file of fs.readdirSync(path.join(dir, period))) {
        const m = file.match(/^([^_]+)_(.+)\.txt$/);
        if (!m) continue;
        const { warnings } = await Report.importFile({
          module: m[2], period, company: m[1],
          buffer: fs.readFileSync(path.join(dir, period, file)),
          fileName: file, user: { name: 'Carga inicial (seed)' },
        });
        n++;
        if (warnings.length) console.warn(`  ${period}/${file}: ${warnings.length} aviso(s) — ${warnings[0]}`);
      }
      console.log(`  ${period}: ok`);
    }
    console.log(`Dados fictícios importados: ${n} arquivo(s).`);
  }
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => require('../src/repositories').close?.());
