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
  {
    slug: 'imobilizado',
    menu: 'Imobilizado',
    title: 'Imobilizado',
    icon: 'building',
    columns: [
      { key: 'bem', label: 'Bem', type: 'string', required: true, aliases: ['imobilizado', 'n_imobilizado', 'codigo'] },
      { key: 'descricao', label: 'Descrição', type: 'string', aliases: ['desc', 'denominacao'] },
      { key: 'classe', label: 'Classe', type: 'string', required: true, aliases: ['classe_imobilizado', 'categoria'] },
      { key: 'aquisicao', label: 'Aquisição', type: 'date', aliases: ['data_aquisicao', 'dt_aquisicao'] },
      { key: 'custo', label: 'Custo', type: 'number', format: 'currency', required: true, aliases: ['valor_aquisicao', 'custo_aquisicao'] },
      { key: 'depreciacao', label: 'Depreciação acumulada', type: 'number', format: 'currency', aliases: ['depreciacao_acumulada', 'deprec_acum'] },
      { key: 'liquido', label: 'Valor líquido', type: 'number', format: 'currency', aliases: ['valor_liquido', 'valor_contabil'],
        compute: (r) => (r.custo || 0) - Math.abs(r.depreciacao || 0) },
    ],
    breakdowns: [
      { id: 'classe', label: 'Valor líquido por classe', field: 'classe', value: 'liquido', chart: 'bar' },
    ],
    kpis: (s) => {
      const custo = s.totals?.custo?.sum ?? 0;
      const dep = Math.abs(s.totals?.depreciacao?.sum ?? 0);
      return [
        { label: 'Custo de aquisição', value: custo, format: 'currency' },
        { label: 'Depreciação acumulada', value: dep, format: 'currency' },
        { label: 'Valor líquido', value: s.totals?.liquido?.sum ?? 0, format: 'currency' },
        { label: '% depreciado', value: ratio(dep, custo), format: 'percent' },
      ];
    },
  },
];

const bySlug = Object.fromEntries(modules.map((m) => [m.slug, m]));

module.exports = { modules, bySlug, AGING_SCHEMES, norm, statusGiro, GIRO_FAIXAS };
