/**
 * Agregações pré-calculadas no upload. O resumo (summary) é aditivo: o consolidado
 * do grupo é a soma dos resumos de cada empresa, sem reprocessar as linhas.
 */
const { AGING_SCHEMES } = require('../config/modules');

const DAY = 86400000;

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
function buildTree(moduleDef, summary) {
  const t = moduleDef.tree;
  if (!t) return null;
  const map = summary.breakdowns[t.breakdown] || {};
  const tree = new Map(); // seção → grupo → [item, valor]
  for (const [key, v] of Object.entries(map)) {
    const [sec, grp, item] = key.split('|');
    if (!tree.has(sec)) tree.set(sec, new Map());
    const gm = tree.get(sec);
    if (!gm.has(grp)) gm.set(grp, []);
    gm.get(grp).push([item, v]);
  }
  const order = moduleDef.groupOrder || [];
  const gIdx = (x) => { const i = order.indexOf(x); return i < 0 ? 999 : i; };
  const lines = [];
  let grand = 0;
  for (const s of t.sections) {
    const gm = tree.get(s.key);
    if (!gm) continue;
    let secTotal = 0;
    lines.push({ label: s.label, kind: 'section' });
    const groups = [...gm.keys()];
    if (order.length) groups.sort((a, b) => gIdx(a) - gIdx(b));
    for (const grp of groups) {
      const items = gm.get(grp);
      if (t.itemSort === 'abs') items.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const gTotal = items.reduce((a, [, v]) => a + v, 0);
      secTotal += gTotal;
      lines.push({ label: grp, value: round2(gTotal), kind: 'group' });
      for (const [item, v] of items) if (Math.abs(v) >= 0.005) lines.push({ label: item, value: round2(v), kind: 'item' });
    }
    grand += secTotal;
    lines.push({ label: s.total, value: round2(secTotal), kind: 'total' });
  }
  if (t.grandTotal) lines.push({ label: t.grandTotal, value: round2(grand), kind: 'total', highlight: true });
  return lines;
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { computeSummary, mergeSummaries, breakdownSeries, buildStatement, buildTree, periodEnd };
