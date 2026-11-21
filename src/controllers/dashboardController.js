const Report = require('../models/Report');
const Telas = require('../config/telas');
const apresentacaoSvc = require('../services/apresentacao');
const novidadesSvc = require('../services/novidades');

/** Palavras-chave de cada tela para a busca rápida da Visão Geral (sem acento) */
const PALAVRAS = {
  bp: 'balanco patrimonial ativo passivo caixa liquidez notas explicativas folha tributos impostos fornecedores patrimonio',
  dre: 'dre demonstracao resultado receita custo despesa lucro margem pareto simulador ponte alertas',
  'capital-empregado': 'capital empregado capital de giro liquidacao obrigacoes prazos ciclo financeiro',
  clientes: 'clientes contas a receber aging cobranca',
  adiantamentos: 'adiantamentos fornecedores funcionarios',
  estoque: 'estoque material almoxarifado giro obsoleto deposito',
  'seguros-garantias': 'seguros garantias apolices premio',
  imobilizado: 'imobilizado bens depreciacao equipamentos veiculos',
  fornecedores: 'fornecedores contas a pagar aging pedidos compras',
  'receita-poc': 'receita poc medicao avanco backlog faturamento obra contrato',
  arrendamento: 'arrendamento ifrs 16 contratos direito de uso aluguel',
};


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
      { module: 'bp', serie: ['Ativo total'], ...kpi(views.bp, 'Ativo total'), ajuda: 'Soma do ativo circulante e não circulante do Balanço Patrimonial, gerado do FGI0 (saldos contábeis) da competência.' },
      { module: 'bp', serie: ['Passivo total', 'Patrimônio líquido'], ...passivoPl, ajuda: 'Passivo total + patrimônio líquido do Balanço. Deve fechar com o ativo total; o PL já inclui o resultado do exercício.' },
      { module: 'dre', serie: ['Receita líquida'], ...kpi(views.dre, 'Receita líquida'), ajuda: 'Receita bruta menos as deduções (impostos sobre a receita) da DRE, acumulada de janeiro até a competência.' },
      { module: 'dre', serie: ['Lucro líquido'], ...kpi(views.dre, 'Lucro líquido'), ajuda: 'Resultado final da DRE de janeiro até a competência: receita líquida − custos − despesas ± resultado financeiro − IR e CSLL.' },
      { module: 'capital-empregado', serie: ['Capital empregado'], ...kpi(views['capital-empregado'], 'Capital empregado'), ajuda: 'Ativos operacionais + passivos operacionais da estrutura gerencial (QV Capital Empregado), com as contas ligadas pelo Mapeamento de Contas.' },
      { module: 'estoque', serie: ['Estoque próprio'], ...estoque, label: 'Valor em estoque', ajuda: 'Valor do estoque próprio no relatório ZL0190 da competência. O estoque de terceiros fica de fora, porque não pertence à empresa.' },
      { module: 'arrendamento', ...arrendamento },
      { module: 'adiantamentos', serie: ['Total de adiantamentos'], ...kpi(views.adiantamentos, 'Total de adiantamentos'), ajuda: 'Saldo no Balanço das contas de adiantamento a fornecedores, subempreiteiros e funcionários (classificação N4 do Plano de Contas).' },
      { module: 'seguros-garantias', serie: ['Saldo a apropriar'], ...kpi(views['seguros-garantias'], 'Saldo a apropriar'), label: 'Seguros a apropriar', ajuda: 'Prêmios de seguros e garantias já pagos que ainda vão para o resultado nos próximos meses (despesa antecipada).' },
      { module: 'imobilizado', serie: ['Valor contábil'], ...kpi(views.imobilizado, 'Valor contábil'), label: 'Imobilizado (valor contábil)', ajuda: 'Custo de aquisição dos bens menos a depreciação acumulada, pelo quadro do imobilizado (AR02).' },
    ].filter((h) => h.value !== undefined);

    // Carrossel de destaques: tendência das últimas competências (Report.trend) e variação contra a anterior.
    // Passivo de arrendamento pelas contas do BP não tem série própria (fica só com o valor atual).
    const modulosSerie = [...new Set(highlights.filter((h) => h.serie && pode(h.module)).map((h) => h.module))];
    const trends = Object.fromEntries(await Promise.all(modulosSerie.map(async (m) => [m, await Report.trend(m, scope, 6).catch(() => [])])));
    for (const h of highlights) {
      const t = h.serie ? trends[h.module] || [] : [];
      const pontos = t.map((x) => {
        const vs = h.serie.map((lbl) => x.kpis.find((k) => k.label === lbl)?.value);
        return vs.every((v) => typeof v === 'number') ? vs.reduce((a, v) => a + v, 0) : null;
      }).filter((v) => v != null);
      h.pontos = pontos.length > 1 ? pontos : null;
      h.variacao = pontos.length > 1 ? pontos[pontos.length - 1] - pontos[pontos.length - 2] : null;
      delete h.serie;
    }

    // Checklist do fechamento: relatórios da competência carregados (moeda do filtro) e pendências contábeis
    const uploads = scope.period ? await Report.listUploads({ period: scope.period }) : [];
    const ct = String(scope.moeda).split(':')[0];
    const relatorios = Report.modules.filter((m) => !m.inativo && !m.hideInMenu && pode(m.slug)).map((m) => {
      const list = uploads.filter((u) => u.module === m.slug && (m.source !== 'fgi0' || u.currencyType === ct));
      return { slug: m.slug, nome: m.menu, icon: m.icon, feito: list.length > 0, empresas: list.length };
    });

    // Última carga do FGI0 da competência (para o feed)
    const fgi0 = uploads.filter((u) => u.source === 'fgi0').sort((x, y) => String(y.uploadedAt).localeCompare(String(x.uploadedAt)))[0];
    const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
    const ultimaCarga = fgi0 ? `FGI0 de ${res.locals.fmt.periodFull(scope.period).toLowerCase()} carregado em ${fmtData(fgi0.uploadedAt)}${fgi0.uploadedBy ? ` por ${fgi0.uploadedBy}` : ''}` : null;
    const novidade = novidadesSvc.historico()[0]?.titulo || null;

    // Apresentação do mês em "stories" + posts do feed (mesmos dados)
    const apresentacao = await apresentacaoSvc.montar({
      scope,
      deps: { getSummary: Report.getSummary, periods: Report.periods, getModule: Report.getModule },
      pode,
      subtitulo: res.locals.companyName || '',
      telas: Telas.MODULOS_MENU.filter((m) => !m.inativo && pode(m.slug)).map((m) => ({ slug: m.slug, nome: m.menu, icon: m.icon })),
      extras: { ultimaCarga, novidade },
    }).catch(() => null);

    const pendencias = (apresentacao?.alertas || []).map((a) => ({ nome: a.titulo, detalhe: `${a.quantidade} ${a.quantidade === 1 ? 'conta' : 'contas'}`, link: '/modulos/dre' }));

    // Busca rápida: telas liberadas com palavras-chave; as contas contábeis vêm da API da DRE
    const telasBusca = [
      ...Telas.MODULOS_MENU.filter((m) => !m.inativo && pode(m.slug)).map((m) => ({ nome: m.menu, url: `/modulos/${m.slug}`, icon: m.icon, palavras: PALAVRAS[m.slug] || '' })),
      ...(Telas.podeVer(req.user, 'indicadores') ? [{ nome: 'Indicadores', url: '/indicadores', icon: 'gauge', palavras: 'indicadores velocimetro metas' }] : []),
      ...(Telas.podeVer(req.user, 'relatorios') ? [{ nome: 'Relatórios', url: '/relatorios', icon: 'download', palavras: 'relatorios extrair exportar excel csv detalhamento analitico' }] : []),
      { nome: 'Novidades', url: '/novidades', icon: 'sparkle', palavras: 'novidades versao atualizacao o que mudou' },
    ];

    res.render('dashboard/index', {
      title: 'Visão Geral',
      apresentacao: apresentacao?.slides ? apresentacao : null,
      posts: apresentacao?.posts || [],
      apresentacaoMoeda: views.dre.currency || views.bp.currency || 'BRL',
      highlights,
      checklist: { relatorios, pendencias, periodo: scope.period },
      chartData: { busca: { telas: telasBusca, contas: pode('dre') } },
    });
  } catch (e) { next(e); }
};
