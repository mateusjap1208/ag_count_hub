/**
 * Temas do balanço (folha, tributos, fornecedores) e visões complementares:
 *  - BP (visão contábil): notas explicativas por tema e índices de liquidez/endividamento;
 *  - Capital Empregado (visão de obra): "o que a obra deve" por tema e "quanto custa encerrar a obra hoje".
 *
 * O plano de contas não detalha esses assuntos (folha é um N4 só), então os subtemas saem da descrição da conta.
 * Valores apresentados como OBRIGAÇÃO: passivo positivo; ativo do mesmo tema (ex.: imposto a recuperar) entra negativo.
 * Respeita os filtros da tela (Report.getSummary). Sem comparar obras entre si.
 */
const { dreDoMes, mesAnterior } = require('./painelPatrimonial');

const round2 = (n) => Math.round(n * 100) / 100;
const zero = (v) => Math.abs(v || 0) < 0.005;
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(2, 4)}`;

/** Temas: quais linhas da árvore entram e como cada conta vira subtema (pela descrição; a primeira regra que casar) */
const TEMAS = [
  {
    id: 'folha',
    rotulo: 'Folha de pagamento e encargos',
    obra: 'Pessoal',
    linha: (l) => /^salarios/.test(l),
    subtemas: [
      { nome: 'Rescisão (multa do FGTS)', obra: 'Rescisão provisionada', re: /multa do fgts|rescis|aviso previo|indeniza/ },
      { nome: 'Férias e encargos', obra: 'Férias (com encargos)', re: /ferias/ },
      { nome: '13º salário e encargos', obra: '13º salário (com encargos)', re: /13/ },
      { nome: 'Salários a pagar', obra: 'Salários a pagar', re: /salario liquido|salarios a pagar|ordenados|remunera/ },
      { nome: 'Encargos sociais a recolher', obra: 'INSS, FGTS e encargos a recolher', re: /inss|fgts|terceiros|contribuic|sindica|pis sobre folha/ },
      { nome: 'Benefícios', obra: 'Benefícios (saúde, vida, previdência)', re: /seguro|saude|vida|previd|plano|vale|aliment|transporte|beneficio/ },
      { nome: 'Outras obrigações trabalhistas', obra: 'Outras obrigações com pessoal', re: /./ },
    ],
  },
  {
    id: 'tributos',
    rotulo: 'Tributos',
    obra: 'Impostos',
    linha: (l) => /^impostos|^tributos/.test(l),
    subtemas: [
      { nome: 'Diferidos (sem efeito de caixa)', obra: 'Diferidos (não é caixa)', re: /diferid|credito fiscal temporario|prejuizo fiscal/ },
      { nome: 'Parcelamentos e transações', obra: 'Parcelamentos', lado: 'passivo', re: /parcelamento|transacao|refis|pert|prt/ },
      { nome: 'A recuperar / compensar', obra: 'A recuperar', lado: 'ativo', re: /./ },
      { nome: 'Retidos de terceiros e empregados', obra: 'Retidos (repassar ao fisco)', lado: 'passivo', re: /retid|irrf|autonom|irpf/ },
      { nome: 'Próprios a recolher', obra: 'Impostos da obra a pagar', lado: 'passivo', re: /./ },
    ],
  },
  {
    id: 'fornecedores',
    rotulo: 'Fornecedores e subempreiteiros',
    obra: 'Fornecedores',
    linha: (l) => /^fornecedores/.test(l) && !/antecipacao/.test(l), // "antecipação" é adiantamento (ativo), não obrigação
    subtemas: [
      { nome: 'Recepção e conferência', obra: 'Recebido sem nota ou medição', re: /recep|confer/ },
      { nome: 'Retenções contratuais', obra: 'Retenções contratuais (garantia)', re: /\brg\b|retenc|garantia|caucao/ },
      { nome: 'Acréscimos de gastos', obra: 'Gastos a apropriar', re: /acrescimo|credores/ },
      { nome: 'Fornecedores em conta corrente', obra: 'A pagar a fornecedores', re: /./ },
    ],
  },
];

/** Lados da árvore de cada tela: chave da seção do ativo e sinal do passivo para virar "obrigação positiva" */
const LADOS = {
  bp: { ativo: 'Ativo', sinalPassivo: 1 }, // BP guarda passivo positivo
  'capital-empregado': { ativo: 'Ativos', sinalPassivo: -1 }, // CE guarda passivo negativo
};

/** Contas de um resumo agrupadas por tema e subtema (valor como obrigação) */
function temasDe(summary, slug) {
  const lado = LADOS[slug];
  const out = Object.fromEntries(TEMAS.map((t) => [t.id, new Map()]));
  for (const [k, v] of Object.entries(summary?.breakdowns?.contas || {})) {
    if (zero(v)) continue;
    const [secao, , linha, ...rest] = k.split('|');
    const conta = rest.join('|');
    if (!conta) continue;
    const ehAtivo = secao === lado.ativo;
    const tema = TEMAS.find((t) => t.linha(norm(linha)));
    if (!tema) continue;
    const desc = norm(conta.split(' - ').slice(1).join(' - ') || conta);
    // Subtemas com "lado" só valem para contas daquele lado (ex.: "A recuperar" só no ativo); sem lado, valem nos dois
    const candidatos = tema.subtemas.filter((s) => !s.lado || s.lado === (ehAtivo ? 'ativo' : 'passivo'));
    const sub = candidatos.find((s) => s.re.test(desc)) || candidatos[candidatos.length - 1];
    const valor = ehAtivo ? -v : v * lado.sinalPassivo;
    const m = out[tema.id];
    const s = m.get(sub.nome) || m.set(sub.nome, new Map()).get(sub.nome);
    s.set(conta, (s.get(conta) || 0) + valor);
  }
  return out;
}

/** Junta competência atual e anterior: [{ id, rotulo, obra, total, totalAnt, subtemas: [{ nome, obra, v, va, contas: [[conta, v, va]] }] }] */
function compararTemas(atual, anterior) {
  return TEMAS.map((t) => {
    const a = atual[t.id];
    const b = anterior ? anterior[t.id] : new Map();
    const nomes = t.subtemas.map((s) => s.nome).filter((n) => a.has(n) || b.has(n));
    const subtemas = nomes.map((n) => {
      const ca = a.get(n) || new Map();
      const cb = b.get(n) || new Map();
      const contas = [...new Set([...ca.keys(), ...cb.keys()])]
        .map((c) => [c, round2(ca.get(c) || 0), anterior ? round2(cb.get(c) || 0) : null])
        .filter(([, x, y]) => !zero(x) || !zero(y))
        .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
      const v = round2(contas.reduce((s, x) => s + x[1], 0));
      const va = anterior ? round2(contas.reduce((s, x) => s + (x[2] || 0), 0)) : null;
      return { nome: n, obra: t.subtemas.find((s) => s.nome === n).obra, v, va, contas };
    }).filter((s) => s.contas.length);
    return {
      id: t.id, rotulo: t.rotulo, obra: t.obra,
      total: round2(subtemas.reduce((s, x) => s + x.v, 0)),
      totalAnt: anterior ? round2(subtemas.reduce((s, x) => s + (x.va || 0), 0)) : null,
      subtemas,
    };
  }).filter((t) => t.subtemas.length);
}

/* ------------------------------------------------------------ BP: liquidez */

const NAO_REALIZAVEL = /imobilizado|intangivel|investimentos|direitos de uso|propriedades para investimento|property/;
function liquidezDe(summary) {
  if (!summary) return null;
  const g = summary.breakdowns.grupo || {};
  const arv = summary.breakdowns.arvore || {};
  const linha = (re, secao = 'Ativo') => Object.entries(arv).filter(([k]) => k.startsWith(`${secao}|`) && re.test(norm(k.split('|')[2]))).reduce((s, [, v]) => s + v, 0);
  const ac = g['Ativo Circulante'] || 0;
  const anc = g['Ativo Não Circulante'] || 0;
  const pc = g['Passivo Circulante'] || 0;
  const pnc = g['Passivo Não Circulante'] || 0;
  const pl = (g['Patrimônio Líquido'] || 0);
  const caixa = linha(/^caixa/);
  const estoques = linha(/^estoques/);
  const naoRealizavel = Object.entries(arv).filter(([k]) => k.startsWith('Ativo|Ativo Não Circulante|') && NAO_REALIZAVEL.test(norm(k.split('|')[2]))).reduce((s, [, v]) => s + v, 0);
  const rlp = anc - naoRealizavel;
  const passivo = pc + pnc;
  const div = (a, b) => (Math.abs(b) >= 0.005 ? a / b : null);
  return {
    base: { ac, anc, pc, pnc, pl, caixa, estoques, rlp, passivo, ativo: ac + anc },
    indices: [
      { id: 'corrente', nome: 'Liquidez corrente', valor: div(ac, pc), formula: 'Ativo circulante ÷ passivo circulante', bom: 'maior' },
      { id: 'seca', nome: 'Liquidez seca', valor: div(ac - estoques, pc), formula: '(Ativo circulante − estoques) ÷ passivo circulante', bom: 'maior' },
      { id: 'imediata', nome: 'Liquidez imediata', valor: div(caixa, pc), formula: 'Caixa e equivalentes ÷ passivo circulante', bom: 'maior' },
      { id: 'geral', nome: 'Liquidez geral', valor: div(ac + rlp, passivo), formula: '(Ativo circulante + realizável a longo prazo) ÷ passivo exigível', bom: 'maior' },
      { id: 'endividamento', nome: 'Endividamento geral', valor: div(passivo, ac + anc), formula: 'Passivo exigível ÷ ativo total', bom: 'menor', pct: true },
      { id: 'composicao', nome: 'Composição do endividamento', valor: div(pc, passivo), formula: 'Passivo circulante ÷ passivo exigível (quanto vence no curto prazo)', bom: 'menor', pct: true },
    ],
  };
}

/* --------------------------------------------- CE: encerrar a obra hoje */

/**
 * Linhas do Capital Empregado viram "recursos" (o que a obra tem para receber/realizar) ou "obrigações" (o que deve).
 * Ativo com saldo negativo vira obrigação e passivo com saldo positivo vira recurso. Caixa vem do BP do mesmo filtro.
 * realizacao: % padrão de conversão em caixa (o usuário ajusta na tela). fixo = não vira caixa (não ajustável).
 */
const RECURSOS = [
  { id: 'caixa', nome: 'Caixa e aplicações', realizacao: 100 },
  { id: 'faturado', nome: 'Clientes faturados', realizacao: 100, linha: /faturados/ },
  { id: 'afaturar', nome: 'Clientes a faturar (medição)', realizacao: 0, linha: /a faturar/ },
  { id: 'estoque', nome: 'Estoque', realizacao: 50, grupo: /^estoque/ },
  { id: 'adiantamentos', nome: 'Adiantamentos a fornecedores e funcionários', realizacao: 100, grupo: /^adiantamentos/ },
  { id: 'impostos', nome: 'Impostos a recuperar', realizacao: 100, grupo: /^impostos a recuperar/ },
  { id: 'imobilizado', nome: 'Imobilizado e intangível da obra', realizacao: 0, grupo: /^imobilizado|^intangivel/ },
  { id: 'outros', nome: 'Outros ativos (consórcio, partes relacionadas…)', realizacao: 100, grupo: /^outros ativos/ },
  { id: 'antecipadas', nome: 'Seguros e instalações (despesas antecipadas)', realizacao: 0, fixo: true, grupo: /^saldo/ },
];
const OBRIGACOES = [
  { id: 'fornecedores', nome: 'Fornecedores e subempreiteiros', grupo: /^fornecedores/ },
  { id: 'pessoal', nome: 'Salários, férias, 13º e encargos', grupo: /^salarios/ },
  { id: 'impostos', nome: 'Impostos a recolher', grupo: /^impostos a recolher/ },
  { id: 'clientes', nome: 'Adiantamentos de clientes (serviço a executar)', grupo: /^sad/ },
  { id: 'outros', nome: 'Outros passivos (partes relacionadas…)', grupo: /./ },
];

function liquidacaoDe(ce, bp, dre) {
  if (!ce) return null;
  const rec = Object.fromEntries(RECURSOS.map((r) => [r.id, 0]));
  const obr = Object.fromEntries(OBRIGACOES.map((o) => [o.id, 0]));
  const negativos = []; // ativos negativos / passivos positivos (trocam de lado)
  for (const [k, v] of Object.entries(ce.breakdowns.arvore || {})) {
    if (zero(v)) continue;
    const [lado, grupo, linha] = k.split('|');
    const g = norm(grupo);
    const l = norm(linha);
    if (lado === 'Ativos') {
      if (v < 0) { obr.outros += -v; negativos.push({ linha, v }); continue; }
      const r = RECURSOS.find((x) => (x.linha && g === 'sar' && x.linha.test(l)) || (x.grupo && x.grupo.test(g)));
      rec[(r || RECURSOS.find((x) => x.id === 'outros')).id] += v;
    } else {
      if (v > 0) { rec.outros += v; negativos.push({ linha, v }); continue; }
      const o = OBRIGACOES.find((x) => x.grupo.test(g));
      obr[o.id] += -v;
    }
  }
  if (bp) {
    rec.caixa = Object.entries(bp.breakdowns.arvore || {}).filter(([k]) => k.startsWith('Ativo|') && /^caixa/.test(norm(k.split('|')[2]))).reduce((s, [, v]) => s + v, 0);
  }
  return {
    recursos: RECURSOS.map((r) => ({ id: r.id, nome: r.nome, valor: round2(rec[r.id]), realizacao: r.realizacao, fixo: !!r.fixo })).filter((r) => !zero(r.valor) || r.id === 'caixa'),
    obrigacoes: OBRIGACOES.map((o) => ({ id: o.id, nome: o.nome, valor: round2(obr[o.id]) })).filter((o) => !zero(o.valor)),
    folhaMensal: dre ? round2(Math.abs(dre.salarios || 0)) : null,
    trocas: negativos.map((x) => ({ linha: x.linha, valor: round2(x.v) })),
    semCaixa: !bp,
  };
}

/* ------------------------------------------------------------- montagem */

async function montar(slug, scope, { getSummary, periods }) {
  if (!LADOS[slug] || !scope.period) return null;
  const P = scope.period;
  const lista = (await periods()).filter((p) => p <= P).sort();
  const pAnt = lista[lista.indexOf(P) - 1] || null;
  const [atual, anterior] = await Promise.all([
    getSummary(slug, scope).catch(() => null),
    pAnt ? getSummary(slug, { ...scope, period: pAnt }).catch(() => null) : null,
  ]);
  if (!atual) return null;
  const [dreP, dreAnt] = await Promise.all([
    getSummary('dre', scope).catch(() => null),
    Number(P.slice(5, 7)) > 1 ? getSummary('dre', { ...scope, period: mesAnterior(P) }).catch(() => null) : null,
  ]);
  const dre = dreDoMes(dreP, dreAnt, P);
  const base = {
    slug, periodo: P, rotulo: rotuloMes(P), anterior: pAnt, rotuloAnterior: pAnt ? rotuloMes(pAnt) : null,
    temas: compararTemas(temasDe(atual, slug), anterior ? temasDe(anterior, slug) : null),
    dre: dre ? { salarios: round2(dre.salarios), custos: round2(dre.custos), base: dre.base } : null,
  };
  if (slug === 'bp') {
    const la = liquidezDe(atual);
    const lb = anterior ? liquidezDe(anterior) : null;
    base.liquidez = la ? la.indices.map((x) => ({ ...x, anterior: lb ? lb.indices.find((y) => y.id === x.id).valor : null })) : null;
    base.liquidezBase = la ? Object.fromEntries(Object.entries(la.base).map(([k, v]) => [k, round2(v)])) : null;
  } else {
    const bp = await getSummary('bp', scope).catch(() => null);
    base.liquidacao = liquidacaoDe(atual, bp, dre);
  }
  return base;
}

module.exports = { montar, TEMAS };
