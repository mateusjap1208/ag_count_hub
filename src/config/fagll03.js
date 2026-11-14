/**
 * Telas de Clientes e Fornecedores a partir do FAGLL03 (partidas do razão em aberto na competência).
 * Os dois relatórios têm o mesmo layout; muda o parceiro (cliente × fornecedor), o sinal do saldo
 * e a forma de agrupar a composição do saldo.
 */
const g = (s, key) => (s.breakdowns && s.breakdowns[key]) || {};
const ratio = (a, b) => (b ? a / b : null);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sumKeys = (map, pred) => Object.entries(map).reduce((a, [k, v]) => (pred(norm(k)) ? a + v : a), 0);

const FIELDS = {
  empresa: { names: ['empresa'], label: 'Empresa' },
  parceiroNegocio: { names: ['soc_parc_negocios'] },
  centroLucro: { names: ['centro_de_lucro'], upper: true },
  conta: { names: ['conta'], label: 'Conta' },
  valor: { names: ['montante_mi', 'montante_em_moeda_interna'], type: 'number', label: 'Montante MI' },
  moeda: { names: ['moeda_interna'] },
  tipoDoc: { names: ['tipo_de_documento'] },
  docCompensacao: { names: ['doc_compensacao'] },
  documento: { names: ['n_documento'] },
  dataDocumento: { names: ['data_do_documento'], type: 'date' },
  dataLancamento: { names: ['data_de_lancamento'], type: 'date' },
  vencimento: { names: ['vencimento_liquido'], type: 'date' },
  texto: { names: ['texto'] },
  cliente: { names: ['cliente'] },
  fornecedor: { names: ['fornecedor'] },
  documentoCompras: { names: ['documento_de_compras'] },
  atribuicao: { names: ['atribuicao'] },
};

/** Último dia da competência (ms UTC) */
const fimCompetencia = (period) => { const [y, m] = period.split('-').map(Number); return Date.UTC(y, m, 0); };

/** Composição do saldo em dois níveis (seção → linhas), com subtotal por seção e total geral */
function composicao(s, totalLabel) {
  const porGrupo = new Map();
  for (const [k, v] of Object.entries(g(s, 'nivel'))) {
    const [grupo, item] = k.split('||');
    (porGrupo.get(grupo) || porGrupo.set(grupo, []).get(grupo)).push([item, v]);
  }
  const ordem = [...porGrupo.keys()].sort((a, b) => (a === 'A classificar') - (b === 'A classificar') || a.localeCompare(b));
  const lines = [];
  let total = 0;
  for (const grupo of ordem) {
    lines.push({ label: grupo, kind: 'section' });
    let sub = 0;
    for (const [item, v] of porGrupo.get(grupo).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (Math.abs(v) < 0.005) continue;
      lines.push({ label: item, value: v });
      sub += v;
    }
    lines.push({ label: `Total · ${grupo}`, value: sub, subtotal: true });
    total += sub;
  }
  lines.push({ label: totalLabel, value: total, subtotal: true, highlight: true });
  return lines;
}

/**
 * tipo 'clientes':     parceiro = cliente (KNA1); saldo aberto = clientes faturados (N4);
 *                      composição por grupo (N3) e classificação (N4) do Plano de Contas.
 * tipo 'fornecedores': parceiro = fornecedor (LFA1); saldo a pagar = −montante das contas de fornecedores (N4);
 *                      composição por classificação (N4) e conta.
 */
function fagll03(tipo) {
  const cli = tipo === 'clientes';
  const parceiro = cli ? 'cliente' : 'fornecedor';
  return {
    slug: tipo,
    menu: cli ? 'Clientes' : 'Fornecedores',
    title: cli ? 'Clientes' : 'Fornecedores',
    icon: cli ? 'users' : 'truck',
    source: 'generic',
    currencyMode: 'row',
    hasCentro: true,
    importer: {
      label: `FAGLL03 — ${cli ? 'Clientes' : 'Fornecedores'} (partidas do razão)`,
      company: 'empresa',
      currency: 'moeda',
      required: ['empresa', 'conta'],
      fields: FIELDS,
      derive: (r, ctx) => {
        const { n3, n4 } = ctx.contaNivel(r.conta);
        const classe = n4 || 'A classificar';
        const descricao = ctx.contaDescricao(r.conta) || `Conta ${r.conta}`;
        const aberto = cli ? (classe === 'Clientes faturados' ? r.valor : 0) : (classe === 'Fornecedores' ? -r.valor : 0);
        const atraso = aberto && r.vencimento && ctx.period
          ? Math.round((fimCompetencia(ctx.period) - Date.parse(`${r.vencimento}T00:00:00Z`)) / 864e5) : 0;
        const codigo = r[parceiro];
        const nome = codigo ? (cli ? ctx.clienteNome(codigo) : ctx.fornecedorNome(codigo)) : '';
        return {
          classe,
          contaDescricao: descricao,
          parceiroNome: codigo ? (nome ? `${codigo} - ${nome}` : codigo) : 'Sem parceiro (lançamento contábil)',
          aberto,
          vencAging: aberto ? r.vencimento : null,
          diasAtraso: atraso > 0 ? atraso : 0,
          nivel: cli ? `${n3 || 'A classificar'}||${classe}` : `${classe}||${r.conta} - ${descricao}`,
        };
      },
    },
    sumFields: ['aberto'],
    columns: [
      { key: 'parceiroNome', label: cli ? 'Cliente' : 'Fornecedor', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'classe', label: 'Classificação', type: 'string' },
      { key: 'conta', label: 'Conta', type: 'string' },
      { key: 'contaDescricao', label: 'Descrição da conta', type: 'string' },
      { key: 'tipoDoc', label: 'Tipo doc.', type: 'string' },
      { key: 'documento', label: 'Documento', type: 'string' },
      { key: 'dataLancamento', label: 'Lançamento', type: 'date' },
      { key: 'vencimento', label: 'Vencimento', type: 'date' },
      { key: 'diasAtraso', label: 'Dias em atraso', type: 'number', format: 'number' },
      { key: 'valor', label: 'Montante', type: 'number', format: 'currency' },
      { key: 'texto', label: 'Texto', type: 'string' },
    ],
    breakdowns: [
      { id: 'aging', label: `${cli ? 'Clientes faturados' : 'Fornecedores'} por vencimento (aging)`, aging: { dateField: 'vencAging', scheme: 'overdue' }, value: 'aberto', chart: 'bar' },
      { id: 'top', label: cli ? 'Maiores saldos a receber por cliente' : 'Maiores saldos a pagar por fornecedor', field: 'parceiroNome', value: 'aberto', chart: 'hbar', top: 10 },
      { id: 'centro', label: `${cli ? 'A receber' : 'A pagar'} por centro de lucro`, field: 'centroLucro', value: 'aberto', chart: 'hbar', top: 10 },
      { id: 'nivel', field: 'nivel', value: 'valor', chart: null },
      { id: 'classe', field: 'classe', value: 'valor', chart: null },
      { id: 'parceiros', field: parceiro, value: '_count', chart: null },
    ],
    statementFn: (s) => composicao(s, cli ? 'Saldo líquido das contas de clientes' : 'Saldo das contas de fornecedores'),
    kpis: (s) => {
      const ag = g(s, 'aging');
      const aberto = s.totals?.aberto?.sum ?? 0;
      const comVenc = Object.values(ag).reduce((a, v) => a + v, 0);
      const vencido = comVenc - (ag['A vencer'] || 0);
      const parceiros = Object.keys(g(s, 'parceiros')).filter((k) => k !== 'Não informado').length;
      if (cli) {
        const cl = g(s, 'classe');
        return [
          { label: 'Clientes faturados', value: aberto, format: 'currency', hint: 'Contas a receber' },
          { label: 'Vencido', value: vencido, format: 'currency', tone: vencido > 0 ? 'neg' : undefined },
          { label: '% vencido', value: ratio(vencido, aberto), format: 'percent' },
          { label: 'Ativo de contrato (CPC 47)', value: sumKeys(cl, (k) => k.includes('ativos de contratos')), format: 'currency', hint: 'Serviços a faturar' },
          { label: 'PPI de clientes', value: sumKeys(cl, (k) => k.includes('ppi')), format: 'currency' },
          { label: 'Adiantamentos de clientes', value: Math.abs(sumKeys(cl, (k) => k.includes('adiantamento'))), format: 'currency' },
          { label: 'Passivo de contrato (CPC 47)', value: Math.abs(sumKeys(cl, (k) => k.includes('ainda nao prestados'))), format: 'currency', hint: 'Faturado antecipado' },
          { label: 'Clientes', value: parceiros, format: 'number' },
        ];
      }
      return [
        { label: 'Total a pagar', value: aberto, format: 'currency' },
        { label: 'Vencido', value: vencido, format: 'currency', tone: vencido > 0 ? 'neg' : undefined },
        { label: '% vencido', value: ratio(vencido, comVenc), format: 'percent', hint: 'Sobre o saldo com vencimento' },
        { label: 'Sem vencimento', value: aberto - comVenc, format: 'currency', hint: 'Provisões, recepção e acréscimos' },
        { label: 'Fornecedores', value: parceiros, format: 'number' },
      ];
    },
  };
}

module.exports = { fagll03 };
