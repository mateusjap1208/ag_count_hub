const Report = require('../models/Report');
const agg = require('../services/aggregator');
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
      ? { label: 'Passivo + PL', value: passivo.value + pl.value, format: 'currency', currency: views.bp.currency }
      : null;

    // Passivo de arrendamento: saldo contábil do BP (contas de arrendamento mercantil CP + LP).
    // Sem BP liberado/importado, cai no saldo do cronograma IFRS 16 (Carteira final do passivo).
    let arrendamento = { ...kpi(views.arrendamento, 'Passivo de arrendamento'), ajuda: 'Carteira final do passivo no cronograma de arrendamento (IFRS 16) da competência. Usado quando o BP não está disponível.' };
    if (pode('bp') && !views.bp.empty) {
      const contas = (await Report.getSummary('bp', scope))?.breakdowns?.contas || {};
      // Chave do breakdown: "seção|grupo|linha|conta - descrição"
      const contaDa = (k) => String(k.split('|')[3] || '').split(' - ')[0].trim().replace(/^0+/, '');
      const achou = Object.keys(contas).filter((k) => CONTAS_ARRENDAMENTO.includes(contaDa(k)));
      if (achou.length) {
        arrendamento = {
          label: 'Passivo de arrendamento', format: 'currency', currency: views.bp.currency,
          value: achou.reduce((a, k) => a + (contas[k] || 0), 0),
          ajuda: `Saldo contábil do passivo de arrendamento no Balanço: contas ${CONTAS_ARRENDAMENTO.join(' (curto prazo) + ')} (longo prazo).`,
        };
      }
    }

    // Estoque: só o estoque próprio (o de terceiros não compõe o BP)
    const estoque = kpi(views.estoque, 'Estoque próprio');

    // Ordem: Ativo, Passivo + PL, Receita líquida, Lucro líquido, Capital empregado, Valor em estoque
    // Cada card tem um "?" com a explicação resumida de como o número é montado (ajuda)
    const highlights = [
      { module: 'bp', ...kpi(views.bp, 'Ativo total'), ajuda: 'Soma do ativo circulante e não circulante do Balanço Patrimonial, gerado do FGI0 (saldos contábeis) da competência.' },
      { module: 'bp', ...passivoPl, ajuda: 'Passivo total + patrimônio líquido do Balanço. Deve fechar com o ativo total; o PL já inclui o resultado do exercício.' },
      { module: 'dre', ...kpi(views.dre, 'Receita líquida'), ajuda: 'Receita bruta menos as deduções (impostos sobre a receita) da DRE, acumulada de janeiro até a competência.' },
      { module: 'dre', ...kpi(views.dre, 'Lucro líquido'), ajuda: 'Resultado final da DRE de janeiro até a competência: receita líquida − custos − despesas ± resultado financeiro − IR e CSLL.' },
      { module: 'capital-empregado', ...kpi(views['capital-empregado'], 'Capital empregado'), ajuda: 'Ativos operacionais + passivos operacionais da estrutura gerencial (QV Capital Empregado), com as contas ligadas pelo Mapeamento de Contas.' },
      { module: 'estoque', ...estoque, label: 'Valor em estoque', ajuda: 'Valor do estoque próprio no relatório ZL0190 da competência. O estoque de terceiros fica de fora, porque não pertence à empresa.' },
      { module: 'arrendamento', ...arrendamento },
      { module: 'adiantamentos', ...kpi(views.adiantamentos, 'Total de adiantamentos'), ajuda: 'Saldo no Balanço das contas de adiantamento a fornecedores, subempreiteiros e funcionários (classificação N4 do Plano de Contas).' },
      { module: 'seguros-garantias', ...kpi(views['seguros-garantias'], 'Saldo a apropriar'), label: 'Seguros a apropriar', ajuda: 'Prêmios de seguros e garantias já pagos que ainda vão para o resultado nos próximos meses (despesa antecipada).' },
      { module: 'imobilizado', ...kpi(views.imobilizado, 'Valor contábil'), label: 'Imobilizado (valor contábil)', ajuda: 'Custo de aquisição dos bens menos a depreciação acumulada, pelo quadro do imobilizado (AR02).' },
    ].filter((h) => h.value !== undefined);

    const dreTrend = pode('dre') ? await Report.trend('dre', scope) : [];
    const trend = {
      labels: dreTrend.map((t) => res.locals.fmt.period(t.period)),
      receita: dreTrend.map((t) => t.kpis.find((k) => k.label === 'Receita líquida')?.value ?? 0),
      lucro: dreTrend.map((t) => t.kpis.find((k) => k.label === 'Lucro líquido')?.value ?? 0),
    };

    const withCur = (view, chart) => (chart ? { ...chart, currency: view.currency } : null);
    // Balanço por grupo: montado direto do agrupamento "grupo" do BP (a tela do BP não mostra mais esse gráfico)
    let bpChart = null;
    if (!views.bp.empty) {
      const defBp = Report.getModule('bp');
      const b = defBp.breakdowns.find((x) => x.id === 'grupo');
      const s = await Report.getSummary('bp', scope);
      if (b && s) bpChart = withCur(views.bp, { id: 'grupo', label: 'Balanço por grupo', type: 'bar', ...agg.breakdownSeries(b, s.breakdowns.grupo, defBp) });
    }
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
