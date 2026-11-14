/**
 * Definição dos módulos (itens do menu) e do layout esperado de cada arquivo .txt.
 *
 * ATENÇÃO: os layouts abaixo são uma proposta inicial [A CONFIRMAR] com os
 * relatórios reais exportados do SAP. Para adaptar, basta ajustar `columns`
 * (nome, aliases e tipo) — o parser reconhece o cabeçalho pelos aliases.
 *
 * Tipos de coluna: string | number | date
 * breakdowns: agregações pré-calculadas no momento do upload (desempenho).
 *   - field: campo de agrupamento | value: campo numérico somado ('_count' = contagem)
 *   - aging: { dateField, scheme: 'overdue' | 'expiry' | 'age' } → faixas calculadas
 *     em relação ao último dia do período de referência.
 */

/**
 * Status de giro do estoque pelos dias sem movimento até o fim da competência. [A CONFIRMAR] faixas.
 */
const GIRO_FAIXAS = [
  { ate: 90, status: 'Saudável' },
  { ate: 180, status: 'Atenção' },
  { ate: 365, status: 'Baixo Giro' },
  { ate: Infinity, status: 'Obsoleto' },
];
const statusGiro = (dias) => (dias == null ? 'Sem dados' : GIRO_FAIXAS.find((f) => dias <= f.ate).status);

const AGING_SCHEMES = {
  // Contas a receber / a pagar: dias em atraso
  overdue: ['A vencer', 'Vencido 1-30', 'Vencido 31-60', 'Vencido 61-90', 'Vencido 91-180', 'Vencido > 180'],
  // Seguros e garantias: dias até o vencimento
  expiry: ['Vencida', 'Até 30 dias', '31-90 dias', '91-180 dias', '> 180 dias'],
  // Adiantamentos: antiguidade do lançamento
  age: ['0-30 dias', '31-90 dias', '91-180 dias', '181-365 dias', '> 365 dias'],
};

const sumKeys = (map = {}, predicate) =>
  Object.entries(map).reduce((acc, [k, v]) => (predicate(norm(k)) ? acc + v : acc), 0);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ratio = (a, b) => (b ? a / b : null);
const g = (s, key) => (s.breakdowns && s.breakdowns[key]) || {};

const modules = [
  /* ------------------------------------------------------------------
   * BP, DRE e Capital Empregado: gerados a partir do FGI0 (saldos contábeis),
   * classificados pelos Parâmetros (ver services/fgi0.js). source: 'fgi0'
   * ------------------------------------------------------------------ */
  {
    slug: 'bp',
    menu: 'BP',
    title: 'Balanço Patrimonial',
    icon: 'scale',
    source: 'fgi0',
    columns: [
      { key: 'conta', label: 'Conta', type: 'string' },
      { key: 'descricao', label: 'Descrição', type: 'string' },
      { key: 'grupo', label: 'Grupo', type: 'string' },
      { key: 'classe', label: 'Classe', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'saldo', label: 'Saldo', type: 'number', format: 'currency' },
    ],
    groupOrder: ['Ativo Circulante', 'Ativo Não Circulante', 'Ativo a classificar', 'Passivo Circulante', 'Passivo Não Circulante',
      'Passivo a classificar', 'Patrimônio Líquido', 'PL a classificar', 'Não classificado'],
    breakdowns: [
      { id: 'grupo', label: 'Saldo por grupo', field: 'grupo', value: 'saldo', chart: 'bar' },
      { id: 'arvore', field: 'arvore', value: 'saldo', chart: null },
      { id: 'centros', field: 'centroLucro', value: 'saldo', chart: null }, // relação empresa × centro de lucro (filtros)
    ],
    tree: {
      breakdown: 'arvore',
      itemSort: 'abs',
      sections: [
        { key: 'Ativo', label: 'Ativo', total: 'Total do ativo' },
        { key: 'Passivo e PL', label: 'Passivo e patrimônio líquido', total: 'Total do passivo e patrimônio líquido' },
        { key: 'Não classificado', label: 'Contas não classificadas (sem correspondência nos Parâmetros)', total: 'Total não classificado' },
      ],
    },
    kpis: (s) => {
      const gr = g(s, 'grupo');
      const ac = gr['Ativo Circulante'] || 0;
      const ativo = ac + (gr['Ativo Não Circulante'] || 0) + (gr['Ativo a classificar'] || 0);
      const pc = gr['Passivo Circulante'] || 0;
      const passivo = pc + (gr['Passivo Não Circulante'] || 0) + (gr['Passivo a classificar'] || 0);
      const pl = (gr['Patrimônio Líquido'] || 0) + (gr['PL a classificar'] || 0);
      const nc = gr['Não classificado'] || 0;
      const aClassificar = (gr['Ativo a classificar'] || 0) + (gr['Passivo a classificar'] || 0) + (gr['PL a classificar'] || 0);
      const out = [
        { label: 'Ativo total', value: ativo, format: 'currency' },
        { label: 'Passivo total', value: passivo, format: 'currency' },
        { label: 'Patrimônio líquido', value: pl, format: 'currency', hint: 'Inclui o resultado do exercício (DRE)' },
        { label: 'Liquidez corrente', value: ratio(ac, pc), format: 'ratio', hint: 'Ativo circulante ÷ passivo circulante' },
      ];
      if (Math.abs(aClassificar) >= 0.01) out.push({ label: 'Contas a classificar', value: aClassificar, format: 'currency', tone: 'warn', hint: 'Sem cadastro nos Parâmetros (incluídas nos totais)' });
      if (Math.abs(nc) >= 0.01) out.push({ label: 'Não classificado', value: nc, format: 'currency', tone: 'warn', hint: 'Contas sem classificação nos Parâmetros' });
      // Ativo (+ não classificado) deveria igualar Passivo + PL; a diferença vem de contas desconsideradas (ex.: 6 e 9)
      const dif = ativo + nc - passivo - pl;
      if (Math.abs(dif) >= 0.01) out.push({ label: 'Diferença de fechamento', value: dif, format: 'currency', tone: 'warn', hint: 'Contas 6 e 9 desconsideradas; com filtro de obra, também saldos lançados em outros centros de lucro' });
      return out;
    },
  },
  {
    slug: 'dre',
    menu: 'DRE',
    title: 'Demonstração do Resultado',
    icon: 'chart',
    source: 'fgi0',
    columns: [
      { key: 'conta', label: 'Conta', type: 'string' },
      { key: 'descricao', label: 'Descrição', type: 'string' },
      { key: 'grupo', label: 'Grupo', type: 'string' },
      { key: 'subgrupo', label: 'Subgrupo', type: 'string' },
      { key: 'areaFuncional', label: 'Área funcional', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency' },
    ],
    groupOrder: ['Receita Bruta', 'Deduções da Receita', 'Custos', 'Despesas Gerais e Administrativas', 'Resultado de Equivalência Patrimonial',
      'Provisões para Perdas e Riscos', 'Outras Receitas (Despesas) Operacionais', 'Resultado Financeiro', 'IR e CSLL', 'A classificar'],
    breakdowns: [
      { id: 'grupo', label: 'Resultado por grupo', field: 'grupo', value: 'valor', chart: 'bar' },
      { id: 'subgrupo', label: 'Principais subgrupos (N3)', field: 'subgrupo', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'centro', label: 'Resultado por centro de lucro (maiores)', field: 'centroLucro', value: 'valor', chart: 'hbar', top: 10 },
    ],
    statement: [
      { label: 'Receita bruta', groups: ['Receita Bruta'] },
      { label: '(-) Deduções da receita', groups: ['Deduções da Receita'] },
      { label: 'Receita líquida', subtotal: true },
      { label: '(-) Custos dos serviços prestados e das vendas', groups: ['Custos'] },
      { label: 'Lucro bruto', subtotal: true },
      { label: '(-) Despesas gerais e administrativas', groups: ['Despesas Gerais e Administrativas'] },
      { label: '(+/-) Resultado de equivalência patrimonial', groups: ['Resultado de Equivalência Patrimonial'] },
      { label: '(+/-) Provisões para perdas e riscos', groups: ['Provisões para Perdas e Riscos'] },
      { label: '(+/-) Outras receitas (despesas) operacionais', groups: ['Outras Receitas (Despesas) Operacionais'] },
      { label: 'Resultado operacional', subtotal: true },
      { label: '(+/-) Resultado financeiro', groups: ['Resultado Financeiro'] },
      { label: 'Resultado antes do IR e CSLL', subtotal: true },
      { label: '(-) IR e CSLL', groups: ['IR e CSLL'] },
      { label: '(+/-) Contas a classificar', groups: ['A classificar'], optional: true },
      { label: 'Lucro líquido', subtotal: true, highlight: true },
    ],
    kpis: (s) => {
      const gr = g(s, 'grupo');
      const rl = (gr['Receita Bruta'] || 0) + (gr['Deduções da Receita'] || 0);
      const lb = rl + (gr.Custos || 0);
      const ll = s.totals?.valor?.sum ?? 0;
      return [
        { label: 'Receita líquida', value: rl, format: 'currency' },
        { label: 'Lucro bruto', value: lb, format: 'currency', hint: `Margem bruta ${rl ? ((lb / rl) * 100).toFixed(1).replace('.', ',') + '%' : '—'}` },
        { label: 'Lucro líquido', value: ll, format: 'currency', tone: ll >= 0 ? 'pos' : 'neg' },
        { label: 'Margem líquida', value: ratio(ll, rl), format: 'percent' },
      ];
    },
  },
  {
    slug: 'capital-empregado',
    menu: 'Capital Empregado',
    title: 'Capital Empregado',
    icon: 'layers',
    source: 'fgi0',
    columns: [
      { key: 'conta', label: 'Conta', type: 'string' },
      { key: 'descricao', label: 'Descrição', type: 'string' },
      { key: 'lado', label: 'Ativos/Passivos', type: 'string' },
      { key: 'grupo', label: 'Grupo', type: 'string' },
      { key: 'linha', label: 'Linha', type: 'string' },
      { key: 'codGerencial', label: 'Cód. gerencial', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency' },
    ],
    breakdowns: [
      { id: 'lado', field: 'lado', value: 'valor', chart: null },
      { id: 'grupo', label: 'Capital empregado por grupo', field: 'grupo', value: 'valor', chart: 'bar', keepOrder: true },
      { id: 'linha', label: 'Principais linhas', field: 'linha', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'arvore', field: 'arvore', value: 'valor', chart: null },
      { id: 'centros', field: 'centroLucro', value: 'valor', chart: null },
    ],
    tree: {
      breakdown: 'arvore',
      itemSort: 'insertion',
      sections: [
        { key: 'Ativos', label: 'Ativos', total: 'Total ativos' },
        { key: 'Passivos', label: 'Passivos', total: 'Total passivos' },
      ],
      grandTotal: 'Capital empregado',
    },
    kpis: (s) => {
      const l = g(s, 'lado');
      const total = s.totals?.valor?.sum ?? 0;
      return [
        { label: 'Capital empregado', value: total, format: 'currency', hint: 'Ativos + passivos operacionais' },
        { label: 'Total ativos', value: l.Ativos || 0, format: 'currency' },
        { label: 'Total passivos', value: l.Passivos || 0, format: 'currency' },
        { label: 'Linhas', value: Object.keys(g(s, 'linha')).length, format: 'number' },
      ];
    },
  },
  /* ------------------------------------------------------------------
   * Arrendamento (IFRS 16): fotografia mensal do cronograma de contratos (RE-FX).
   * Importado pela página Arrendamento › Importar. source: 'arrendamento'
   * ------------------------------------------------------------------ */
  {
    slug: 'arrendamento',
    menu: 'Arrendamento',
    title: 'Arrendamento (IFRS 16)',
    icon: 'key',
    source: 'arrendamento',
    sumFields: ['ativoInicial', 'adicoes', 'passivoInicial', 'modificacao', 'despesa', 'despesaAno'],
    columns: [
      { key: 'contrato', label: 'Contrato', type: 'string' },
      { key: 'denominacao', label: 'Denominação', type: 'string' },
      { key: 'tipo', label: 'Tipo', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'inicio', label: 'Início', type: 'date' },
      { key: 'fim', label: 'Fim', type: 'date' },
      { key: 'taxa', label: 'Taxa (% a.a.)', type: 'number', format: 'number' },
      { key: 'ativoFinal', label: 'Direito de uso', type: 'number', format: 'currency' },
      { key: 'passivoFinal', label: 'Passivo', type: 'number', format: 'currency' },
      { key: 'passivoCP', label: 'Passivo circulante', type: 'number', format: 'currency' },
      { key: 'passivoLP', label: 'Passivo não circulante', type: 'number', format: 'currency' },
      { key: 'depreciacao', label: 'Depreciação no mês', type: 'number', format: 'currency' },
      { key: 'juros', label: 'Juros no mês', type: 'number', format: 'currency' },
      { key: 'parcela', label: 'Parcela no mês', type: 'number', format: 'currency' },
      { key: 'depAno', label: 'Depreciação no ano', type: 'number', format: 'currency' },
      { key: 'jurosAno', label: 'Juros no ano', type: 'number', format: 'currency' },
      { key: 'parcelasAno', label: 'Parcelas no ano', type: 'number', format: 'currency' },
    ],
    breakdowns: [
      { id: 'tipo', label: 'Passivo por tipo de contrato', field: 'tipo', value: 'passivoFinal', chart: 'bar' },
      { id: 'tipoDU', label: 'Direito de uso por tipo de contrato', field: 'tipo', value: 'ativoFinal', chart: 'doughnut' },
      { id: 'vencimento', label: 'Passivo por ano de término do contrato', field: 'anoFim', value: 'passivoFinal', chart: 'bar', sortKeys: true },
      { id: 'centroTop', label: 'Maiores passivos por centro de lucro', field: 'centroLucro', value: 'passivoFinal', chart: 'hbar', top: 10 },
      { id: 'centros', field: 'centroLucro', value: 'passivoFinal', chart: null },
      { id: 'contratos', field: 'contrato', value: '_count', chart: null },
    ],
    // Movimentação do mês (roll-forward) do direito de uso e do passivo
    statementFn: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      // No SAP a "Carteira inicial" do direito de uso já inclui as adições do mês
      const duAnterior = t('ativoInicial') - t('adicoes');
      const duCalc = t('ativoInicial') - t('depreciacao');
      const pCalc = t('passivoInicial') + t('juros') - t('parcela') + t('modificacao');
      const lines = [
        { label: 'Direito de uso', kind: 'section' },
        { label: 'Saldo do mês anterior', value: duAnterior },
        { label: '(+) Adições de contratos', value: t('adicoes') },
        { label: '(-) Depreciação', value: -t('depreciacao') },
      ];
      if (Math.abs(t('ativoFinal') - duCalc) >= 0.5) lines.push({ label: '(+/-) Outros ajustes', value: t('ativoFinal') - duCalc });
      lines.push({ label: 'Saldo final do direito de uso', value: t('ativoFinal'), subtotal: true });
      lines.push({ label: 'Passivo de arrendamento', kind: 'section' });
      lines.push({ label: 'Saldo inicial do mês', value: t('passivoInicial') });
      lines.push({ label: '(+) Juros apropriados', value: t('juros') });
      lines.push({ label: '(-) Pagamentos (parcelas)', value: -t('parcela') });
      if (Math.abs(t('modificacao')) >= 0.5) lines.push({ label: '(+/-) Modificação retroativa', value: t('modificacao') });
      if (Math.abs(t('passivoFinal') - pCalc) >= 0.5) lines.push({ label: '(+/-) Novos contratos e outros ajustes', value: t('passivoFinal') - pCalc });
      lines.push({ label: 'Saldo final do passivo', value: t('passivoFinal'), subtotal: true });
      lines.push({ label: '   Circulante (próximos 12 meses)', value: t('passivoCP') });
      lines.push({ label: '   Não circulante', value: t('passivoLP') });
      lines.push({ label: 'Despesa de arrendamento no ano (depreciação + juros)', value: t('depAno') + t('jurosAno'), subtotal: true, highlight: true });
      return lines;
    },
    kpis: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      return [
        { label: 'Direito de uso', value: t('ativoFinal'), format: 'currency' },
        { label: 'Passivo de arrendamento', value: t('passivoFinal'), format: 'currency' },
        { label: 'Passivo circulante', value: t('passivoCP'), format: 'currency', hint: 'Amortização dos próximos 12 meses' },
        { label: 'Passivo não circulante', value: t('passivoLP'), format: 'currency' },
        { label: 'Depreciação no ano', value: t('depAno'), format: 'currency' },
        { label: 'Juros no ano', value: t('jurosAno'), format: 'currency' },
        { label: 'Contratos ativos', value: Object.keys(g(s, 'contratos')).length, format: 'number' },
      ];
    },
  },
  {
    slug: 'clientes',
    menu: 'Clientes',
    title: 'Clientes (contas a receber)',
    icon: 'users',
    // Nome opcional no .txt: se vier vazio, é preenchido pelo Mestre de Clientes (KNA1)
    nameLookup: { param: 'clientes', codeField: 'codigo', nameField: 'nome' },
    columns: [
      { key: 'codigo', label: 'Código', type: 'string', required: true, aliases: ['cliente', 'cod_cliente', 'cliente_cod', 'cod', 'kunnr'] },
      { key: 'nome', label: 'Cliente', type: 'string', aliases: ['nome_1', 'nome', 'razao_social', 'nome_cliente'] },
      { key: 'obra', label: 'Obra', type: 'string', aliases: ['contrato', 'centro_custo', 'projeto'] },
      { key: 'documento', label: 'Documento', type: 'string', aliases: ['doc', 'n_documento', 'nf'] },
      { key: 'vencimento', label: 'Vencimento', type: 'date', required: true, aliases: ['data_vencimento', 'dt_venc', 'venc'] },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency', required: true, aliases: ['saldo', 'montante', 'valor_aberto'] },
    ],
    breakdowns: [
      { id: 'aging', label: 'Aging (vencimento)', aging: { dateField: 'vencimento', scheme: 'overdue' }, value: 'valor', chart: 'bar' },
      { id: 'top', label: 'Maiores clientes', field: 'nome', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'obra', label: 'Saldo por obra', field: 'obra', value: 'valor', chart: 'doughnut', top: 8 },
    ],
    kpis: (s) => {
      const ag = g(s, 'aging');
      const total = s.totals?.valor?.sum ?? 0;
      const vencido = total - (ag['A vencer'] || 0);
      return [
        { label: 'Total a receber', value: total, format: 'currency' },
        { label: 'Vencido', value: vencido, format: 'currency', tone: vencido > 0 ? 'neg' : undefined },
        { label: '% vencido', value: ratio(vencido, total), format: 'percent' },
        { label: 'Clientes', value: Object.keys(g(s, 'top')).length, format: 'number' },
      ];
    },
  },
  {
    slug: 'adiantamentos',
    menu: 'Adiantamentos',
    title: 'Adiantamentos',
    icon: 'arrow',
    columns: [
      { key: 'codigo', label: 'Código', type: 'string', required: true, aliases: ['cod', 'cod_parceiro'] },
      { key: 'nome', label: 'Favorecido', type: 'string', required: true, aliases: ['favorecido', 'parceiro', 'razao_social'] },
      { key: 'tipo', label: 'Tipo', type: 'string', required: true, aliases: ['categoria', 'natureza'] },
      { key: 'obra', label: 'Obra', type: 'string', aliases: ['contrato', 'centro_custo', 'projeto'] },
      { key: 'data', label: 'Data', type: 'date', required: true, aliases: ['data_lancamento', 'dt_lanc', 'data_documento'] },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency', required: true, aliases: ['saldo', 'montante'] },
    ],
    breakdowns: [
      { id: 'tipo', label: 'Saldo por tipo', field: 'tipo', value: 'valor', chart: 'doughnut' },
      { id: 'aging', label: 'Antiguidade', aging: { dateField: 'data', scheme: 'age' }, value: 'valor', chart: 'bar' },
      { id: 'top', label: 'Maiores saldos', field: 'nome', value: 'valor', chart: 'hbar', top: 10 },
    ],
    kpis: (s) => {
      const ag = g(s, 'aging');
      const total = s.totals?.valor?.sum ?? 0;
      const antigo = (ag['181-365 dias'] || 0) + (ag['> 365 dias'] || 0);
      return [
        { label: 'Total adiantado', value: total, format: 'currency' },
        { label: 'Acima de 180 dias', value: antigo, format: 'currency', tone: antigo > 0 ? 'neg' : undefined },
        { label: 'Lançamentos', value: s.count, format: 'number' },
        { label: 'Tipos', value: Object.keys(g(s, 'tipo')).length, format: 'number' },
      ];
    },
  },
  /* ------------------------------------------------------------------
   * Estoque: ZL0190 (SAP), posição por centro × depósito × material.
   * Moedas como no FGI0 (grupo = M2/USD; empresa = MI). Análise de giro pelo último movimento.
   * ------------------------------------------------------------------ */
  {
    slug: 'estoque',
    menu: 'Estoque',
    title: 'Estoque',
    icon: 'box',
    source: 'estoque',
    currencyMode: 'grupo-empresa',
    // Filtro próprio da tela (recalcula indicadores e tabela só com os itens do status escolhido)
    rowFilters: [{ param: 'giro', field: 'statusGiro', label: 'Status Giro', options: ['Saudável', 'Atenção', 'Baixo Giro', 'Obsoleto', 'Sem dados'] }],
    sumFields: ['entradas', 'saidas'],
    columns: [
      { key: 'material', label: 'Material', type: 'string' },
      { key: 'descricao', label: 'Descrição', type: 'string' },
      { key: 'statusGiro', label: 'Status Giro', type: 'badge' },
      { key: 'diasSemMov', label: 'Dias sem mov.', type: 'number', format: 'number' },
      { key: 'ultimoMovimento', label: 'Último movimento', type: 'date' },
      { key: 'classe', label: 'Classe de avaliação', type: 'string' },
      { key: 'tipoMaterial', label: 'Tipo', type: 'string' },
      { key: 'centro', label: 'Centro', type: 'string' },
      { key: 'deposito', label: 'Depósito', type: 'string' },
      { key: 'unidade', label: 'Un.', type: 'string' },
      { key: 'quantidade', label: 'Quantidade', type: 'number', format: 'number' },
      { key: 'pmm', label: 'Preço médio', type: 'number', format: 'currency' },
      { key: 'valor', label: 'Valor total', type: 'number', format: 'currency' },
    ],
    breakdowns: [
      { id: 'giro', label: 'Valor por status de giro', field: 'statusGiro', value: 'valor', chart: 'bar', order: ['Saudável', 'Atenção', 'Baixo Giro', 'Obsoleto', 'Sem dados'] },
      { id: 'classe', label: 'Maiores classes de avaliação', field: 'classe', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'tipo', label: 'Valor por tipo de material', field: 'tipoMaterial', value: 'valor', chart: 'doughnut', top: 8 },
      { id: 'centro', label: 'Maiores centros (plantas)', field: 'centro', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'materiais', field: 'material', value: '_count', chart: null },
    ],
    kpis: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      const gg = g(s, 'giro');
      const total = t('valor');
      const semGiro = (gg['Baixo Giro'] || 0) + (gg.Obsoleto || 0);
      return [
        { label: 'Valor em estoque', value: total, format: 'currency' },
        { label: 'Itens obsoletos', value: gg.Obsoleto || 0, format: 'currency', tone: gg.Obsoleto ? 'neg' : undefined, hint: 'Sem movimento há mais de 365 dias' },
        { label: 'Sem giro > 180 dias', value: semGiro, format: 'currency', tone: semGiro ? 'warn' : undefined, hint: `${total ? ((semGiro / total) * 100).toFixed(1).replace('.', ',') : '0,0'}% do estoque` },
        { label: 'Entradas no período', value: t('entradas'), format: 'currency' },
        { label: 'Saídas no período', value: t('saidas'), format: 'currency' },
        { label: 'Materiais', value: Object.keys(g(s, 'materiais')).length, format: 'number' },
      ];
    },
  },
  {
    slug: 'seguros-garantias',
    menu: 'Seguros e Garantias',
    title: 'Seguros e Garantias',
    icon: 'shield',
    columns: [
      { key: 'apolice', label: 'Apólice', type: 'string', required: true, aliases: ['n_apolice', 'contrato'] },
      { key: 'seguradora', label: 'Seguradora', type: 'string', required: true, aliases: ['emissor', 'banco'] },
      { key: 'tipo', label: 'Tipo', type: 'string', required: true, aliases: ['modalidade', 'ramo'] },
      { key: 'obra', label: 'Obra', type: 'string', aliases: ['projeto', 'objeto'] },
      { key: 'inicio', label: 'Início', type: 'date', aliases: ['inicio_vigencia', 'dt_inicio'] },
      { key: 'vencimento', label: 'Vencimento', type: 'date', required: true, aliases: ['fim_vigencia', 'dt_fim', 'vigencia_fim'] },
      { key: 'importancia', label: 'Importância segurada', type: 'number', format: 'currency', required: true, aliases: ['importancia_segurada', 'is', 'valor_garantido'] },
      { key: 'premio', label: 'Prêmio', type: 'number', format: 'currency', aliases: ['valor_premio', 'custo'] },
    ],
    breakdowns: [
      { id: 'tipo', label: 'Importância segurada por tipo', field: 'tipo', value: 'importancia', chart: 'doughnut' },
      { id: 'vigencia', label: 'Apólices por vencimento', aging: { dateField: 'vencimento', scheme: 'expiry' }, value: '_count', chart: 'bar' },
      { id: 'seguradora', label: 'Por seguradora', field: 'seguradora', value: 'importancia', chart: 'hbar', top: 10 },
    ],
    kpis: (s) => {
      const v = g(s, 'vigencia');
      const proximas = (v['Até 30 dias'] || 0) + (v['31-90 dias'] || 0);
      return [
        { label: 'Importância segurada', value: s.totals?.importancia?.sum ?? 0, format: 'currency' },
        { label: 'Prêmios', value: s.totals?.premio?.sum ?? 0, format: 'currency' },
        { label: 'Vencem em 90 dias', value: proximas, format: 'number', tone: proximas > 0 ? 'warn' : undefined },
        { label: 'Vencidas', value: v['Vencida'] || 0, format: 'number', tone: v['Vencida'] ? 'neg' : undefined },
      ];
    },
  },
  {
    slug: 'fornecedores',
    menu: 'Fornecedores',
    title: 'Fornecedores (contas a pagar)',
    icon: 'truck',
    // Nome opcional no .txt: se vier vazio, é preenchido pelo Mestre de Fornecedores (LFA1)
    nameLookup: { param: 'fornecedores', codeField: 'codigo', nameField: 'nome' },
    columns: [
      { key: 'codigo', label: 'Código', type: 'string', required: true, aliases: ['fornecedor', 'cod_fornecedor', 'cod', 'lifnr'] },
      { key: 'nome', label: 'Fornecedor', type: 'string', aliases: ['nome_1', 'nome', 'razao_social'] },
      { key: 'obra', label: 'Obra', type: 'string', aliases: ['contrato', 'centro_custo', 'projeto'] },
      { key: 'documento', label: 'Documento', type: 'string', aliases: ['doc', 'n_documento', 'nf'] },
      { key: 'vencimento', label: 'Vencimento', type: 'date', required: true, aliases: ['data_vencimento', 'dt_venc', 'venc'] },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency', required: true, aliases: ['saldo', 'montante', 'valor_aberto'] },
    ],
    breakdowns: [
      { id: 'aging', label: 'Aging (vencimento)', aging: { dateField: 'vencimento', scheme: 'overdue' }, value: 'valor', chart: 'bar' },
      { id: 'top', label: 'Maiores fornecedores', field: 'nome', value: 'valor', chart: 'hbar', top: 10 },
      { id: 'obra', label: 'Saldo por obra', field: 'obra', value: 'valor', chart: 'doughnut', top: 8 },
    ],
    kpis: (s) => {
      const ag = g(s, 'aging');
      const total = s.totals?.valor?.sum ?? 0;
      const vencido = total - (ag['A vencer'] || 0);
      return [
        { label: 'Total a pagar', value: total, format: 'currency' },
        { label: 'Vencido', value: vencido, format: 'currency', tone: vencido > 0 ? 'neg' : undefined },
        { label: '% vencido', value: ratio(vencido, total), format: 'percent' },
        { label: 'Fornecedores', value: Object.keys(g(s, 'top')).length, format: 'number' },
      ];
    },
  },
  {
    slug: 'fluxo-caixa',
    menu: 'Fluxo de Caixa',
    title: 'Fluxo de Caixa',
    icon: 'flow',
    columns: [
      { key: 'data', label: 'Data', type: 'date', required: true, aliases: ['data_lancamento', 'dt'] },
      { key: 'grupo', label: 'Atividade', type: 'string', required: true, aliases: ['atividade', 'categoria'] },
      { key: 'descricao', label: 'Descrição', type: 'string', aliases: ['desc', 'historico', 'texto'] },
      { key: 'valor', label: 'Valor', type: 'number', format: 'currency', required: true, aliases: ['montante'] },
    ],
    groupOrder: ['Operacional', 'Investimento', 'Financiamento'],
    breakdowns: [
      { id: 'grupo', label: 'Geração de caixa por atividade', field: 'grupo', value: 'valor', chart: 'bar' },
      { id: 'dia', label: 'Movimento diário', field: 'data', value: 'valor', chart: 'line', sortKeys: true },
    ],
    kpis: (s) => {
      const t = s.totals?.valor || {};
      const op = sumKeys(g(s, 'grupo'), (k) => k.startsWith('operac'));
      return [
        { label: 'Entradas', value: t.pos ?? 0, format: 'currency', tone: 'pos' },
        { label: 'Saídas', value: t.neg ?? 0, format: 'currency', tone: 'neg' },
        { label: 'Variação de caixa', value: t.sum ?? 0, format: 'currency', tone: (t.sum ?? 0) >= 0 ? 'pos' : 'neg' },
        { label: 'Caixa operacional', value: op, format: 'currency' },
      ];
    },
  },
  /* ------------------------------------------------------------------
   * Imobilizado: AR02 (Quadro do imobilizado, área 01 — depreciação do grupo). Um bem por linha.
   * ------------------------------------------------------------------ */
  {
    slug: 'imobilizado',
    menu: 'Imobilizado',
    title: 'Imobilizado',
    icon: 'building',
    source: 'generic',
    currencyMode: 'row',
    hasCentro: true,
    importer: {
      label: 'AR02 — Quadro do imobilizado',
      company: 'empresa',
      currency: 'moeda',
      required: ['imobilizado', 'empresa', 'custo'],
      fields: {
        imobilizado: { names: ['imobilizado'], label: 'Imobilizado' },
        subnumero: { names: ['sbn', 'subnumero'] },
        empresa: { names: ['empr', 'empresa'], label: 'Empr.' },
        conta: { names: ['ctabal_cap', 'conta_do_balanco_cap'] },
        descricao: { names: ['denominacao_do_imobilizado', 'denominacao'] },
        incorporacao: { names: ['dt_incorp', 'data_de_incorporacao'], type: 'date' },
        desativacao: { names: ['dta_descap', 'data_de_desativacao'], type: 'date' },
        baixas: { names: ['baixa'], type: 'number' },
        aquisicoes: { names: ['aquis', 'aquisicao'], type: 'number' },
        custoInicio: { names: ['cap_inicex'], type: 'number' },
        depInicio: { names: ['dep_inicex'], type: 'number' },
        vcInicio: { names: ['valcontiniexer'], type: 'number' },
        custo: { names: ['cap_atuais'], type: 'number', label: 'CAP atuais' },
        depAcumulada: { names: ['depr_acumulada'], type: 'number' },
        depAno: { names: ['deprec_do_ano'], type: 'number' },
        valorContabil: { names: ['valcon_atual'], type: 'number' },
        moeda: { names: ['moeda'] },
        centroLucro: { names: ['cen_lucro', 'centro_de_lucro'], upper: true },
        baixaDep: { names: ['baixa_dep'], type: 'number' },
      },
      skip: (r) => !r.custo && !r.custoInicio && !r.aquisicoes && !r.baixas && !r.valorContabil && !r.depAno,
      derive: (r, ctx) => ({
        classe: ctx.contaClasse(r.conta) || `Conta ${r.conta}`,
        situacao: r.desativacao ? 'Baixado' : (r.valorContabil > 0 ? 'Em uso' : 'Totalmente depreciado'),
        anoIncorporacao: r.incorporacao ? r.incorporacao.slice(0, 4) : 'Sem data',
      }),
    },
    sumFields: ['custoInicio', 'depInicio', 'vcInicio', 'baixaDep'],
    columns: [
      { key: 'imobilizado', label: 'Imobilizado', type: 'string' },
      { key: 'subnumero', label: 'Sub.', type: 'string' },
      { key: 'descricao', label: 'Denominação', type: 'string' },
      { key: 'classe', label: 'Classe', type: 'string' },
      { key: 'conta', label: 'Conta', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'incorporacao', label: 'Incorporação', type: 'date' },
      { key: 'situacao', label: 'Situação', type: 'string' },
      { key: 'custo', label: 'Custo (CAP)', type: 'number', format: 'currency' },
      { key: 'depAcumulada', label: 'Depr. acumulada', type: 'number', format: 'currency' },
      { key: 'valorContabil', label: 'Valor contábil', type: 'number', format: 'currency' },
      { key: 'aquisicoes', label: 'Aquisições no ano', type: 'number', format: 'currency' },
      { key: 'baixas', label: 'Baixas no ano', type: 'number', format: 'currency' },
      { key: 'depAno', label: 'Depr. do ano', type: 'number', format: 'currency' },
    ],
    breakdowns: [
      { id: 'classe', label: 'Valor contábil por classe', field: 'classe', value: 'valorContabil', chart: 'hbar', top: 10 },
      { id: 'situacao', label: 'Custo por situação', field: 'situacao', value: 'custo', chart: 'doughnut' },
      { id: 'centroTop', label: 'Maiores centros de lucro (valor contábil)', field: 'centroLucro', value: 'valorContabil', chart: 'hbar', top: 10 },
      { id: 'centros', field: 'centroLucro', value: 'custo', chart: null },
      { id: 'bens', field: 'imobilizado', value: '_count', chart: null },
    ],
    // Movimentação do ano (custo e depreciação), conferida contra os saldos atuais
    statementFn: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      const custoCalc = t('custoInicio') + t('aquisicoes') + t('baixas');
      const depCalc = t('depInicio') + t('depAno') + t('baixaDep');
      const lines = [
        { label: 'Custo (CAP)', kind: 'section' },
        { label: 'Saldo no início do exercício', value: t('custoInicio') },
        { label: '(+) Aquisições', value: t('aquisicoes') },
        { label: '(-) Baixas', value: t('baixas') },
      ];
      if (Math.abs(t('custo') - custoCalc) >= 0.5) lines.push({ label: '(+/-) Transferências e ajustes', value: t('custo') - custoCalc });
      lines.push({ label: 'Saldo atual do custo', value: t('custo'), subtotal: true });
      lines.push({ label: 'Depreciação acumulada', kind: 'section' });
      lines.push({ label: 'Saldo no início do exercício', value: t('depInicio') });
      lines.push({ label: '(-) Depreciação do ano', value: t('depAno') });
      lines.push({ label: '(+) Baixas de depreciação', value: t('baixaDep') });
      if (Math.abs(t('depAcumulada') - depCalc) >= 0.5) lines.push({ label: '(+/-) Transferências e ajustes', value: t('depAcumulada') - depCalc });
      lines.push({ label: 'Saldo atual da depreciação', value: t('depAcumulada'), subtotal: true });
      lines.push({ label: 'Valor contábil atual', value: t('valorContabil'), subtotal: true, highlight: true });
      return lines;
    },
    kpis: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      const custo = t('custo');
      const dep = Math.abs(t('depAcumulada'));
      return [
        { label: 'Custo (CAP)', value: custo, format: 'currency' },
        { label: 'Depreciação acumulada', value: dep, format: 'currency', hint: `${custo ? ((dep / custo) * 100).toFixed(1).replace('.', ',') : '0,0'}% do custo` },
        { label: 'Valor contábil', value: t('valorContabil'), format: 'currency' },
        { label: 'Depreciação do ano', value: Math.abs(t('depAno')), format: 'currency' },
        { label: 'Aquisições no ano', value: t('aquisicoes'), format: 'currency' },
        { label: 'Baixas no ano', value: Math.abs(t('baixas')), format: 'currency' },
        { label: 'Bens', value: s.count, format: 'number' },
      ];
    },
  },

  /* ------------------------------------------------------------------
   * Receita: item único no menu, com duas abas
   *   POC (ZS0003) — receita reconhecida pelo método de avanço (IFRS 15)
   *   Medição (ZC0086) — receita de medição e faturamento
   * ------------------------------------------------------------------ */
  {
    slug: 'receita-poc',
    menu: 'Receita',
    title: 'Receita · POC',
    icon: 'trend',
    source: 'generic',
    currencyMode: 'row',
    hasCentro: true,
    tabs: [{ slug: 'receita-poc', label: 'POC (ZS0003)' }, { slug: 'receita-medicao', label: 'Medição (ZC0086)' }],
    importer: {
      label: 'ZS0003 — Registro de POC',
      company: 'empresa',
      currency: 'moeda',
      required: ['empresa', 'centroLucro', 'obrigacao', 'precoTotal'],
      fields: {
        empresa: { names: ['empresa'], label: 'Empresa' },
        ledger: { names: ['ledger'] },
        centroLucro: { names: ['centro_de_lucro'], upper: true, label: 'Centro de lucro' },
        obrigacao: { names: ['obrigacoes_de_desempenho', 'obrigacao_de_desempenho'], label: 'Obrigações de Desempenho' },
        inicio: { names: ['data_inicio_contrato'], type: 'date' },
        fim: { names: ['data_termino_contrato'], type: 'date' },
        precoTotal: { names: ['preco_total'], type: 'number', label: 'Preço Total' },
        moeda: { names: ['moeda'] },
        custoOrcado: { names: ['custo_total_orcado'], type: 'number' },
        resultadoEstimado: { names: ['resultado_estimado'], type: 'number' },
        custoAcumulado: { names: ['custo_acumulado_obra'], type: 'number' },
        faturamentoAcumulado: { names: ['faturamento_acumulado'], type: 'number' },
        custoPeriodo: { names: ['custo_do_periodo'], type: 'number' },
        faturamentoPeriodo: { names: ['faturamento_do_periodo'], type: 'number' },
        pocPeriodo: { names: ['poc_do_periodo'], type: 'number' },
        pocAcumulado: { names: ['poc_acumulado'], type: 'number' },
        receitaPeriodo: { names: ['receita_periodo_mes'], type: 'number' },
        resultadoAcumulado: { names: ['resultado_acumulado_apos_ias'], type: 'number' },
        cliente: { names: ['cliente_da_obra'] },
        recebimento: { names: ['recebimento'], type: 'number' },
        recebimentoAcumulado: { names: ['recebimento_acumulado'], type: 'number' },
        provisaoPis: { names: ['provisao_pis'], type: 'number' },
        provisaoCofins: { names: ['provisao_cofins'], type: 'number' },
      },
      derive: (r) => {
        const avanco = r.custoOrcado ? r.custoAcumulado / r.custoOrcado : 0;
        return {
          avanco: Math.round(avanco * 10000) / 100,
          margemEstimada: r.precoTotal ? Math.round((r.resultadoEstimado / r.precoTotal) * 10000) / 100 : 0,
          backlog: Math.max(0, r.precoTotal - r.pocAcumulado),
          faixaAvanco: avanco >= 1 ? 'Concluída' : avanco >= 0.75 ? '75% a 99%' : avanco >= 0.5 ? '50% a 74%' : avanco >= 0.25 ? '25% a 49%' : avanco > 0 ? 'Até 25%' : 'Não iniciada',
        };
      },
      /**
       * No ZS0003 faturamento, recebimento e custo indireto são da OBRA (centro de lucro) e vêm
       * repetidos em cada obrigação de desempenho: ficam só na primeira obrigação de cada obra
       * (valores diferentes entre obrigações são somados uma vez cada — [A CONFIRMAR] recebimento acumulado).
       * Ativo/passivo contratual = Σ POC acumulado das obrigações − faturamento acumulado da obra.
       */
      postProcess: (rows) => {
        const OBRA = ['faturamentoAcumulado', 'faturamentoPeriodo', 'recebimento', 'recebimentoAcumulado'];
        const groups = new Map();
        for (const r of rows) {
          const k = `${r.empresa}|${r.centroLucro}|${r.moeda}`;
          (groups.get(k) || groups.set(k, []).get(k)).push(r);
        }
        for (const list of groups.values()) {
          for (const f of OBRA) {
            const seen = new Set();
            for (const r of list) {
              const key = String(r[f]);
              if (seen.has(key)) r[f] = 0; else seen.add(key);
            }
          }
          const poc = list.reduce((a, r) => a + r.pocAcumulado, 0);
          const fat = list.reduce((a, r) => a + r.faturamentoAcumulado, 0);
          const saldo = poc - fat; // + a faturar (ativo) / − faturado antecipado (passivo)
          list.forEach((r, i) => {
            r.ativoContratual = i === 0 && saldo > 0 ? saldo : 0;
            r.passivoContratual = i === 0 && saldo < 0 ? -saldo : 0;
            r.obrigacoesNaObra = list.length;
          });
        }
      },
    },
    sumFields: ['custoOrcado', 'resultadoEstimado', 'recebimento', 'recebimentoAcumulado', 'provisaoPis', 'provisaoCofins', 'resultadoAcumulado'],
    columns: [
      { key: 'obrigacao', label: 'Obrigação de desempenho', type: 'string' },
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'cliente', label: 'Cliente', type: 'string' },
      { key: 'ledger', label: 'Ledger', type: 'string' },
      { key: 'fim', label: 'Término', type: 'date' },
      { key: 'avanco', label: 'Avanço (%)', type: 'number', format: 'number' },
      { key: 'margemEstimada', label: 'Margem est. (%)', type: 'number', format: 'number' },
      { key: 'precoTotal', label: 'Preço total', type: 'number', format: 'currency' },
      { key: 'receitaPeriodo', label: 'Receita do período', type: 'number', format: 'currency' },
      { key: 'pocAcumulado', label: 'Receita acumulada (POC)', type: 'number', format: 'currency' },
      { key: 'faturamentoAcumulado', label: 'Faturamento acumulado (obra)', type: 'number', format: 'currency' },
      { key: 'ativoContratual', label: 'A faturar (obra)', type: 'number', format: 'currency' },
      { key: 'passivoContratual', label: 'Faturado antecipado (obra)', type: 'number', format: 'currency' },
      { key: 'backlog', label: 'Saldo a executar', type: 'number', format: 'currency' },
      { key: 'custoPeriodo', label: 'Custo do período', type: 'number', format: 'currency' },
      { key: 'custoAcumulado', label: 'Custo acumulado', type: 'number', format: 'currency' },
    ],
    breakdowns: [
      { id: 'centroTop', label: 'Receita do período por centro de lucro', field: 'centroLucro', value: 'receitaPeriodo', chart: 'hbar', top: 10 },
      { id: 'faixa', label: 'Saldo a executar por faixa de avanço', field: 'faixaAvanco', value: 'backlog', chart: 'bar', order: ['Não iniciada', 'Até 25%', '25% a 49%', '50% a 74%', '75% a 99%', 'Concluída'] },
      { id: 'cliente', label: 'Receita acumulada por cliente', field: 'cliente', value: 'pocAcumulado', chart: 'doughnut', top: 8 },
      { id: 'centros', field: 'centroLucro', value: 'precoTotal', chart: null },
      { id: 'contratos', field: 'obrigacao', value: '_count', chart: null },
    ],
    kpis: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      return [
        { label: 'Receita do período', value: t('receitaPeriodo'), format: 'currency', hint: 'POC do mês' },
        { label: 'Receita acumulada (POC)', value: t('pocAcumulado'), format: 'currency' },
        { label: 'Faturamento acumulado', value: t('faturamentoAcumulado'), format: 'currency' },
        { label: 'A faturar (ativo contratual)', value: t('ativoContratual'), format: 'currency' },
        { label: 'Faturado antecipado (passivo)', value: t('passivoContratual'), format: 'currency' },
        { label: 'Saldo a executar', value: t('backlog'), format: 'currency', hint: 'Preço total − receita acumulada' },
        { label: 'Margem estimada', value: ratio(t('resultadoEstimado'), t('precoTotal')), format: 'percent' },
        { label: 'Contratos', value: Object.keys(g(s, 'contratos')).length, format: 'number' },
      ];
    },
  },
  {
    slug: 'receita-medicao',
    menu: 'Receita',
    title: 'Receita · Medição',
    icon: 'trend',
    source: 'generic',
    currencyMode: 'row',
    hasCentro: true,
    hideInMenu: true, // aba de "Receita"
    tabs: [{ slug: 'receita-poc', label: 'POC (ZS0003)' }, { slug: 'receita-medicao', label: 'Medição (ZC0086)' }],
    importer: {
      label: 'ZC0086 — Receita de medição',
      company: 'empresa',
      currency: 'moeda',
      required: ['empresa', 'centroLucro', 'precoTotal'],
      fields: {
        empresa: { names: ['empresa'], label: 'Empresa' },
        centroLucro: { names: ['centro_de_lucro'], upper: true, label: 'Centro de lucro' },
        classeReceita: { names: ['classe_de_receita'] },
        moeda: { names: ['moeda'] },
        precoTotal: { names: ['preco_total'], type: 'number', label: 'Preço Total' },
        medicaoPeriodo: { names: ['medicao_periodo'], type: 'number' },
        medicaoAcumulada: { names: ['medicao_acumulada'], type: 'number' },
        faturamentoPeriodo: { names: ['faturamento_periodo'], type: 'number' },
        faturamentoAcumulado: { names: ['faturamento_acumulado'], type: 'number' },
        receitaMes: { names: ['receita_mes'], type: 'number' },
        pis: { names: ['valor_pis'], type: 'number' },
        cofins: { names: ['valor_cofins'], type: 'number' },
        ajusteIrf15: { names: ['ajuste_irf15'], type: 'number' },
        ajusteIrf15Acum: { names: ['ajuste_irf15_acumulado'], type: 'number' },
        issAjuste: { names: ['iss_ajuste_irf15'], type: 'number' },
        documento: { names: ['n_documento', 'numero_documento'] },
      },
      derive: (r, ctx) => ({
        classeDescricao: ctx.contaDescricao(r.classeReceita) ? `${r.classeReceita} · ${ctx.contaDescricao(r.classeReceita)}` : r.classeReceita,
        pctMedido: r.precoTotal ? Math.round((r.medicaoAcumulada / r.precoTotal) * 10000) / 100 : 0,
        medidoNaoFaturado: r.medicaoAcumulada - r.faturamentoAcumulado,
        saldoAMedir: Math.max(0, r.precoTotal - r.medicaoAcumulada),
      }),
    },
    sumFields: ['ajusteIrf15Acum', 'issAjuste'],
    columns: [
      { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
      { key: 'classeDescricao', label: 'Classe de receita', type: 'string' },
      { key: 'pctMedido', label: 'Medido (%)', type: 'number', format: 'number' },
      { key: 'precoTotal', label: 'Preço total', type: 'number', format: 'currency' },
      { key: 'receitaMes', label: 'Receita do mês', type: 'number', format: 'currency' },
      { key: 'medicaoPeriodo', label: 'Medição do período', type: 'number', format: 'currency' },
      { key: 'medicaoAcumulada', label: 'Medição acumulada', type: 'number', format: 'currency' },
      { key: 'faturamentoPeriodo', label: 'Faturamento do período', type: 'number', format: 'currency' },
      { key: 'faturamentoAcumulado', label: 'Faturamento acumulado', type: 'number', format: 'currency' },
      { key: 'medidoNaoFaturado', label: 'Medido não faturado', type: 'number', format: 'currency' },
      { key: 'saldoAMedir', label: 'Saldo a medir', type: 'number', format: 'currency' },
      { key: 'pis', label: 'PIS', type: 'number', format: 'currency' },
      { key: 'cofins', label: 'COFINS', type: 'number', format: 'currency' },
      { key: 'ajusteIrf15', label: 'Ajuste IFRS 15', type: 'number', format: 'currency' },
      { key: 'documento', label: 'Documento', type: 'string' },
    ],
    breakdowns: [
      { id: 'centroTop', label: 'Receita do mês por centro de lucro', field: 'centroLucro', value: 'receitaMes', chart: 'hbar', top: 10 },
      { id: 'classe', label: 'Medição acumulada por classe de receita', field: 'classeDescricao', value: 'medicaoAcumulada', chart: 'doughnut' },
      { id: 'saldo', label: 'Maiores saldos a medir', field: 'centroLucro', value: 'saldoAMedir', chart: 'hbar', top: 10 },
      { id: 'centros', field: 'centroLucro', value: 'precoTotal', chart: null },
    ],
    kpis: (s) => {
      const t = (k) => s.totals?.[k]?.sum ?? 0;
      return [
        { label: 'Receita do mês', value: t('receitaMes'), format: 'currency' },
        { label: 'Medição acumulada', value: t('medicaoAcumulada'), format: 'currency', hint: `${t('precoTotal') ? ((t('medicaoAcumulada') / t('precoTotal')) * 100).toFixed(1).replace('.', ',') : '0,0'}% do preço total` },
        { label: 'Faturamento do período', value: t('faturamentoPeriodo'), format: 'currency' },
        { label: 'Medido não faturado', value: t('medidoNaoFaturado'), format: 'currency', tone: t('medidoNaoFaturado') < 0 ? 'warn' : undefined },
        { label: 'Saldo a medir', value: t('saldoAMedir'), format: 'currency' },
        { label: 'Ajuste IFRS 15 (mês)', value: t('ajusteIrf15'), format: 'currency' },
        { label: 'Obras', value: Object.keys(g(s, 'centros')).length, format: 'number' },
      ];
    },
  },
];

const bySlug = Object.fromEntries(modules.map((m) => [m.slug, m]));

module.exports = { modules, bySlug, AGING_SCHEMES, norm, statusGiro, GIRO_FAIXAS };
