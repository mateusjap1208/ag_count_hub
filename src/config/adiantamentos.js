/**
 * Adiantamentos: gerado do FGI0 (saldos contábeis), junto com BP, DRE e Capital Empregado.
 * Entram as contas do Plano de Contas em "Adiantamento a fornecedores e subempreiteiros" e
 * "Adiantamento a funcionários" (N4), e as linhas do BP de "antecipação" a fornecedores.
 * Saldo = o mesmo do BP (ativo). Prazo = grupo do BP (Ativo Circulante / Ativo Não Circulante).
 */
const g = (s, key) => (s.breakdowns && s.breakdowns[key]) || {};
const ratio = (a, b) => (b ? a / b : null);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stripCode = (s) => String(s || '').replace(/^[A-Z]\.[\d.]+\s*-\s*/, '').trim();

const FORNECEDORES = 'Adiantamento a fornecedores e subempreiteiros';
const FUNCIONARIOS = 'Adiantamento a funcionários';
const PRAZO = { 'Ativo Circulante': 'Curto prazo (circulante)', 'Ativo Não Circulante': 'Longo prazo (não circulante)' };

/** Tipo do adiantamento pela classificação N4 do plano ou pela linha do BP; null = não é adiantamento */
function tipoDe(row, n4) {
  const n = norm(n4);
  if (n.includes('adiantamento a funcionarios')) return FUNCIONARIOS;
  if (n.includes('adiantamento a fornecedores')) return FORNECEDORES;
  const c = norm(row.classe);
  if (c.includes('antecipa') && c.includes('fornecedor')) return FORNECEDORES;
  return null;
}

/** Linhas de Adiantamentos a partir das linhas do BP de uma empresa (planoN4: conta → N4) */
function fromBp(bpRows, planoN4) {
  const out = [];
  for (const r of bpRows) {
    const n4 = stripCode(planoN4(r.conta));
    const tipo = tipoDe(r, n4);
    if (!tipo) continue;
    const prazo = PRAZO[r.grupo] || r.grupo || 'Não informado';
    out.push({
      conta: r.conta, descricao: r.descricao, centroLucro: r.centroLucro,
      tipo, prazo, linhaBp: r.classe, classificacao: n4 || '—',
      saldo: r.saldo,
      arvore: `${tipo}|${prazo}|${r.classe}`,
    });
  }
  return out;
}

module.exports = {
  slug: 'adiantamentos',
  menu: 'Adiantamentos',
  title: 'Adiantamentos',
  icon: 'arrow',
  source: 'fgi0',
  fromBp,
  columns: [
    { key: 'conta', label: 'Conta', type: 'string' },
    { key: 'descricao', label: 'Descrição', type: 'string' },
    { key: 'tipo', label: 'Tipo', type: 'string' },
    { key: 'prazo', label: 'Prazo', type: 'string' },
    { key: 'linhaBp', label: 'Linha do BP', type: 'string' },
    { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
    { key: 'saldo', label: 'Saldo', type: 'number', format: 'currency' },
  ],
  breakdowns: [
    { id: 'tipo', label: 'Saldo por tipo', field: 'tipo', value: 'saldo', chart: 'doughnut' },
    { id: 'centro', label: 'Maiores saldos por centro de lucro', field: 'centroLucro', value: 'saldo', chart: 'hbar', top: 10 },
    { id: 'prazo', field: 'prazo', value: 'saldo', chart: null },
    { id: 'arvore', field: 'arvore', value: 'saldo', chart: null },
    { id: 'contas', spread: (r) => (r.conta ? [[`${r.arvore}|${r.conta}${r.descricao ? ` - ${r.descricao}` : ''}`, r.saldo || 0]] : []), chart: null },
    { id: 'contasDistintas', field: 'conta', value: '_count', chart: null },
    { id: 'centros', field: 'centroLucro', value: 'saldo', chart: null }, // relação empresa × centro de lucro (filtros)
  ],
  groupOrder: Object.values(PRAZO),
  tree: {
    breakdown: 'arvore',
    detail: 'contas',
    itemSort: 'abs',
    sections: [
      { key: FORNECEDORES, label: 'Adiantamentos e antecipações a fornecedores e subempreiteiros', total: 'Total fornecedores e subempreiteiros' },
      { key: FUNCIONARIOS, label: 'Adiantamentos a funcionários', total: 'Total funcionários' },
    ],
    grandTotal: 'Total de adiantamentos',
  },
  kpis: (s) => {
    const t = g(s, 'tipo');
    const p = g(s, 'prazo');
    const total = s.totals?.saldo?.sum ?? 0;
    const lp = p[PRAZO['Ativo Não Circulante']] || 0;
    return [
      { label: 'Total de adiantamentos', value: total, format: 'currency' },
      { label: 'A fornecedores e subempreiteiros', value: t[FORNECEDORES] || 0, format: 'currency', hint: 'Inclui antecipações' },
      { label: 'A funcionários', value: t[FUNCIONARIOS] || 0, format: 'currency' },
      { label: 'Longo prazo', value: lp, format: 'currency', hint: `${total ? ((ratio(lp, total) || 0) * 100).toFixed(1).replace('.', ',') : '0,0'}% do total` },
      { label: 'Contas contábeis', value: Object.keys(g(s, 'contasDistintas')).length, format: 'number' },
    ];
  },
};
