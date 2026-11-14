/**
 * Driver de persistência local em arquivos JSON (fase de testes).
 * Implementa o mesmo contrato que o futuro driver MongoDB (ver ../mongo/index.js).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, writeJson, remove } = require('./jsonStore');

module.exports = function createJsonRepositories(dataDir) {
  const usersFile = path.join(dataDir, 'users.json');
  const companiesFile = path.join(dataDir, 'companies.json');
  const indexFile = path.join(dataDir, 'datasets', 'index.json');
  const dsBase = (m, p, c) => path.join(dataDir, 'datasets', m, p, safe(c));
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

  // Serializa escritas no índice para evitar condição de corrida entre uploads
  let lock = Promise.resolve();
  const withLock = (fn) => (lock = lock.then(fn, fn));

  const users = {
    async list() { return readJson(usersFile, []); },
    async findByEmail(email) {
      const all = await users.list();
      return all.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
    },
    async findById(id) { return (await users.list()).find((u) => u.id === id) || null; },
    async create({ email, name, passwordHash, role = 'viewer', active = true, todosCentros = true, centros = [] }) {
      return withLock(async () => {
        const all = await users.list();
        if (all.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('E-mail já cadastrado.');
        const now = new Date().toISOString();
        const user = { id: crypto.randomUUID(), email, name, passwordHash, role, active, todosCentros, centros, createdAt: now, updatedAt: now };
        all.push(user);
        await writeJson(usersFile, all);
        return user;
      });
    },
    async update(id, patch) {
      return withLock(async () => {
        const all = await users.list();
        const u = all.find((x) => x.id === id);
        if (!u) throw new Error('Usuário não encontrado.');
        if (patch.email && all.some((x) => x.id !== id && x.email.toLowerCase() === patch.email.toLowerCase())) throw new Error('E-mail já cadastrado.');
        Object.assign(u, patch, { updatedAt: new Date().toISOString() });
        await writeJson(usersFile, all);
        return u;
      });
    },
    async remove(id) {
      return withLock(async () => {
        const all = await users.list();
        await writeJson(usersFile, all.filter((u) => u.id !== id));
      });
    },
    async touchLogin(id) {
      return withLock(async () => {
        const all = await users.list();
        const u = all.find((x) => x.id === id);
        if (u) { u.lastLoginAt = new Date().toISOString(); await writeJson(usersFile, all); }
      });
    },
    async setBuildVisto(id, build) {
      return withLock(async () => {
        const all = await users.list();
        const u = all.find((x) => x.id === id);
        if (u) { u.buildVisto = build; await writeJson(usersFile, all); }
      });
    },
  };

  const companies = {
    async list() {
      const all = await readJson(companiesFile, []);
      return all.sort((a, b) => a.code.localeCompare(b.code));
    },
    async upsert({ code, name }) {
      return withLock(async () => {
        const all = await readJson(companiesFile, []);
        const found = all.find((c) => c.code === code);
        if (found) found.name = name; else all.push({ code, name });
        await writeJson(companiesFile, all);
      });
    },
  };

  // Chave de uma carga: { module, period, company, currencyType }
  // currencyType: 'grupo' | 'empresa' para relatórios gerados do FGI0; null para os demais
  const ct = (k) => k.currencyType || null;
  const sameKey = (d, k) => d.module === k.module && d.period === k.period && d.company === k.company && ct(d) === ct(k);
  const keyBase = (k) => {
    const base = dsBase(k.module, k.period, k.company);
    return ct(k) ? `${base}__${ct(k)}` : base;
  };
  const matches = (d, f) => Object.entries(f).every(([k, v]) => v === undefined || (k === 'currencyType' ? ct(d) === (v || null) : d[k] === v));

  const datasets = {
    /** Lista metadados das cargas (sem linhas). Filtros: module, period, company, currencyType, batch */
    async list(filter = {}) {
      return (await readJson(indexFile, [])).filter((d) => matches(d, filter));
    },
    async save(item) { return (await datasets.saveMany([item]))[0]; },
    /** Grava várias cargas de uma vez (ex.: FGI0 → BP, DRE e CE de cada empresa) */
    async saveMany(items) {
      for (const it of items) {
        await writeJson(`${keyBase(it)}.rows.json`, it.rows);
        await writeJson(`${keyBase(it)}.summary.json`, it.summary);
      }
      return withLock(async () => {
        const idx = await readJson(indexFile, []);
        const now = new Date().toISOString();
        const records = items.map(({ module, period, company, currencyType, rows, meta }) => ({
          module, period, company, currencyType: currencyType || null, rows: rows.length, ...meta, uploadedAt: now,
        }));
        for (const rec of records) {
          const i = idx.findIndex((d) => sameKey(d, rec));
          if (i >= 0) idx[i] = rec; else idx.push(rec);
        }
        await writeJson(indexFile, idx);
        return records;
      });
    },
    async getSummary(key) { return readJson(`${keyBase(key)}.summary.json`, null); },
    async getSummaries(filter) {
      const list = await datasets.list(filter);
      return Promise.all(list.map(async (d) => ({ company: d.company, currency: d.currency, summary: await datasets.getSummary(d) })));
    },
    async getRows(key) { return readJson(`${keyBase(key)}.rows.json`, []); },
    async remove(key) { return datasets.removeMany((d) => sameKey(d, key)); },
    /** Remove cargas por filtro (objeto como em list) ou função */
    async removeWhere(filter) { return datasets.removeMany((d) => matches(d, filter)); },
    async removeMany(pred) {
      return withLock(async () => {
        const idx = await readJson(indexFile, []);
        const gone = idx.filter(pred);
        for (const d of gone) {
          await remove(`${keyBase(d)}.rows.json`);
          await remove(`${keyBase(d)}.summary.json`);
        }
        await writeJson(indexFile, idx.filter((d) => !pred(d)));
        return gone.length;
      });
    },
  };

  const paramsIndex = path.join(dataDir, 'params', 'index.json');
  const paramFile = (id) => path.join(dataDir, 'params', `${safe(id)}.json`);
  const params = {
    /** Metadados das tabelas de parâmetros carregadas */
    async list() { return readJson(paramsIndex, []); },
    async getRows(id) { return readJson(paramFile(id), null); },
    async save(id, rows, meta) {
      await writeJson(paramFile(id), rows);
      return withLock(async () => {
        const idx = await readJson(paramsIndex, []);
        const record = { id, rows: rows.length, ...meta, updatedAt: new Date().toISOString() };
        const i = idx.findIndex((p) => p.id === id);
        if (i >= 0) idx[i] = record; else idx.push(record);
        await writeJson(paramsIndex, idx);
        return record;
      });
    },
  };

  // Cadastro de obras (centro de lucro → siglas e estrutura)
  const obrasFile = path.join(dataDir, 'obras.json');
  const sameObra = (a, b) => a.centroLucro.toUpperCase() === b.toUpperCase();
  const obras = {
    async list() { return readJson(obrasFile, []); },
    async find(centroLucro) { return (await obras.list()).find((o) => sameObra(o, centroLucro)) || null; },
    /** Grava (insere ou substitui) uma obra; `previous` permite trocar o centro de lucro na edição */
    async save(obra, previous) {
      return withLock(async () => {
        const all = await readJson(obrasFile, []);
        const key = previous || obra.centroLucro;
        const i = all.findIndex((o) => sameObra(o, key));
        if (i >= 0) all[i] = obra; else all.push(obra);
        await writeJson(obrasFile, all);
        return obra;
      });
    },
    async saveMany(list) {
      return withLock(async () => {
        const all = await readJson(obrasFile, []);
        const idx = new Map(all.map((o, i) => [o.centroLucro.toUpperCase(), i]));
        for (const o of list) {
          const i = idx.get(o.centroLucro.toUpperCase());
          if (i !== undefined) all[i] = { ...all[i], ...o, createdAt: all[i].createdAt || o.createdAt };
          else { idx.set(o.centroLucro.toUpperCase(), all.length); all.push(o); }
        }
        await writeJson(obrasFile, all);
        return list.length;
      });
    },
    async remove(centroLucro) {
      return withLock(async () => {
        const all = await readJson(obrasFile, []);
        await writeJson(obrasFile, all.filter((o) => !sameObra(o, centroLucro)));
      });
    },
  };

  return { users, companies, datasets, params, obras };
};
