/**
 * Indicadores da análise do Balanço Patrimonial (liquidez, rentabilidade e estrutura de capital),
 * calculados com o BP e a DRE do escopo (competência, moeda e filtros da tela).
 *
 * Base:
 *   AC, ANC, PC, PNC, PL, AT ......... grupos do BP (inclui "a classificar" do próprio lado)
 *   Estoques ......................... linha "Estoques" do Ativo Circulante
 *   ARLP (realizável a longo prazo) .. Ativo Não Circulante − Investimentos − Imobilizado − Intangível
 *   AI (imobilizado) ................. linhas "Imobilizado" e "Property, plant and equipments" do ANC
 *   Vendas líquidas / Lucro líquido .. DRE (acumulado do ano até a competência)
 */
const Report = require('../models/Report');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const div = (a, b) => (b ? a / b : null);

// Linhas do ANC que NÃO são realizável a longo prazo
const ANC_FIXO = [/^investimentos?$/, /propriedades? para investimento/, /^imobilizado$/, /property, plant/, /direitos? de uso/, /^intangivel$/];
const AI_LINHAS = [/^imobilizado$/, /property, plant/];

function base(bp, dre) {
  const gr = bp.breakdowns.grupo || {};
  const linhas = {}; // grupo → { classe: valor }
  for (const [k, v] of Object.entries(bp.breakdowns.arvore || {})) {
    const [, grupo, classe] = k.split('|');
    (linhas[grupo] ||= {})[classe] = ((linhas[grupo] ||= {})[classe] || 0) + v;
  }
  const soma = (grupo, regras) => Object.entries(linhas[grupo] || {}).filter(([c]) => regras.some((r) => r.test(norm(c)))).reduce((a, [, v]) => a + v, 0);
  const AC = (gr['Ativo Circulante'] || 0);
  const ANC = (gr['Ativo Não Circulante'] || 0);
  const PC = (gr['Passivo Circulante'] || 0);
  const PNC = (gr['Passivo Não Circulante'] || 0);
  const PL = (gr['Patrimônio Líquido'] || 0) + (gr['PL a classificar'] || 0);
  const AT = AC + ANC + (gr['Ativo a classificar'] || 0);
  const Estoques = soma('Ativo Circulante', [/^estoques?$/]);
  const ARLP = ANC - soma('Ativo Não Circulante', ANC_FIXO);
  const AI = soma('Ativo Não Circulante', AI_LINHAS);
  const dg = dre ? dre.breakdowns.grupo || {} : {};
  const Vendas = (dg['Receita Bruta'] || 0) + (dg['Deduções da Receita'] || 0);
  const LL = dre ? dre.totals?.valor?.sum ?? 0 : 0;
  return { AC, Estoques, ANC, ARLP, AI, AT, PC, PNC, PL, Vendas, LL };
}

/** Definição dos indicadores (fórmula, leitura e faixa de referência quando o modelo indica) */
const GRUPOS = [
  {
    titulo: 'Índices de liquidez',
    itens: [
      { id: 'LG', nome: 'Liquidez Geral', formula: '(AC + ARLP) ÷ (PC + PNC)', calc: (b) => div(b.AC + b.ARLP, b.PC + b.PNC), fmt: 'x', melhor: 'maior', bom: (v) => v >= 1,
        texto: 'Capacidade de pagar todas as dívidas (curto e longo prazo) com o que a empresa tem e vai receber. Acima de 1 é bom.' },
      { id: 'LC', nome: 'Liquidez Corrente', formula: 'AC ÷ PC', calc: (b) => div(b.AC, b.PC), fmt: 'x', melhor: 'maior', bom: (v) => v >= 1,
        texto: 'Capacidade de pagar as dívidas de curto prazo com o ativo circulante. Acima de 1 é bom.' },
      { id: 'LS', nome: 'Liquidez Seca', formula: '(AC − Estoques) ÷ PC', calc: (b) => div(b.AC - b.Estoques, b.PC), fmt: 'x', melhor: 'maior', bom: (v) => v >= 1,
        texto: 'Mesma leitura da liquidez corrente, mas sem contar com a venda dos estoques. Acima de 1 é bom.' },
    ],
  },
  {
    titulo: 'Índices de rentabilidade',
    itens: [
      { id: 'GA', nome: 'Giro do Ativo', formula: 'Vendas líquidas ÷ AT', calc: (b) => div(b.Vendas, b.AT), fmt: 'x', melhor: 'maior',
        texto: 'Quanto a empresa vendeu para cada unidade de ativo. Quanto maior, mais eficiente o uso dos recursos.' },
      { id: 'ML', nome: 'Margem Líquida', formula: 'Lucro líquido ÷ Vendas líquidas', calc: (b) => div(b.LL, b.Vendas), fmt: '%', melhor: 'maior', bom: (v) => v > 0,
        texto: 'Quanto sobra de lucro para cada 100 de vendas, depois de todos os custos, despesas e impostos.' },
      { id: 'RA', nome: 'Rentabilidade do Ativo', formula: 'Lucro líquido ÷ AT', calc: (b) => div(b.LL, b.AT), fmt: '%', melhor: 'maior', bom: (v) => v > 0,
        texto: 'Quanto o lucro remunerou o total de recursos aplicados (ativo).' },
      { id: 'RPL', nome: 'Rentabilidade do Patrimônio Líquido', formula: 'Lucro líquido ÷ PL', calc: (b) => div(b.LL, b.PL), fmt: '%', melhor: 'maior', bom: (v) => v > 0,
        texto: 'Quanto o lucro remunerou o capital próprio (patrimônio líquido).' },
    ],
  },
  {
    titulo: 'Índices de estrutura de capital',
    itens: [
      { id: 'PCTRT', nome: 'Participação de Capital de Terceiros', formula: '(PC + PNC) ÷ AT', calc: (b) => div(b.PC + b.PNC, b.AT), fmt: 'x', melhor: 'menor',
        texto: 'Quanto do ativo é financiado com recursos de terceiros. Quanto menor, melhor.' },
      { id: 'CE', nome: 'Composição do Endividamento', formula: 'PC ÷ (PC + PNC)', calc: (b) => div(b.PC, b.PC + b.PNC), fmt: 'x', melhor: 'menor',
        texto: 'Parte das dívidas que vence no curto prazo. Quanto menor, mais tempo para gerar caixa e pagar.' },
      { id: 'GE', nome: 'Grau de Endividamento', formula: '(PC + PNC) ÷ PL', calc: (b) => div(b.PC + b.PNC, b.PL), fmt: 'x', melhor: 'menor', bom: (v) => v >= 0 && v < 1,
        texto: 'Dependência de capital de terceiros em relação ao capital próprio. O ideal é ficar abaixo de 1.' },
      { id: 'IPL', nome: 'Imobilização do Patrimônio Líquido', formula: 'AI ÷ PL', calc: (b) => div(b.AI, b.PL), fmt: 'x', melhor: 'menor',
        texto: 'Parte do capital próprio aplicada no imobilizado. Quanto menor, mais capital próprio sobra para o giro.' },
      { id: 'IRNC', nome: 'Imobilização de Recursos Não Correntes', formula: 'AI ÷ (PL + PNC)', calc: (b) => div(b.AI, b.PL + b.PNC), fmt: 'x', melhor: 'menor',
        texto: 'Parte dos recursos de longo prazo (próprios e de terceiros) aplicada no imobilizado. Quanto menor, melhor.' },
    ],
  },
];

async function calcular(scope) {
  const [bp, dre] = await Promise.all([Report.getSummary('bp', scope), Report.getSummary('dre', scope)]);
  if (!bp) return null;
  const b = base(bp, dre);
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo,
    itens: g.itens.map((i) => {
      const valor = i.calc(b);
      const situacao = valor == null ? 'sem' : i.bom ? (i.bom(valor) ? 'bom' : 'atencao') : 'neutro';
      return { id: i.id, nome: i.nome, formula: i.formula, valor, fmt: i.fmt, melhor: i.melhor, texto: i.texto, situacao };
    }),
  }));
  return { base: b, grupos };
}

module.exports = { calcular };
