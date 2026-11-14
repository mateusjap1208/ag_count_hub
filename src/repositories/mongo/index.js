/**
 * Driver de persistência MongoDB Atlas. Mesmo contrato do driver JSON (../json/index.js):
 *   users:     list, findByEmail, findById, create, touchLogin
 *   companies: list, upsert
 *   datasets:  list, save, saveMany, getSummary, getSummaries, getRows, remove, removeWhere
 *   params:    list, getRows, save
 *
 * Coleções:
 *   users         { id, email, emailLower (único), name, passwordHash, role, active, createdAt, lastLoginAt }
 *   companies     { code (único), name }
 *   datasets      { module, period, company (único composto), rows, fileName, uploadedBy, uploadedAt, warnings, summary }
 *   dataset_rows  { module, period, company, chunk, rows: [...] }   ← linhas em blocos (leitura rápida)
 *   params        { id (único), rows, fileName, sheet, skipped, uploadedBy, updatedAt }
 *   param_rows    { id, chunk, rows: [...] }
 *
 * As linhas ficam em blocos de CHUNK registros: um relatório ou o LFA1 (250 mil linhas)
 * é lido em poucas dezenas de documentos, bem abaixo do limite de 16 MB por documento.
 * A troca de uma carga apaga os blocos antigos e grava os novos (substituição mensal).
 */
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const CHUNK = 5000;
/* Parâmetros compactos: linhas em texto (tabulação entre colunas, quebra de linha entre registros) */
const CHUNK_TEXTO = 40000;
const chunksDe = (rows, n) => { const out = []; for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n)); return out; };
const limpo = (v) => (v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' '));
const compactarLinhas = (rows, cols) => rows.map((r) => cols.map((c) => limpo(r[c])).join('\t')).join('\n');
const descompactar = (d) => (d.data ? d.data.split('\n').map((l) => {
  const v = l.split('\t');
  return Object.fromEntries(d.cols.map((c, i) => [c, v[i] ?? '']));
}) : []);

/** Rotina de gravação: campos vazios ("" ou nulos) não vão para o banco (a leitura repõe o padrão) */
const enxutas = (rows) => rows.map((r) => {
  const o = {};
  for (const k in r) { const v = r[k]; if (v === '' || v == null) continue; o[k] = v; }
  return o;
});

const chunks = (rows) => {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};
const strip = ({ _id, emailLower, ...rest }) => rest;

module.exports = function createMongoRepositories(uri, dbName) {
  if (!uri) throw new Error('MONGODB_URI não definido no .env.');
  const client = new MongoClient(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 15000, appName: 'ag-cont-hub' });

  let ready;
  function db() {
    ready ||= (async () => {
      await client.connect();
      const d = client.db(dbName);
      await Promise.all([
        d.collection('users').createIndex({ emailLower: 1 }, { unique: true }),
        d.collection('users').createIndex({ id: 1 }, { unique: true }),
        d.collection('companies').createIndex({ code: 1 }, { unique: true }),
        // Índice antigo (sem moeda) é substituído pelo índice com currencyType
        d.collection('datasets').dropIndex('module_1_period_1_company_1').catch(() => {}),
        d.collection('datasets').createIndex({ module: 1, period: 1, company: 1, currencyType: 1 }, { unique: true }),
        d.collection('datasets').createIndex({ period: 1, currencyType: 1 }),
        d.collection('datasets').createIndex({ batch: 1 }),
        d.collection('dataset_rows').createIndex({ module: 1, period: 1, company: 1, currencyType: 1, chunk: 1 }),
        d.collection('params').createIndex({ id: 1 }, { unique: true }),
        d.collection('param_rows').createIndex({ id: 1, chunk: 1 }),
        d.collection('obras').createIndex({ centroLucro: 1 }, { unique: true }),
        d.collection('obras').createIndex({ estrutura: 1 }),
      ]);
      return d;
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }
  const col = async (name) => (await db()).collection(name);

  const users = {
    async list() { return (await (await col('users')).find().toArray()).map(strip); },
    async findByEmail(email) {
      const u = await (await col('users')).findOne({ emailLower: String(email).toLowerCase() });
      return u ? strip(u) : null;
    },
    async findById(id) {
      const u = await (await col('users')).findOne({ id });
      return u ? strip(u) : null;
    },
    async create({ email, name, passwordHash, role = 'viewer', id, createdAt, active = true, todosCentros = true, centros = [] }) {
      const now = new Date().toISOString();
      const user = { id: id || crypto.randomUUID(), email, name, passwordHash, role, active, todosCentros, centros, createdAt: createdAt || now, updatedAt: now };
      try {
        await (await col('users')).insertOne({ ...user, emailLower: email.toLowerCase() });
      } catch (e) {
        if (e.code === 11000) throw new Error('E-mail já cadastrado.');
        throw e;
      }
      return user;
    },
    async touchLogin(id) {
      await (await col('users')).updateOne({ id }, { $set: { lastLoginAt: new Date().toISOString() } });
    },
    /** Ordem dos cards/gráficos de uma tela; ordem = null volta ao padrão */
    async setOrdem(id, chave, ordem) {
      const campo = `prefs.ordem.${chave}`;
      await (await col('users')).updateOne({ id }, ordem ? { $set: { [campo]: ordem } } : { $unset: { [campo]: '' } });
    },
    async setBuildVisto(id, build) {
      await (await col('users')).updateOne({ id }, { $set: { buildVisto: build } });
    },
    async update(id, patch) {
      const set = { ...patch, updatedAt: new Date().toISOString() };
      if (patch.email) set.emailLower = patch.email.toLowerCase();
      try {
        const r = await (await col('users')).findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0, emailLower: 0 } });
        if (!r) throw new Error('Usuário não encontrado.');
        return r;
      } catch (e) {
        if (e.code === 11000) throw new Error('E-mail já cadastrado.');
        throw e;
      }
    },
    async remove(id) { await (await col('users')).deleteOne({ id }); },
  };

  const companies = {
    async list() {
      return (await (await col('companies')).find({}, { projection: { _id: 0 } }).sort({ code: 1 }).toArray());
    },
    async upsert({ code, name }) {
      await (await col('companies')).updateOne({ code }, { $set: { code, name } }, { upsert: true });
    },
  };

  // Chave de uma carga: { module, period, company, currencyType } (currencyType null fora do FGI0)
  const toKey = (k) => ({ module: k.module, period: k.period, company: k.company, currencyType: k.currencyType || null });
  const toQuery = (f = {}) => {
    const q = {};
    for (const k of ['module', 'period', 'company', 'batch']) if (f[k] !== undefined) q[k] = f[k];
    if (f.currencyType !== undefined) q.currencyType = f.currencyType || null;
    return q;
  };

  const datasets = {
    async list(filter = {}) {
      return (await col('datasets')).find(toQuery(filter), { projection: { _id: 0, summary: 0 } }).toArray();
    },
    async save(item) { return (await datasets.saveMany([item]))[0]; },
    /** Grava várias cargas com poucas idas ao banco (FGI0 gera centenas de uma vez) */
    async saveMany(items) {
      if (!items.length) return [];
      const rowsCol = await col('dataset_rows');
      const keys = items.map(toKey);
      await rowsCol.deleteMany({ $or: keys });
      const docs = items.flatMap((it, i) => chunks(enxutas(it.rows)).map((r, chunk) => ({ ...keys[i], chunk, rows: r })));
      for (let i = 0; i < docs.length; i += 200) await rowsCol.insertMany(docs.slice(i, i + 200), { ordered: false });
      const now = new Date().toISOString();
      const records = items.map((it, i) => ({ ...keys[i], rows: it.rows.length, ...it.meta, uploadedAt: now }));
      await (await col('datasets')).bulkWrite(records.map((rec, i) => ({
        replaceOne: { filter: keys[i], replacement: { ...rec, summary: items[i].summary }, upsert: true },
      })), { ordered: false });
      return records;
    },
    async getSummary(key) {
      const d = await (await col('datasets')).findOne(toKey(key), { projection: { summary: 1 } });
      return d?.summary || null;
    },
    /** Resumos de várias cargas em uma consulta (consolidado do grupo) */
    async getSummaries(filter) {
      return (await col('datasets')).find(toQuery(filter), { projection: { _id: 0, company: 1, currency: 1, summary: 1 } }).toArray();
    },
    async getRows(key) {
      const docs = await (await col('dataset_rows')).find(toKey(key), { projection: { rows: 1 } }).sort({ chunk: 1 }).toArray();
      return docs.flatMap((d) => d.rows);
    },
    /** Regrava as linhas de uma carga já existente no formato enxuto (otimização do banco) */
    async rewriteRows(key, rows) {
      const rowsCol = await col('dataset_rows');
      const k = toKey(key);
      await rowsCol.deleteMany(k);
      const docs = chunks(enxutas(rows)).map((r, chunk) => ({ ...k, chunk, rows: r }));
      for (let i = 0; i < docs.length; i += 200) await rowsCol.insertMany(docs.slice(i, i + 200), { ordered: false });
      return docs.length;
    },
    async remove(key) { return datasets.removeWhere(toKey(key)); },
    async removeWhere(filter) {
      const q = toQuery(filter);
      const list = await (await col('datasets')).find(q, { projection: { _id: 0, module: 1, period: 1, company: 1, currencyType: 1 } }).toArray();
      if (!list.length) return 0;
      await (await col('dataset_rows')).deleteMany({ $or: list.map(toKey) });
      await (await col('datasets')).deleteMany(q);
      return list.length;
    },
  };

  const params = {
    async list() { return (await col('params')).find({}, { projection: { _id: 0 } }).toArray(); },
    async getRows(id) {
      const meta = await (await col('params')).findOne({ id }, { projection: { _id: 1 } });
      if (!meta) return null;
      const docs = await (await col('param_rows')).find({ id }, { projection: { rows: 1, cols: 1, data: 1 } }).sort({ chunk: 1 }).toArray();
      return docs.flatMap((d) => (d.data != null ? descompactar(d) : d.rows));
    },
    /**
     * meta.compactar = [colunas]: tabelas grandes e simples (EKKO, LFA1, KNA1) são gravadas como texto
     * (uma linha por registro, colunas separadas por tabulação), bem menor que um objeto por linha.
     */
    async save(id, rows, { compactar, ...meta } = {}) {
      const rowsCol = await col('param_rows');
      await rowsCol.deleteMany({ id });
      const docs = compactar
        ? chunksDe(rows, CHUNK_TEXTO).map((r, chunk) => ({ id, chunk, cols: compactar, data: compactarLinhas(r, compactar) }))
        : chunks(rows).map((r, chunk) => ({ id, chunk, rows: r }));
      if (docs.length) await rowsCol.insertMany(docs, { ordered: false });
      const record = { id, rows: rows.length, ...meta, updatedAt: new Date().toISOString() };
      await (await col('params')).replaceOne({ id }, record, { upsert: true });
      return record;
    },
  };

  // Cadastro de obras: { centroLucro (único), siglaGerencial, siglaObra, estrutura, ativa, createdAt, updatedAt, updatedBy }
  const obras = {
    async list() { return (await col('obras')).find({}, { projection: { _id: 0 } }).toArray(); },
    async find(centroLucro) {
      return (await col('obras')).findOne({ centroLucro: String(centroLucro).toUpperCase() }, { projection: { _id: 0 } });
    },
    async save(obra, previous) {
      const c = await col('obras');
      const key = String(previous || obra.centroLucro).toUpperCase();
      try {
        await c.replaceOne({ centroLucro: key }, obra, { upsert: true });
      } catch (e) {
        if (e.code === 11000) throw new Error(`Já existe uma obra com o centro de lucro ${obra.centroLucro}.`);
        throw e;
      }
      return obra;
    },
    async saveMany(list) {
      if (!list.length) return 0;
      const ops = list.map((o) => {
        const { createdAt, ...rest } = o;
        return { updateOne: { filter: { centroLucro: o.centroLucro }, update: { $set: rest, $setOnInsert: { createdAt } }, upsert: true } };
      });
      for (let i = 0; i < ops.length; i += 1000) await (await col('obras')).bulkWrite(ops.slice(i, i + 1000), { ordered: false });
      return list.length;
    },
    async remove(centroLucro) { await (await col('obras')).deleteOne({ centroLucro: String(centroLucro).toUpperCase() }); },
  };

  // Mensagens do rodapé: { id, texto, tipo, inicio, fim, ativa, createdAt, updatedAt, updatedBy }
  const mensagens = {
    async list() { return (await col('mensagens')).find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(); },
    async save(m) { await (await col('mensagens')).updateOne({ id: m.id }, { $set: m }, { upsert: true }); return m; },
    async remove(id) { await (await col('mensagens')).deleteOne({ id }); },
  };

  return {
    users, companies, datasets, params, obras, mensagens,
    /** Uso interno: store de sessão, health check e scripts */
    client, db, dbName,
    async ping() { await (await db()).command({ ping: 1 }); return true; },
    async close() { await client.close(); },
  };
};
