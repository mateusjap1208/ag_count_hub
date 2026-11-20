/**
 * Painel do resultado na tela da DRE: cards interativos montados só com a DRE contábil (FGI0).
 *
 *  - Resultado (receita líquida, custos, lucro bruto, demais itens e lucro líquido), no mês ou no ano;
 *  - Composição de cada parte do resultado: grupo › subgrupo (N3 do Plano de Contas) › conta;
 *  - Evolução mensal no ano da competência;
 *  - Alertas contábeis (contas a classificar, sem área funcional e sinal fora do padrão no mês).
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
const TOP_ALERTA = 12;
const LIMIAR = 1000; // valores menores que isso (na moeda da tela) não viram alerta de sinal

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

/** "grupo|conta - descrição" → [{ grupo, conta, valor }] */
const contasDe = (map, filtro = () => true) => Object.entries(map || {})
  .filter(([, v]) => !zero(v))
  .map(([k, v]) => { const i = k.indexOf('|'); return { grupo: k.slice(0, i), conta: k.slice(i + 1), valor: round2(v) }; })
  .filter(filtro)
  .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

/**
 * Alertas da competência:
 *  - contas "a classificar" (sem cadastro no Plano de Contas): distorcem a DRE da obra;
 *  - custos e despesas sem área funcional (a área decide custo × despesa);
 *  - sinal fora do padrão no mês: receita negativa ou custo/despesa positivo (estornos, lançamentos invertidos).
 */
function alertas(atual, contasMes, temMes) {
  const out = [];
  const classificar = contasDe(atual.breakdowns.contas, (c) => c.grupo === 'A classificar');
  if (classificar.length) {
    out.push({
      id: 'classificar', nivel: 'alto', titulo: 'Contas sem cadastro no Plano de Contas',
      texto: 'Entram na DRE como "A classificar". Vincule cada conta no Plano de Contas para que caia no grupo certo.',
      total: round2(classificar.reduce((a, c) => a + c.valor, 0)), quantidade: classificar.length,
      contas: classificar.slice(0, TOP_ALERTA), vincular: true,
    });
  }
  const semArea = contasDe(atual.breakdowns.semArea);
  if (semArea.length) {
    out.push({
      id: 'sem-area', nivel: 'medio', titulo: 'Custos e despesas sem área funcional',
      texto: 'A área funcional define se o gasto é custo ou despesa. Sem ela, as contas que podem ser as duas coisas vão para custo.',
      total: round2(semArea.reduce((a, c) => a + c.valor, 0)), quantidade: semArea.length, contas: semArea.slice(0, TOP_ALERTA),
    });
  }
  if (temMes) {
    const invertidas = contasDe(contasMes, (c) => Math.abs(c.valor) >= LIMIAR && (
      (c.grupo === 'Receita Bruta' && c.valor < 0)
      || (['Custos', 'Despesas Gerais e Administrativas'].includes(c.grupo) && c.valor > 0)));
    if (invertidas.length) {
      out.push({
        id: 'sinal', nivel: 'medio', titulo: 'Sinal fora do padrão no mês',
        texto: 'Receita negativa ou custo/despesa positivo no mês: confira estornos e lançamentos invertidos.',
        total: round2(invertidas.reduce((a, c) => a + c.valor, 0)), quantidade: invertidas.length, contas: invertidas.slice(0, TOP_ALERTA),
      });
    }
  }
  return out;
}

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
  const contasMes = ultimo.temMes ? (mesFinal === 1 ? atual.breakdowns.contas : diff(atual.breakdowns.contas, antP.breakdowns.contas)) : null;

  return {
    periodo: P,
    partes: PARTES,
    meses,
    faltando: meses.filter((x) => !x.carregado).map((x) => x.rotulo),
    // Contas de cada subgrupo: só da competência escolhida no topo (no ano e, se houver o mês anterior, no mês)
    contas: { ano: contasPorSubgrupo(atual.breakdowns.composicao), mes: compMes ? contasPorSubgrupo(compMes) : null },
    alertas: alertas(atual, contasMes, ultimo.temMes),
  };
}

module.exports = { montar, PARTES };
