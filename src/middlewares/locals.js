/**
 * Disponibiliza para as views: usuário, menu, filtros e suas opções.
 * Filtros em cascata (salvos na sessão): Estrutura → Sigla → Empresa → Centro de lucro,
 * além de Competência e Moeda. Cada filtro limita as opções do seguinte.
 */
const Report = require('../models/Report');
const Company = require('../models/Company');
const fmt = require('../utils/format');

async function viewLocals(req, res, next) {
  try {
    const [allCompanies, periods] = await Promise.all([Company.list(), Report.periods()]);
    const perm = req.permission || { allowed: null, key: '' };
    const f = (req.session.filter ||= {});
    const q = req.query;
    // Parâmetro presente (mesmo vazio) atualiza o filtro: permite "limpar"
    for (const [param, key] of [['empresa', 'empresa'], ['periodo', 'periodo'], ['moeda', 'moeda'], ['estrutura', 'estrutura'], ['sigla', 'sigla'], ['centro', 'centro'], ['moedaContrato', 'moedaContrato']]) {
      if (param in q) f[key] = String(q[param]).slice(0, 80);
    }
    if (!f.periodo || !periods.includes(f.periodo)) f.periodo = periods[0] || null;
    // Filtros de linha próprios de módulos (ex.: ?giro=Obsoleto no Estoque)
    f.rowFilters ||= {};
    for (const rf of Report.modules.flatMap((m) => m.rowFilters || [])) {
      if (rf.param in q) f.rowFilters[rf.param] = rf.options.includes(String(q[rf.param])) ? String(q[rf.param]) : '';
    }

    const currencyOptions = await Report.currencyOptions(f.periodo);
    if (!currencyOptions.some((o) => o.value === f.moeda)) f.moeda = currencyOptions[0]?.value || 'grupo';
    // Arrendamento: moeda do contrato (BRL, EUR, COP…), escolhida na própria tela
    // (cada tela confere se a moeda existe no seu módulo; ver moduleController.withModuleCurrency)
    const leaseCurrencies = await Report.leaseCurrencies(f.periodo);
    if (!/^[A-Z]{3}$/.test(String(f.moedaContrato || ''))) f.moedaContrato = 'BRL';

    // Cascata: valida cada nível com as opções geradas pelo nível anterior
    let opts = await Report.filterOptions({ allowed: perm.allowed, period: f.periodo, moeda: f.moeda, estrutura: f.estrutura });
    if (!opts.estruturas.includes(f.estrutura)) f.estrutura = '';
    opts = await Report.filterOptions({ allowed: perm.allowed, period: f.periodo, moeda: f.moeda, estrutura: f.estrutura, sigla: f.sigla });
    if (!opts.siglas.includes(f.sigla)) f.sigla = '';
    opts = await Report.filterOptions({ allowed: perm.allowed, period: f.periodo, moeda: f.moeda, estrutura: f.estrutura, sigla: f.sigla });
    const companies = opts.companies ? allCompanies.filter((c) => opts.companies.includes(c.code)) : allCompanies;
    if (!f.empresa || (f.empresa !== Report.ALL && !companies.some((c) => c.code === f.empresa))) f.empresa = Report.ALL;
    opts = await Report.filterOptions({ allowed: perm.allowed, period: f.periodo, moeda: f.moeda, estrutura: f.estrutura, sigla: f.sigla, company: f.empresa });
    if (f.centro && !opts.centros.some((c) => c.code === f.centro)) f.centro = '';

    const companyObj = allCompanies.find((c) => c.code === f.empresa);
    const parts = [];
    if (f.estrutura) parts.push(f.estrutura);
    if (f.sigla) parts.push(`Sigla ${f.sigla}`);
    parts.push(f.empresa === Report.ALL ? (perm.allowed ? 'Empresas liberadas' : (f.estrutura || f.sigla ? 'Todas as empresas' : 'Consolidado do grupo')) : fmt.company(companyObj));
    if (f.centro) parts.push(`Centro ${f.centro}`);

    Object.assign(res.locals, {
      user: req.session.user,
      menu: Report.modules,
      companies,
      allCompanies,
      periods,
      currencyOptions,
      leaseCurrencies,
      filterOpts: opts,
      filter: { ...f },
      restricted: !!perm.allowed,
      hasObraFilter: !!(f.estrutura || f.sigla || f.centro || f.empresa !== Report.ALL),
      scope: { period: f.periodo, company: f.empresa, moeda: f.moeda, estrutura: f.estrutura, sigla: f.sigla, centro: f.centro, moedaContrato: f.moedaContrato, rowFilters: { ...(f.rowFilters || {}) }, allowed: perm.allowed, allowedKey: perm.key },
      companyName: parts.join(' · '),
      currentPath: req.path,
      fmt,
    });
    next();
  } catch (e) { next(e); }
}

/** Escopo do filtro salvo na sessão (rotas de API, sem renderização) */
function sessionScope(req) {
  const f = req.session.filter || {};
  return {
    period: f.periodo, company: f.empresa || Report.ALL, moeda: f.moeda || 'grupo',
    estrutura: f.estrutura || '', sigla: f.sigla || '', centro: f.centro || '', moedaContrato: f.moedaContrato || 'BRL',
    rowFilters: { ...(f.rowFilters || {}) },
    allowed: req.permission?.allowed || null, allowedKey: req.permission?.key || '',
  };
}

module.exports = { viewLocals, sessionScope };
