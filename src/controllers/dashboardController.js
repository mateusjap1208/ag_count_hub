const Report = require('../models/Report');

const kpi = (view, label) => {
  if (view.empty) return null;
  const k = view.kpis.find((x) => x.label === label);
  return k ? { ...k, currency: view.currency } : null;
};

exports.index = async (req, res, next) => {
  try {
    const { scope } = res.locals;
    const slugs = Report.modules.map((m) => m.slug);
    const views = Object.fromEntries(await Promise.all(
      slugs.map(async (s) => [s, await Report.getModuleView(s, scope)])));

    // Passivo + PL: soma dos dois indicadores do BP (deve fechar com o ativo)
    const passivo = kpi(views.bp, 'Passivo total');
    const pl = kpi(views.bp, 'Patrimônio líquido');
    const passivoPl = passivo && pl
      ? { label: 'Passivo + PL', value: passivo.value + pl.value, format: 'currency', currency: views.bp.currency, hint: 'Passivo total + patrimônio líquido' }
      : null;

    // Ordem: Ativo, Passivo + PL, Receita líquida, Lucro líquido, Capital empregado, Valor em estoque
    const highlights = [
      { module: 'bp', ...kpi(views.bp, 'Ativo total') },
      { module: 'bp', ...passivoPl },
      { module: 'dre', ...kpi(views.dre, 'Receita líquida') },
      { module: 'dre', ...kpi(views.dre, 'Lucro líquido') },
      { module: 'capital-empregado', ...kpi(views['capital-empregado'], 'Capital empregado') },
      { module: 'estoque', ...kpi(views.estoque, 'Valor em estoque') },
    ].filter((h) => h.label);

    const dreTrend = await Report.trend('dre', scope);
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
    const status = Report.modules.map((m) => {
      const list = uploads.filter((u) => u.module === m.slug && (m.source !== 'fgi0' || u.currencyType === ct));
      return { slug: m.slug, title: m.menu, icon: m.icon, companies: list.length, rows: list.reduce((a, u) => a + u.rows, 0) };
    });

    res.render('dashboard/index', {
      title: 'Visão Geral',
      highlights,
      status,
      totalCompanies: res.locals.companies.length,
      currency: views.dre.currency,
      chartData: { trend, bp: bpChart, agingReceber, agingPagar, currency: views.dre.currency },
    });
  } catch (e) { next(e); }
};
