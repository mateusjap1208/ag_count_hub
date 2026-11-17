/**
 * Disponibiliza para as views: usuário, menu, filtros e suas opções.
 * Filtros em cascata (salvos na sessão): Estrutura → Sigla → Empresa → Centro de lucro,
 * além de Competência e Moeda. Cada filtro limita as opções do seguinte.
 * Estrutura, sigla, empresa e centro de lucro aceitam seleção múltipla (listas).
 */
const Report = require('../models/Report');
const Telas = require('../config/telas');
const Company = require('../models/Company');
const fmt = require('../utils/format');
const novidades = require('../services/novidades');
const Mensagem = require('../models/Mensagem');
const pendencias = require('../services/pendencias');

const MULTI = ['estrutura', 'sigla', 'empresa', 'centro'];
/** Lista de valores de um filtro (aceita ?x=a&x=b, texto único ou valor antigo da sessão) */
const lista = (v) => [...new Set([].concat(v ?? []).map((x) => String(x).trim().slice(0, 80)).filter((x) => x && x !== Report.ALL))].slice(0, 300);

/** Escopo a partir do filtro: uma empresa → "company"; várias → "empresas" (com company = todas) */
function scopeDe(f, perm) {
  const empresas = lista(f.empresa);
  return {
    period: f.periodo,
    company: empresas.length === 1 ? empresas[0] : Report.ALL,
    empresas: empresas.length > 1 ? empresas : [],
    moeda: f.moeda || 'grupo',
    estrutura: lista(f.estrutura), sigla: lista(f.sigla), centro: lista(f.centro),
    moedaContrato: f.moedaContrato || 'BRL',
    rowFilters: { ...(f.rowFilters || {}) },
    allowed: perm?.allowed || null, allowedKey: perm?.key || '',
  };
}

async function viewLocals(req, res, next) {
  try {
    const [allCompanies, periods] = await Promise.all([Company.list(), Report.periods()]);
    const perm = req.permission || { allowed: null, key: '' };
    const f = (req.session.filter ||= {});
    const q = req.query;
    // Parâmetro presente (mesmo vazio) atualiza o filtro: permite "limpar"
    for (const key of MULTI) if (key in q) f[key] = lista(q[key]);
    for (const key of ['periodo', 'moeda', 'moedaContrato']) if (key in q) f[key] = String(q[key]).slice(0, 80);
    for (const key of MULTI) f[key] = lista(f[key]); // sessões antigas guardavam texto
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

    // Cascata: cada nível mantém só os itens válidos para as escolhas do nível anterior
    const base = { allowed: perm.allowed, period: f.periodo, moeda: f.moeda };
    let opts = await Report.filterOptions(base);
    f.estrutura = f.estrutura.filter((x) => opts.estruturas.includes(x));
    opts = await Report.filterOptions({ ...base, estrutura: f.estrutura });
    f.sigla = f.sigla.filter((x) => opts.siglas.includes(x));
    opts = await Report.filterOptions({ ...base, estrutura: f.estrutura, sigla: f.sigla });
    const companies = opts.companies ? allCompanies.filter((c) => opts.companies.includes(c.code)) : allCompanies;
    f.empresa = f.empresa.filter((x) => companies.some((c) => c.code === x));
    opts = await Report.filterOptions({ ...base, estrutura: f.estrutura, sigla: f.sigla, empresas: f.empresa });
    f.centro = f.centro.filter((x) => opts.centros.some((c) => c.code === x));

    // Resumo do que está filtrado (subtítulo das telas)
    const resumo = (itens, um, varios) => (itens.length === 1 ? um(itens[0]) : `${itens.length} ${varios}`);
    const parts = [];
    if (f.estrutura.length) parts.push(resumo(f.estrutura, (x) => x, 'estruturas'));
    if (f.sigla.length) parts.push(resumo(f.sigla, (x) => `Sigla ${x}`, 'siglas'));
    if (f.empresa.length) parts.push(resumo(f.empresa, (x) => fmt.company(allCompanies.find((c) => c.code === x)), 'empresas'));
    else parts.push(perm.allowed ? 'Empresas liberadas' : (f.estrutura.length || f.sigla.length ? 'Todas as empresas' : 'Consolidado do grupo'));
    if (f.centro.length) parts.push(resumo(f.centro, (x) => `Centro ${x}`, 'centros de lucro'));

    Object.assign(res.locals, {
      user: req.session.user,
      coresVersao: req.user?.cores ? require('../config/cores').versao(req.user.cores) : null, // CSS das cores personalizadas
      menu: Report.modules,
      podeVer: (tela) => Telas.podeVer(req.user, tela), // telas liberadas ao usuário
      menuModulos: Telas.MODULOS_MENU,
      companies,
      allCompanies,
      periods,
      currencyOptions,
      leaseCurrencies,
      filterOpts: opts,
      filter: { ...f },
      restricted: !!perm.allowed,
      hasObraFilter: !!(f.estrutura.length || f.sigla.length || f.centro.length || f.empresa.length),
      scope: scopeDe(f, perm),
      companyName: parts.join(' · '),
      currentPath: req.path,
      fmt,
      novidades: novidades.paraUsuario(req.user),
      mensagensRodape: await Mensagem.ativas().catch(() => []),
      // Selo de pendências no topo (administradores): valor em cache, calculado em segundo plano
      pendencias: req.session.user?.role === 'admin' && f.periodo ? pendencias.resumoRapido(f.periodo) : null,
    });
    next();
  } catch (e) { next(e); }
}

/** Escopo do filtro salvo na sessão (rotas de API, sem renderização) */
function sessionScope(req) {
  const f = { ...(req.session.filter || {}) };
  for (const key of MULTI) f[key] = lista(f[key]);
  return scopeDe(f, req.permission);
}

module.exports = { viewLocals, sessionScope };
