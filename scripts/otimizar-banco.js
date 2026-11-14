/**
 * Otimiza o banco (MongoDB): regrava as cargas e os parâmetros já existentes no formato enxuto
 * (sem campos vazios; parâmetros só com textos em formato compacto) e mostra o espaço antes e depois.
 * As cargas novas já são gravadas assim; rode este script só para dados antigos.
 *
 * Uso: npm run db:otimizar
 */
const repos = require('../src/repositories');
const Parameter = require('../src/models/Parameter');

const mb = (n) => `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;

(async () => {
  if (!repos.db) { console.log('Disponível só com STORAGE_DRIVER=mongo.'); process.exit(0); }
  const db = await repos.db();
  const tamanho = async () => (await db.command({ dbStats: 1 })).dataSize;
  const antes = await tamanho();

  const cargas = await repos.datasets.list();
  let n = 0;
  for (const d of cargas) {
    const rows = await repos.datasets.getRows(d);
    await repos.datasets.rewriteRows(d, rows);
    n += 1;
    if (n % 50 === 0) console.log(`  ${n}/${cargas.length} cargas regravadas`);
  }
  console.log(`✓ ${cargas.length} cargas regravadas sem campos vazios`);

  for (const meta of await repos.params.list()) {
    const def = Parameter.definitions.find((x) => x.id === meta.id);
    if (!def) continue;
    const rows = await repos.params.getRows(meta.id);
    const compactar = Parameter.colunasCompactas(def, rows || []);
    if (!rows || !compactar) continue;
    const { _id, id, rows: total, updatedAt, ...resto } = meta;
    await repos.params.save(meta.id, rows, { ...resto, compactar });
    console.log(`✓ parâmetro ${def.title}: ${rows.length.toLocaleString('pt-BR')} linhas em formato compacto`);
  }

  const depois = await tamanho();
  console.log(`Banco: ${mb(antes)} → ${mb(depois)} (limite do plano gratuito do Atlas: 512 MB)`);
  await repos.close();
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
