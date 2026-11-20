/**
 * Agregações pré-calculadas no upload. O resumo (summary) é aditivo: o consolidado
 * do grupo é a soma dos resumos de cada empresa, sem reprocessar as linhas.
 */
const { AGING_SCHEMES } = require('../config/modules');

const DAY = 86400000;
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const codeCmp = (a, b) => collator.compare(String(a), String(b));

/** Último dia do período "AAAA-MM" (data de referência para aging) */
function periodEnd(period) {
  const [y, m] = period.split('-').map(Number);
  return Date.UTC(y, m, 0);
}

function agingBucket(isoDate, refTime, scheme) {
  if (!isoDate) return null;
  const t = Date.parse(isoDate);
  const buckets = AGING_SCHEMES[scheme];
  if (scheme === 'overdue') {
    const late = Math.floor((refTime - t) / DAY);
    if (late <= 0) return buckets[0];
    if (late <= 30) return buckets[1];
    if (late <= 60) return buckets[2];
    if (late <= 90) return buckets[3];
    if (late <= 180) return buckets[4];
    return buckets[5];
  }
  if (scheme === 'expiry') {
    const left = Math.floor((t - refTime) / DAY);
    if (left < 0) return buckets[0];
    if (left <= 30) return buckets[1];
    if (left <= 90) return buckets[2];
    if (left <= 180) return buckets[3];
    return buckets[4];
  }
  // age
  const age = Math.floor((refTime - t) / DAY);
  if (age <= 30) return buckets[0];
  if (age <= 90) return buckets[1];
  if (age <= 180) return buckets[2];
  if (age <= 365) return buckets[3];
  return buckets[4];
}

function computeSummary(rows, moduleDef, period) {
  const ref = periodEnd(period);
  // Colunas numéricas + campos extras somados só para os indicadores (não aparecem na tabela)
  const numericCols = [...moduleDef.columns.filter((c) => c.type === 'number').map((c) => c.key), ...(moduleDef.sumFields || [])];
  const totals = Object.fromEntries(numericCols.map((k) => [k, { sum: 0, pos: 0, neg: 0 }]));
  const breakdowns = Object.fromEntries(moduleDef.breakdowns.map((b) => [b.id, {}]));

  for (const row of rows) {
    for (const k of numericCols) {
      const v = row[k] || 0;
      totals[k].sum += v;
      if (v >= 0) totals[k].pos += v; else totals[k].neg += v;
    }
    for (const b of moduleDef.breakdowns) {
      // spread(row, period): a linha contribui para várias chaves (ex.: apropriação mês a mês)
      if (b.spread) {
        for (const [k, v] of b.spread(row, period)) breakdowns[b.id][k] = (breakdowns[b.id][k] || 0) + v;
        continue;
      }
      const key = b.aging
        ? agingBucket(row[b.aging.dateField], ref, b.aging.scheme)
        : (row[b.field] || 'Não informado');
      if (key == null) continue;
      const v = b.value === '_count' ? 1 : (row[b.value] || 0);
      breakdowns[b.id][key] = (breakdowns[b.id][key] || 0) + v;
    }
  }
  return { count: rows.length, totals, breakdowns };
}

function mergeSummaries(list) {
  const out = { count: 0, totals: {}, breakdowns: {} };
  for (const s of list) {
    out.count += s.count;
    for (const [k, t] of Object.entries(s.totals)) {
      const o = (out.totals[k] ||= { sum: 0, pos: 0, neg: 0 });
      o.sum += t.sum; o.pos += t.pos; o.neg += t.neg;
    }
    for (const [id, map] of Object.entries(s.breakdowns)) {
      const o = (out.breakdowns[id] ||= {});
      for (const [k, v] of Object.entries(map)) o[k] = (o[k] || 0) + v;
    }
  }
  return out;
}

/** Ordena/limita um breakdown para exibição em gráfico */
function breakdownSeries(b, map, moduleDef) {
  let entries = Object.entries(map || {});
  if (b.aging) {
    const order = AGING_SCHEMES[b.aging.scheme];
    entries = order.map((k) => [k, map?.[k] || 0]);
  } else if (b.order) {
    entries = b.order.map((k) => [k, map?.[k] || 0]); // ordem fixa (ex.: Saudável → Obsoleto)
  } else if (b.keepOrder) {
    // mantém a ordem de inserção (ordem da estrutura de parâmetros)
  } else if (b.sortKeys) {
    entries.sort((a, z) => a[0].localeCompare(z[0]));
  } else if (b.field === 'grupo' && moduleDef.groupOrder) {
    const idx = (k) => { const i = moduleDef.groupOrder.indexOf(k); return i < 0 ? 999 : i; };
    entries.sort((a, z) => idx(a[0]) - idx(z[0]));
  } else {
    entries.sort((a, z) => Math.abs(z[1]) - Math.abs(a[1]));
  }
  if (b.top && entries.length > b.top) {
    const head = entries.slice(0, b.top);
    if (b.chart === 'doughnut') {
      const rest = entries.slice(b.top).reduce((a, [, v]) => a + v, 0);
      head.push(['Outros', rest]);
    }
    entries = head;
  }
  return { labels: entries.map((e) => (b.labelFn ? b.labelFn(e[0]) : e[0])), values: entries.map((e) => round2(e[1])) };
}

/** Monta uma demonstração estruturada (ex.: DRE em cascata) */
function buildStatement(moduleDef, summary) {
  if (!moduleDef.statement) return null;
  const groups = summary.breakdowns.grupo || {};
  let running = 0;
  return moduleDef.statement.map((line) => {
    if (line.subtotal) return { label: line.label, value: round2(running), subtotal: true, highlight: !!line.highlight };
    const v = line.groups.reduce((a, gname) => a + (groups[gname] || 0), 0);
    running += v;
    if (line.optional && Math.abs(v) < 0.005) return null; // linha só aparece quando há valor
    return { label: line.label, value: round2(v) };
  }).filter(Boolean);
}

/**
 * Demonstração em árvore (BP e Capital Empregado): seção → grupo → item.
 * As chaves do breakdown são "seção|grupo|item".
 */
/**
 * Demonstração em árvore (BP / Capital Empregado): seção → grupo → linha → conta contábil.
 * summaries: [atual, comparativo1, ...] — uma coluna de valores por competência (demonstração comparativa).
 * Cada linha traz `values` (um valor por competência, null quando a competência não tem dados) e `value` (= atual).
 * As contas contábeis vêm do breakdown `tree.detail` (chave "seção|grupo|linha|conta - descrição").
 * itemSort: 'abs' (maior valor primeiro) | 'insertion' | 'ordem' — ordem da estrutura (BP: estrutura BPC),
 *   com `opts.contaOrder` = Map(rótulo da conta → posição). A linha fica na posição mediana das suas contas;
 *   contas e linhas sem posição vão para o fim do grupo (pelo valor).
 */
function buildTree(moduleDef, summaries, opts = {}) {
  const t = moduleDef.tree;
  if (!t) return null;
  const list = (Array.isArray(summaries) ? summaries : [summaries]);
  const n = list.length;
  const tree = new Map(); // seção → grupo → linha → { v: [..], contas: Map(conta → [..]) }
  const slot = () => Array(n).fill(null);
  const add = (arr, i, v) => { arr[i] = (arr[i] || 0) + v; };
  list.forEach((summary, i) => {
    if (!summary) return;
    for (const [key, v] of Object.entries(summary.breakdowns[t.breakdown] || {})) {
      const [sec, grp, item] = key.split('|');
      const gm = tree.get(sec) || tree.set(sec, new Map()).get(sec);
      const im = gm.get(grp) || gm.set(grp, new Map()).get(grp);
      const it = im.get(item) || im.set(item, { v: slot(), contas: new Map() }).get(item);
      add(it.v, i, v);
    }
    if (t.detail) {
      for (const [key, v] of Object.entries(summary.breakdowns[t.detail] || {})) {
        const [sec, grp, item, ...rest] = key.split('|');
        const conta = rest.join('|');
        const it = tree.get(sec)?.get(grp)?.get(item);
        if (!it || !conta || conta === item) continue; // linha que já é a própria conta (ex.: "a classificar")
        const c = it.contas.get(conta) || it.contas.set(conta, slot()).get(conta);
        add(c, i, v);
      }
    }
  });
  const has = list.map(Boolean);
  const zero = (arr) => arr.every((x) => Math.abs(x || 0) < 0.005);
  const fin = (arr) => arr.map((x, i) => (has[i] ? round2(x || 0) : null));
  const sum = (arrs) => { const o = Array(n).fill(0); arrs.forEach((a) => a.forEach((x, i) => { o[i] += x || 0; })); return o; };
  const byAbs = (a, b) => Math.abs(b[1][0] || 0) - Math.abs(a[1][0] || 0);
  const porOrdem = t.itemSort === 'ordem';
  const pos = opts.contaOrder || new Map();
  const posOf = (label) => (pos.has(label) ? pos.get(label) : Infinity);
  const byPos = (pa, pb, a, b) => (pa === pb ? (pa === Infinity ? byAbs(a, b) : codeCmp(a[0], b[0])) : pa - pb);
  const contaSort = (a, b) => byPos(posOf(a[0]), posOf(b[0]), a, b);
  // Linha: mediana das posições das suas contas (uma conta de outra parte da estrutura não arrasta a linha);
  // sem contas, a posição da própria linha quando ela já é a conta (ex.: "a classificar")
  const itemPos = (item, contas) => {
    const ps = [...contas.keys()].map(posOf).filter(Number.isFinite).sort((a, b) => a - b);
    return ps.length ? ps[(ps.length - 1) >> 1] : posOf(item);
  };
  const line = (o, values) => { const vals = fin(values); return { ...o, values: vals, value: vals[0] }; };

  const order = moduleDef.groupOrder || [];
  const gIdx = (x) => { const i = order.indexOf(x); return i < 0 ? 999 : i; };
  const lines = [];
  const grandParts = [];
  for (const s of t.sections) {
    const gm = tree.get(s.key);
    if (!gm) continue;
    lines.push({ label: s.label, kind: 'section' });
    const groups = [...gm.keys()];
    if (order.length) groups.sort((a, b) => gIdx(a) - gIdx(b));
    const secParts = [];
    for (const grp of groups) {
      const items = [...gm.get(grp)].map(([item, o]) => [item, o.v, o.contas]);
      if (t.itemSort === 'abs') items.sort(byAbs);
      else if (porOrdem) {
        const ip = new Map(items.map((x) => [x[0], itemPos(x[0], x[2])]));
        items.sort((a, b) => byPos(ip.get(a[0]), ip.get(b[0]), a, b));
      }
      const gTotal = sum(items.map((x) => x[1]));
      secParts.push(gTotal);
      lines.push(line({ label: grp, kind: 'group' }, gTotal));
      for (const [item, v, contas] of items) {
        if (zero(v)) continue;
        const det = [...contas].filter(([, cv]) => !zero(cv)).sort(porOrdem ? contaSort : byAbs);
        lines.push(line({ label: item, kind: 'item', contas: det.length }, v));
        for (const [conta, cv] of det) lines.push(line({ label: conta, kind: 'conta' }, cv));
      }
    }
    const secTotal = sum(secParts);
    grandParts.push(secTotal);
    lines.push(line({ label: s.total, kind: 'total' }, secTotal));
  }
  if (t.grandTotal) lines.push(line({ label: t.grandTotal, kind: 'total', highlight: true }, sum(grandParts)));
  return lines;
}

/**
 * Demonstração em cascata (DRE) no formato de árvore: cada linha abre as suas contas contábeis
 * e há uma coluna por competência (comparativo). Usa moduleDef.statement + breakdown `statementDetail`
 * (chave "grupo|conta - descrição"). Subtotais acumulam as linhas anteriores.
 */
function buildStatementTree(moduleDef, summaries) {
  if (!moduleDef.statement || !moduleDef.statementDetail) return null;
  const list = Array.isArray(summaries) ? summaries : [summaries];
  const n = list.length;
  const has = list.map(Boolean);
  const fin = (arr) => arr.map((x, i) => (has[i] ? round2(x || 0) : null));
  const line = (o, values) => { const vals = fin(values); return { ...o, values: vals, value: vals[0] }; };
  const running = Array(n).fill(0);
  const lines = [];
  for (const st of moduleDef.statement) {
    if (st.subtotal) { lines.push(line({ label: st.label, kind: 'total', highlight: !!st.highlight }, running)); continue; }
    const v = Array(n).fill(0);
    const contas = new Map();
    list.forEach((s, i) => {
      if (!s) return;
      for (const gname of st.groups) v[i] += s.breakdowns.grupo?.[gname] || 0;
      for (const [key, val] of Object.entries(s.breakdowns[moduleDef.statementDetail] || {})) {
        const sep = key.indexOf('|');
        if (!st.groups.includes(key.slice(0, sep))) continue;
        const conta = key.slice(sep + 1);
        const c = contas.get(conta) || contas.set(conta, Array(n).fill(0)).get(conta);
        c[i] += val;
      }
    });
    v.forEach((x, i) => { running[i] += x; });
    if (st.optional && v.every((x) => Math.abs(x) < 0.005)) continue;
    const det = [...contas].filter(([, cv]) => cv.some((x) => Math.abs(x) >= 0.005)).sort((a, b) => Math.abs(b[1][0]) - Math.abs(a[1][0]));
    lines.push(line({ label: st.label, kind: 'item', contas: det.length }, v));
    for (const [conta, cv] of det) lines.push(line({ label: conta, kind: 'conta' }, cv));
  }
  return lines;
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { computeSummary, mergeSummaries, breakdownSeries, buildStatement, buildTree, buildStatementTree, periodEnd };
