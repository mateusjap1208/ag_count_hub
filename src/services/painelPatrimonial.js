/**
 * Painel patrimonial do Balanço (bp) e do Capital Empregado (capital-empregado): cards interativos
 * com foco nos ativos da obra, montados das mesmas árvores da tela (seção|grupo|linha e contas).
 *
 *  - Destaques do capital de giro (a receber, estoque, adiantamentos, fornecedores, adiantamento de clientes);
 *  - Composição de cada seção (ativos por padrão) por linha, com a variação contra a competência anterior e as contas;
 *  - Ponte entre duas competências (BP: caixa; CE: capital empregado);
 *  - Evolução dos saldos dos destaques;
 *  - Prazos médios (dias) cruzando os saldos com a DRE do mês.
 *
 * Saldos de balanço não acumulam no ano: cada competência é a fotografia do fim do mês.
 * Respeita os filtros da tela (Report.getSummary). Sem comparar obras entre si.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MAX_PERIODOS = 12;
const TOP_CONTAS = 15;

const round2 = (n) => Math.round(n * 100) / 100;
const zero = (v) => Math.abs(v || 0) < 0.005;
const rotuloMes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(2, 4)}`;
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mesAnterior = (p) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/**
 * Configuração por tela. Destaque: soma de linhas da árvore (por grupo ou pelo nome da linha).
 *  tipo 'ativo'   → aumento consome caixa/capital;  tipo 'passivo' → aumento libera (valor mostrado em módulo).
 *  neutro → mostra só a variação, sem dizer se consumiu ou liberou (o próprio caixa).
 */
const CONFIG = {
  bp: {
    secaoPadrao: 'Ativo',
    ponte: { tipo: 'caixa', titulo: 'De onde veio e para onde foi o caixa', caixa: (l) => /^caixa/.test(norm(l.linha)) },
    destaques: [
      { chave: 'caixa', rotulo: 'Caixa e equivalentes', tipo: 'ativo', neutro: true, filtro: (l) => l.secao === 'Ativo' && /^caixa/.test(norm(l.linha)) },
      { chave: 'receber', rotulo: 'Contas a receber', tipo: 'ativo', filtro: (l) => l.secao === 'Ativo' && /contas a receber de clientes|^ativo realizavel a longo prazo$/.test(norm(l.linha)) },
      { chave: 'estoque', rotulo: 'Estoques', tipo: 'ativo', filtro: (l) => l.secao === 'Ativo' && /^estoques/.test(norm(l.linha)) },
      { chave: 'adiantamentos', rotulo: 'Adiantamentos a fornecedores', tipo: 'ativo', filtro: (l) => l.secao === 'Ativo' && /antecipacao|^adiantamentos diversos/.test(norm(l.linha)) },
      { chave: 'fornecedores', rotulo: 'Fornecedores a pagar', tipo: 'passivo', filtro: (l) => l.secao === 'Passivo e PL' && /^fornecedores( e subempreiteiros)?$/.test(norm(l.linha)) },
      { chave: 'adiantClientes', rotulo: 'Adiantamentos de clientes', tipo: 'passivo', filtro: (l) => l.secao === 'Passivo e PL' && /^adiantamentos de clientes/.test(norm(l.linha)) },
    ],
  },
  'capital-empregado': {
    secaoPadrao: 'Ativos',
    ponte: { tipo: 'total', titulo: 'O que mudou o capital empregado' },
    destaques: [
      { chave: 'receber', rotulo: 'A receber (SAR)', tipo: 'ativo', filtro: (l) => l.grupo === 'SAR' },
      { chave: 'estoque', rotulo: 'Estoque', tipo: 'ativo', filtro: (l) => l.grupo === 'Estoque' },
      { chave: 'adiantamentos', rotulo: 'Adiantamentos', tipo: 'ativo', filtro: (l) => l.grupo === 'Adiantamentos' },
      { chave: 'fornecedores', rotulo: 'Fornecedores a pagar', tipo: 'passivo', filtro: (l) => l.grupo === 'Fornecedores/SE a Pagar' },
      { chave: 'adiantClientes', rotulo: 'Adiantamento de clientes (SAD)', tipo: 'passivo', filtro: (l) => l.grupo === 'SAD Total Clientes' },
    ],
  },
};

/** "seção|grupo|linha" → { k, secao, grupo, linha, v } */
function linhasDe(summary, def) {
  const out = [];
  for (const [k, v] of Object.entries(summary?.breakdowns?.[def.tree.breakdown] || {})) {
    if (zero(v)) continue;
    const [secao, grupo, linha] = k.split('|');
    out.push({ k, secao, grupo, linha, v: round2(v) });
  }
  return out;
}

/** Contas de cada linha ("seção|grupo|linha|conta") na competência e na anterior */
function contasDe(atual, anterior, def) {
  const by = new Map();
  const add = (s, i) => {
    for (const [k, v] of Object.entries(s?.breakdowns?.[def.tree.detail] || {})) {
      const partes = k.split('|');
      const linha = partes.slice(0, 3).join('|');
      const conta = partes.slice(3).join('|');
      if (!conta) continue;
      const m = by.get(linha) || by.set(linha, new Map()).get(linha);
      const o = m.get(conta) || m.set(conta, [0, 0]).get(conta);
      o[i] += v;
    }
  };
  add(atual, 0);
  if (anterior) add(anterior, 1);
  const out = {};
  for (const [linha, m] of by) {
    const lista = [...m].filter(([, [a, b]]) => !zero(a) || !zero(b))
      .map(([c, [a, b]]) => [c, round2(a), anterior ? round2(b) : null])
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    const top = lista.slice(0, TOP_CONTAS);
    const resto = lista.slice(TOP_CONTAS);
    if (resto.length) top.push([`Outras ${resto.length} contas`, round2(resto.reduce((a, x) => a + x[1], 0)), anterior ? round2(resto.reduce((a, x) => a + (x[2] || 0), 0)) : null]);
    if (top.length) out[linha] = top;
  }
  return out;
}

/** Valor do mês de um resumo da DRE acumulado no ano (diferença com o mês anterior, ou média mensal do ano) */
function dreDoMes(dreAtual, dreAnt, periodo) {
  if (!dreAtual) return null;
  const mes = Number(periodo.slice(5, 7));
  const g = dreAtual.breakdowns.grupo || {};
  const s = dreAtual.breakdowns.composicao || {};
  const pick = (gr, sb) => {
    const out = { receita: (gr['Receita Bruta'] || 0) + (gr['Deduções da Receita'] || 0), custos: gr.Custos || 0, materiais: 0, salarios: 0 };
    for (const [k, v] of Object.entries(sb)) {
      const sub = norm(k.split('|')[1]);
      if (k.startsWith('Custos|') && /^materiais/.test(sub)) out.materiais += v;
      if (/^salarios/.test(sub)) out.salarios += v; // folha de custo e de despesa
    }
    return out;
  };
  const atual = pick(g, s);
  if (mes === 1) return { ...atual, base: 'mês' };
  if (dreAnt) {
    const ant = pick(dreAnt.breakdowns.grupo || {}, dreAnt.breakdowns.composicao || {});
    return { receita: atual.receita - ant.receita, custos: atual.custos - ant.custos, materiais: atual.materiais - ant.materiais, salarios: atual.salarios - ant.salarios, base: 'mês' };
  }
  return { receita: atual.receita / mes, custos: atual.custos / mes, materiais: atual.materiais / mes, salarios: atual.salarios / mes, base: 'média mensal do ano' };
}

/**
 * Monta o painel. deps: { getSummary(slug, scope), periods(), getModule(slug) } (do model Report).
 */
async function montar(slug, scope, { getSummary, periods, getModule }) {
  const cfg = CONFIG[slug];
  const P = scope.period;
  if (!cfg || !P) return null;
  const def = getModule(slug);
  const lista = (await periods()).filter((p) => p <= P).sort().slice(-MAX_PERIODOS);
  const resumos = new Map();
  await Promise.all(lista.map(async (p) => resumos.set(p, await getSummary(slug, { ...scope, period: p }).catch(() => null))));
  const carregados = lista.filter((p) => resumos.get(p));
  if (!resumos.get(P)) return null;
  const atual = resumos.get(P);
  const iAnt = carregados.indexOf(P) - 1;
  const pAnt = iAnt >= 0 ? carregados[iAnt] : null;

  // Linhas da árvore que compõem cada destaque (em qualquer competência), para o clique no card filtrar a composição
  const destaqueLinhas = Object.fromEntries(cfg.destaques.map((d) => [d.chave, []]));
  const periodosOut = carregados.map((p) => {
    const linhas = linhasDe(resumos.get(p), def);
    const dest = Object.fromEntries(cfg.destaques.map((d) => {
      const doDestaque = linhas.filter(d.filtro);
      doDestaque.forEach((l) => { if (!destaqueLinhas[d.chave].includes(l.k)) destaqueLinhas[d.chave].push(l.k); });
      return [d.chave, round2(doDestaque.reduce((a, l) => a + l.v, 0))];
    }));
    return { periodo: p, rotulo: rotuloMes(p), linhas: Object.fromEntries(linhas.map((l) => [l.k, l.v])), destaques: dest };
  });

  // Prazos médios: saldos da competência × DRE do mês (receita líquida, custos, materiais aplicados)
  const [dreP, dreAnt] = await Promise.all([
    getSummary('dre', { ...scope, period: P }).catch(() => null),
    Number(P.slice(5, 7)) > 1 ? getSummary('dre', { ...scope, period: mesAnterior(P) }).catch(() => null) : null,
  ]);
  const dre = dreDoMes(dreP, dreAnt, P);

  return {
    slug,
    periodo: P,
    anterior: pAnt,
    secoes: def.tree.sections.map((s) => ({ key: s.key, label: s.label })),
    secaoPadrao: cfg.secaoPadrao,
    destaques: cfg.destaques.map(({ chave, rotulo, tipo, neutro }) => ({ chave, rotulo, tipo, neutro: !!neutro, linhas: destaqueLinhas[chave] })),
    ponte: { tipo: cfg.ponte.tipo, titulo: cfg.ponte.titulo, caixa: cfg.ponte.caixa ? linhasDe(atual, def).concat(pAnt ? linhasDe(resumos.get(pAnt), def) : []).filter(cfg.ponte.caixa).map((l) => l.k).filter((k, i, a) => a.indexOf(k) === i) : null },
    periodos: periodosOut,
    contas: contasDe(atual, pAnt ? resumos.get(pAnt) : null, def),
    dre: dre ? { receita: round2(dre.receita), custos: round2(dre.custos), materiais: round2(dre.materiais), base: dre.base } : null,
  };
}

module.exports = { montar, CONFIG, dreDoMes, mesAnterior };
