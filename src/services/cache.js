/** Cache LRU em memória. Invalidado por completo a cada upload/remoção (atualização mensal). */
class LruCache {
  constructor(max = 200) { this.max = max; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    this.map.delete(key); this.map.set(key, v);
    return v;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }
  async wrap(key, fn) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const p = fn();
    this.set(key, p); // guarda a Promise: requisições simultâneas compartilham o mesmo carregamento
    try { return await p; } catch (e) { this.map.delete(key); throw e; }
  }
  clear() { this.map.clear(); }
}

module.exports = { summaries: new LruCache(500), rows: new LruCache(40) };
