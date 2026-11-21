/**
 * Painel do resultado na tela da DRE: cards interativos montados só com a DRE contábil (FGI0).
 *
 *  - Resultado (receita líquida, custos, lucro bruto, demais itens e lucro líquido), no mês ou no ano;
 *  - Composição de cada parte do resultado: grupo › subgrupo (N3 do Plano de Contas) › conta;
 *  - Evolução mensal no ano da competência;
 *
 * O FGI0 traz o saldo ACUMULADO NO ANO. O valor de um mês = acumulado do mês − acumulado do mês anterior
 * (janeiro = o próprio acumulado). Sem o FGI0 do mês anterior, o mês fica só com o acumulado.
 * Respeita os mesmos filtros da tela (competência, empresa, obra, moeda): usa os resumos de Report.getSummary.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Partes do resultado: cada uma reúne grupos da DRE (os mesmos de modules.js › dre.groupOrder) */
const PARTES = [
  { id: 'receita', label: 'Receita', grupos: ['Receita Bruta', 'Deduções da Receita'] },
  { id: 'custos', label: 'Custos', grupos: ['Custos'] },
  { id: 'despesas', label: 'Despesas operacionais', grupos: ['Despesas Gerais e Administrativas', 'Resultado de Equivalência Patrimonial', 'Provisões para Perdas e Riscos', 'Outras Receitas (Despesas) Operacionais'] },
  { id: 'financeiro', label: 'Resultado financeiro', grupos: ['Resultado Financeiro'] },
  { id: 'ir', label: 'IR e CSLL', grupos: ['IR e CSLL'] },
  { id: 'classificar', label: 'A classificar', grupos: ['A classificar'] },
];

const TOP_CONTAS = 15; // contas por subgrupo na composição (as demais somadas em "outras contas")

const round2 = (n) => Math.round(n * 100) / 100;
const zero = (v) => Math.abs(v || 0) < 0.005;
const pad = (n) => String(n).padStart(2, '0');
const rotuloMes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(2, 4)}`;

/** a − b, por chave (b ausente = 0) */
function diff(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const v = (a?.[k] || 0) - (b?.[k] || 0);
    if (!zero(v)) out[k] = round2(v);
  }
  return out;
}
const limpar = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => !zero(v)).map(([k, v]) => [k, round2(v)]));

/** "grupo|subgrupo|conta" → "grupo|subgrupo" */
function porSubgrupo(comp) {
  const out = {};
  for (const [k, v] of Object.entries(comp || {})) {
    const [g, s] = k.split('|');
    const key = `${g}|${s}`;
    out[key] = (out[key] || 0) + v;
  }
  return limpar(out);
}

/** Contas de cada subgrupo (maiores primeiro), as que passam de TOP_CONTAS somadas numa linha só */
function contasPorSubgrupo(comp) {
  const by = new Map();
  for (const [k, v] of Object.entries(comp || {})) {
    if (zero(v)) continue;
    const [g, s, ...rest] = k.split('|');
    const key = `${g}|${s}`;
    (by.get(key) || by.set(key, []).get(key)).push([rest.join('|'), round2(v)]);
  }
  const out = {};
  for (const [key, list] of by) {
    list.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top = list.slice(0, TOP_CONTAS);
    const resto = list.slice(TOP_CONTAS);
    if (resto.length) top.push([`Outras ${resto.length} contas`, round2(resto.reduce((a, x) => a + x[1], 0))]);
    out[key] = top;
  }
  return out;
}

const TOP_PARETO = 60;
/**
 * Pareto de uma parte do resultado (custos ou despesas): contas da maior para a menor, em valor absoluto.
 * Vão as TOP_PARETO maiores; as demais vêm somadas, para o % acumulado continuar exato.
 */
function pareto(comp, grupos) {
  const contas = Object.entries(comp || {})
    .map(([k, v]) => { const [g, s, ...rest] = k.split('|'); return { g, s, c: rest.join('|'), v }; })
    .filter((x) => grupos.includes(x.g) && !zero(x.v))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  if (!contas.length) return null;
  const top = contas.slice(0, TOP_PARETO);
  const resto = contas.slice(TOP_PARETO);
  return {
    totalAbs: round2(contas.reduce((a, x) => a + Math.abs(x.v), 0)),
    quantidade: contas.length,
    contas: top.map((x) => [x.c, x.s, round2(x.v)]),
    demais: resto.length ? { quantidade: resto.length, valor: round2(resto.reduce((a, x) => a + x.v, 0)) } : null,
  };
}
const paretos = (comp) => (comp ? Object.fromEntries(['custos', 'despesas'].map((id) => [id, pareto(comp, PARTES.find((p) => p.id === id).grupos)])) : null);

/**
 * Monta o painel para o escopo da tela.
 * deps: { getSummary(slug, scope), periods() } — do model Report (injetado para evitar dependência circular).
 */
async function montar(scope, { getSummary, periods }) {
  const P = scope.period;
  if (!P) return null;
  const ano = P.slice(0, 4);
  const carregadas = new Set((await periods()).filter((p) => p.startsWith(ano) && p <= P));
  const mesFinal = Number(P.slice(5, 7));
  const resumos = new Map();
  await Promise.all([...carregadas].map(async (p) => resumos.set(p, await getSummary('dre', { ...scope, period: p }).catch(() => null))));
  const atual = resumos.get(P);
  if (!atual) return null;

  const meses = [];
  for (let m = 1; m <= mesFinal; m++) {
    const p = `${ano}-${pad(m)}`;
    const s = resumos.get(p) || null;
    const ant = m === 1 ? null : resumos.get(`${ano}-${pad(m - 1)}`) || null;
    const temMes = !!s && (m === 1 || !!ant);
    const gAno = s ? limpar(s.breakdowns.grupo) : null;
    const cAno = s ? porSubgrupo(s.breakdowns.composicao) : null;
    meses.push({
      periodo: p,
      rotulo: rotuloMes(p),
      carregado: !!s,
      temMes,
      ano: s ? { grupos: gAno, subgrupos: cAno } : null,
      mes: temMes ? (m === 1 ? { grupos: gAno, subgrupos: cAno } : { grupos: diff(s.breakdowns.grupo, ant.breakdowns.grupo), subgrupos: diff(cAno, porSubgrupo(ant.breakdowns.composicao)) }) : null,
    });
  }

  const ultimo = meses[meses.length - 1];
  const antP = mesFinal > 1 ? resumos.get(`${ano}-${pad(mesFinal - 1)}`) : null;
  const compMes = ultimo.temMes ? (mesFinal === 1 ? atual.breakdowns.composicao : diff(atual.breakdowns.composicao, antP.breakdowns.composicao)) : null;

  return {
    periodo: P,
    partes: PARTES,
    meses,
    faltando: meses.filter((x) => !x.carregado).map((x) => x.rotulo),
    // Contas de cada subgrupo: só da competência escolhida no topo (no ano e, se houver o mês anterior, no mês)
    contas: { ano: contasPorSubgrupo(atual.breakdowns.composicao), mes: compMes ? contasPorSubgrupo(compMes) : null },
    pareto: { ano: paretos(atual.breakdowns.composicao), mes: compMes ? paretos(compMes) : null },
  };
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca de conta contábil na DRE do escopo: valor de cada mês do ano (acumulado e, quando há o mês anterior, do mês)
 * e o peso da conta no seu grupo na competência. Até 20 contas (as de maior valor no ano).
 */
async function buscarContas(scope, termo, { getSummary, periods }) {
  const P = scope.period;
  const q = semAcento(termo).trim();
  if (!P || q.length < 2) return { periodo: P, contas: [] };
  const ano = P.slice(0, 4);
  const carregadas = new Set((await periods()).filter((p) => p.startsWith(ano) && p <= P));
  const mesFinal = Number(P.slice(5, 7));
  const resumos = new Map();
  await Promise.all([...carregadas].map(async (p) => resumos.set(p, await getSummary('dre', { ...scope, period: p }).catch(() => null))));
  const atual = resumos.get(P);
  if (!atual) return { periodo: P, contas: [] };
  const termos = q.split(/\s+/);
  // Contas que casam com a busca (número ou descrição), em qualquer mês do ano
  const achadas = new Map(); // conta → Set(grupo)
  for (const s of resumos.values()) {
    for (const k of Object.keys(s?.breakdowns?.contas || {})) {
      const i = k.indexOf('|');
      const conta = k.slice(i + 1);
      const alvo = semAcento(conta);
      if (termos.every((t) => alvo.includes(t))) (achadas.get(conta) || achadas.set(conta, new Set()).get(conta)).add(k.slice(0, i));
    }
  }
  const valorEm = (s, conta, grupos) => (s ? [...grupos].reduce((a, g) => a + (s.breakdowns.contas[`${g}|${conta}`] || 0), 0) : null);
  const contas = [...achadas].map(([conta, grupos]) => {
    const serie = [];
    for (let m = 1; m <= mesFinal; m++) {
      const p = `${ano}-${pad(m)}`;
      const s = resumos.get(p);
      const ant = m === 1 ? null : resumos.get(`${ano}-${pad(m - 1)}`);
      const vAno = valorEm(s, conta, grupos);
      const vMes = s && (m === 1 || ant) ? vAno - (m === 1 ? 0 : valorEm(ant, conta, grupos)) : null;
      serie.push({ periodo: p, rotulo: rotuloMes(p), ano: vAno == null ? null : round2(vAno), mes: vMes == null ? null : round2(vMes) });
    }
    const gs = [...grupos];
    const totalGrupo = gs.reduce((a, g) => a + (atual.breakdowns.grupo[g] || 0), 0);
    const ult = serie[serie.length - 1];
    return { conta, grupos: gs, serie, ano: ult.ano || 0, mes: ult.mes, pesoGrupo: totalGrupo ? round2((ult.ano || 0) / totalGrupo) : null };
  }).sort((a, b) => Math.abs(b.ano) - Math.abs(a.ano)).slice(0, 20);
  return { periodo: P, contas };
}

module.exports = { montar, buscarContas, PARTES };
