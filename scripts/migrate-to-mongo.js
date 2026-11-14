/**
 * Copia os dados do cache local (pasta data/) para o MongoDB Atlas:
 * usuários, empresas, cargas de relatórios (resumos + linhas) e parâmetros.
 * Pode ser executado mais de uma vez: registros existentes são substituídos
 * (usuários já existentes são mantidos).
 *
 * Uso: npm run mongo:migrate            → testa a conexão e migra
 *      npm run mongo:migrate -- --check → só testa a conexão e mostra o que há no banco
 */
const config = require('../src/config');
const createJson = require('../src/repositories/json');
const createMongo = require('../src/repositories/mongo');

const n = (x) => Number(x).toLocaleString('pt-BR');

(async () => {
  if (!config.mongoUri || config.mongoUri.includes('<db_')) {
    console.error('Preencha MONGODB_URI no .env com o usuário e a senha do banco (sem os sinais < >).');
    process.exit(1);
  }
  const mongo = createMongo(config.mongoUri, config.mongoDb);
  const t0 = Date.now();
  await mongo.ping();
  console.log(`✓ Conectado ao MongoDB, banco "${config.mongoDb}" (${Date.now() - t0} ms)`);

  if (process.argv.includes('--check')) {
    const d = await mongo.db();
    for (const c of ['users', 'companies', 'datasets', 'dataset_rows', 'params', 'param_rows', 'sessions']) {
      console.log(`  ${c}: ${n(await d.collection(c).estimatedDocumentCount())} documento(s)`);
    }
    await mongo.close();
    return;
  }

  const local = createJson(config.dataDir);

  // Usuários (mantém hash de senha; não sobrescreve quem já existe no banco)
  let created = 0;
  for (const u of await local.users.list()) {
    if (await mongo.users.findByEmail(u.email)) continue;
    await mongo.users.create(u);
    created++;
  }
  console.log(`✓ Usuários: ${created} criado(s)`);

  const companies = await local.companies.list();
  for (const c of companies) await mongo.companies.upsert(c);
  console.log(`✓ Empresas: ${companies.length}`);

  const sets = await local.datasets.list();
  let rows = 0;
  for (const [i, d] of sets.entries()) {
    const [summary, data] = await Promise.all([local.datasets.getSummary(d), local.datasets.getRows(d)]);
    const { module, period, company, currencyType, rows: _r, uploadedAt, ...meta } = d;
    await mongo.datasets.save({ module, period, company, currencyType, rows: data, summary, meta });
    rows += data.length;
    process.stdout.write(`\r  Cargas de relatórios: ${i + 1}/${sets.length}`);
  }
  console.log(`\n✓ Cargas de relatórios: ${sets.length} (${n(rows)} linhas)`);

  for (const p of await local.params.list()) {
    const t = Date.now();
    const data = await local.params.getRows(p.id);
    const { id, rows: _r, updatedAt, ...meta } = p;
    await mongo.params.save(id, data || [], meta);
    console.log(`✓ Parâmetro ${id}: ${n(data?.length || 0)} registro(s) (${Date.now() - t} ms)`);
  }

  await mongo.close();
  console.log(`\nMigração concluída em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log('Para usar o banco: STORAGE_DRIVER=mongo no .env e reinicie o servidor.');
})().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  if (/auth|authentication/i.test(e.message)) console.error('  Usuário ou senha incorretos (senhas com @ : / ? # % precisam ser codificadas na URL).');
  if (/timed out|ENOTFOUND|ECONNREFUSED|Server selection/i.test(e.message)) console.error('  Verifique se o IP desta máquina está liberado em Network Access no Atlas.');
  process.exit(1);
});
