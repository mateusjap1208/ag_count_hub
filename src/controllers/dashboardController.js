const Report = require('../models/Report');
const Telas = require('../config/telas');

// Arrendamento Mercantil Curto Prazo + Longo Prazo (saldo do passivo de arrendamento no balancete)
const CONTAS_ARRENDAMENTO = ['2159000020', '2959000020'];

const kpi = (view, label) => {
  if (view.empty) return null;
  const k = view.kpis.find((x) => x.label === label);
  return k ? { ...k, currency: view.currency } : null;
};

exports.index = async (req, res, next) => {
  try {
    const { scope } = res.locals;
    // Só carrega os módulos das telas liberadas ao usuário (os demais ficam como "vazios")
    const pode = (slug) => Telas.podeVer(req.user, slug);
    const slugs = Report.modules.map((m) => m.slug);
    const views = Object.fromEntries(await Promise.all(
      slugs.map(async (s) => [s, pode(s) ? await Report.getModuleView(s, scope) : { empty: true, currency: null }])));

    // Passivo + PL: soma dos dois indicadores do BP (deve fechar com o ativo)
    const passivo = kpi(views.bp, 'Passivo total');
    const pl = kpi(views.bp, 'Patrimônio líquido');
    const passivoPl = passivo && pl
      ? { label: 'Passivo + PL', value: passivo.value + pl.value, format: 'currency', currency: views.bp.currency, hint: 'Passivo total + patrimônio líquido' }
      : null;

    // Passivo de arrendamento: saldo contábil do BP (contas de arrendamento mercantil CP + LP).
    // Sem BP liberado/importado, cai no saldo do cronograma IFRS 16 (Carteira final do passivo).
    let arrendamento = { ...kpi(views.arrendamento, 'Passivo de arrendamento'), hint: 'IFRS 16 · cronograma' };
    if (pode('bp') && !views.bp.empty) {
      const contas = (await Report.getSummary('bp', scope))?.breakdowns?.contas || {};
      // Chave do breakdown: "seção|grupo|linha|conta - descrição"
      const contaDa = (k) => String(k.split('|')[3] || '').split(' - ')[0].trim().replace(/^0+/, '');
      const achou = Object.keys(contas).filter((k) => CONTAS_ARRENDAMENTO.includes(contaDa(k)));
      if (achou.length) {
        arrendamento = {
          label: 'Passivo de arrendamento', format: 'currency', currency: views.bp.currency,
          value: achou.reduce((a, k) => a + (contas[k] || 0), 0),
          hint: `Contas ${CONTAS_ARRENDAMENTO.join(' + ')} (CP + LP)`,
        };
      }
    }

    // Estoque: só o estoque próprio (o de terceiros não compõe o BP)
    const estoque = kpi(views.estoque, 'Estoque próprio');

    // Ordem: Ativo, Passivo + PL, Receita líquida, Lucro líquido, Capital empregado, Valor em estoque
    const highlights = [
      { module: 'bp', ...kpi(views.bp, 'Ativo total') },
      { module: 'bp', ...passivoPl },
      { module: 'dre', ...kpi(views.dre, 'Receita líquida') },
      { module: 'dre', ...kpi(views.dre, 'Lucro líquido') },
      { module: 'capital-empregado', ...kpi(views['capital-empregado'], 'Capital empregado') },
      { module: 'estoque', ...estoque, label: 'Valor em estoque', hint: 'Estoque próprio (sem terceiros)' },
      { module: 'arrendamento', ...arrendamento },
      { module: 'adiantamentos', ...kpi(views.adiantamentos, 'Total de adiantamentos'), hint: 'Fornecedores, subempreiteiros e funcionários' },
      { module: 'seguros-garantias', ...kpi(views['seguros-garantias'], 'Saldo a apropriar'), label: 'Seguros a apropriar', hint: 'Despesa antecipada' },
      { module: 'imobilizado', ...kpi(views.imobilizado, 'Valor contábil'), label: 'Imobilizado (valor contábil)', hint: 'Custo − depreciação' },
    ].filter((h) => h.value !== undefined);

    const dreTrend = pode('dre') ? await Report.trend('dre', scope) : [];
    const trend = {
      labels: dreTrend.map((t) => res.locals.fmt.period(t.period)),
      receita: dreTrend.map((t) => t.kpis.find((k) => k.label === 'Receita líquida')?.value ?? 0),
      lucro: dreTrend.map((t) => t.kpis.find((k) => k.label === 'Lucro líquido')?.value ?? 0),
    };

    const withCur = (view, chart) => (chart ? { ...chart, currency: view.currency } : null);
    const bpChart = views.bp.empty ? null : withCur(views.bp, views.bp.charts[0]);
    const agingReceber = views.clientes.empty ? null : withCur(views.clientes, views.clientes.charts.find((c) => c.id === 'aging'));
    const agingPagar = views.fornecedores.empty ? null : withCur(views.fornecedores, views.fornecedores.charts.find((c) => c.id === 'aging'));

    const uploads = scope.period ? await Report.listUploads({ period: scope.period }) : [];
    const ct = String(scope.moeda).split(':')[0];
    const status = Report.modules.filter((m) => !m.inativo && !m.hideInMenu && pode(m.slug)).map((m) => {
      const list = uploads.filter((u) => u.module === m.slug && (m.source !== 'fgi0' || u.currencyType === ct));
      return { slug: m.slug, title: m.menu, icon: m.icon, companies: list.length, rows: list.reduce((a, u) => a + u.rows, 0) };
    });

    res.render('dashboard/index', {
      title: 'Visão Geral',
      highlights,
      status,
      totalCompanies: res.locals.companies.length,
      currency: views.dre.currency || 'BRL',
      mostra: { dre: pode('dre'), bp: pode('bp'), clientes: pode('clientes'), fornecedores: pode('fornecedores') },
      chartData: { trend, bp: bpChart, agingReceber, agingPagar, currency: views.dre.currency || 'BRL' },
    });
  } catch (e) { next(e); }
};
