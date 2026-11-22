const Report = require('../models/Report');
const segurosTimeline = require('../services/segurosTimeline');
const pedidosRecepcao = require('../services/pedidosRecepcao');
const imobilizadoMapeamento = require('../services/imobilizadoMapeamento');
const maioresFornecedores = require('../services/maioresFornecedores');
const painelDre = require('../services/painelDre');
const painelPatrimonial = require('../services/painelPatrimonial');
const temasBalanco = require('../services/temasBalanco');
const clientesObra = require('../services/clientesObra');
const { sessionScope } = require('../middlewares/locals');

/**
 * Módulos com moeda por linha (Arrendamento, Imobilizado, Receita): a moeda escolhida precisa
 * existir no módulo; senão usa a mais frequente dele (sem alterar a escolha salva na sessão).
 */
const MAX_COMPARAR = 3;

/**
 * Arrendamento: conta 2115100020 (Fornec. Receção & Conferência Arrendamento), do FAGLL03 de fornecedores.
 * Nela estão as medições lançadas pela obra × a inclusão da parcela de arrendamento paga.
 * Detalhe por Atribuição, só com as atribuições cujo saldo não zera.
 */
const CONTA_ARRENDAMENTO = '2115100020';
async function detalheContaArrendamento(scope) {
  const { scope: s } = await withModuleCurrency('fornecedores', scope);
  const rows = (await Report.getAllRows('fornecedores', s)).filter((r) => String(r.conta) === CONTA_ARRENDAMENTO);
  if (!rows.length) return { conta: CONTA_ARRENDAMENTO, vazio: true, moeda: s.moedaContrato };
  const temAtribuicao = rows.some((r) => r.atribuicao);
  const por = new Map();
  for (const r of rows) {
    const k = r.atribuicao || '(sem atribuição)';
    const o = por.get(k) || por.set(k, { atribuicao: k, montante: 0, lancamentos: 0 }).get(k);
    o.montante += r.valor || 0;
    o.lancamentos += 1;
  }
  const todas = [...por.values()];
  const abertas = todas.filter((o) => Math.abs(o.montante) >= 0.005).sort((a, b) => Math.abs(b.montante) - Math.abs(a.montante));
  return {
    conta: CONTA_ARRENDAMENTO,
    moeda: s.moedaContrato,
    temAtribuicao,
    saldo: rows.reduce((a, r) => a + (r.valor || 0), 0),
    lancamentos: rows.length,
    abertas,
    zeradas: todas.length - abertas.length,
  };
}

async function withModuleCurrency(slug, scope) {
  const def = Report.getModule(slug);
  if (!Report.rowCurrency(def)) return { scope, rowCurrencies: [] };
  const rowCurrencies = await Report.moduleCurrencies(slug, scope.period);
  const ok = rowCurrencies.some((c) => c.code === scope.moedaContrato);
  return { scope: ok ? scope : { ...scope, moedaContrato: rowCurrencies[0]?.code || 'BRL' }, rowCurrencies };
}

exports.show = async (req, res, next) => {
  try {
    const { scope, rowCurrencies } = await withModuleCurrency(req.params.slug, res.locals.scope);
    res.locals.filter = { ...res.locals.filter, moedaContrato: scope.moedaContrato };
    res.locals.rowCurrencies = rowCurrencies;
    // BP/CE comparativo: competências extras escolhidas na tela (guardadas na sessão por módulo; até 3)
    const def = Report.getModule(req.params.slug);
    const disponiveis = (def.tree || def.statementDetail) ? await Report.periods() : [];
    req.session.comparar ||= {};
    if ('comparar' in req.query) {
      const pedidas = [].concat(req.query.comparar).flatMap((p) => String(p).split(','));
      req.session.comparar[def.slug] = [...new Set(pedidas)].filter((p) => disponiveis.includes(p)).slice(0, MAX_COMPARAR);
    }
    const comparar = (req.session.comparar[def.slug] || []).filter((p) => p !== scope.period);
    const view = await Report.getModuleView(req.params.slug, scope, { comparar });
    if (def.slug === 'arrendamento' && !view.empty) view.contaArrendamento = await detalheContaArrendamento(scope).catch(() => null);
    if (def.slug === 'fornecedores' && !view.empty) {
      const linhas = await Report.getAllRows(def.slug, scope);
      view.pedidosRecepcao = await pedidosRecepcao.porPedido(linhas).catch(() => null);
      view.maioresFornecedores = await maioresFornecedores.ranking(linhas, { tipo: 'fornecedor' }).then((r) => ({ ...r, moeda: scope.moedaContrato || 'BRL' })).catch(() => null);
    }
    // Adiantamentos (FGI0, por conta): ranking por fornecedor vem do FAGLL03 de fornecedores
    if (def.slug === 'adiantamentos' && !view.empty) {
      view.maioresFornecedores = await (async () => {
        const { scope: s } = await withModuleCurrency('fornecedores', scope);
        const r = await maioresFornecedores.ranking(await Report.getAllRows('fornecedores', s), { tipo: 'adiantamento' });
        return { ...r, moeda: s.moedaContrato || 'BRL' };
      })().catch(() => null);
    }
    // Clientes: visão de obra (cliente da obra quando a seleção é uma obra só e medições em aberto)
    if (def.slug === 'clientes' && !view.empty) {
      view.clientesObra = await (async () => {
        const linhas = await Report.getAllRows(def.slug, scope);
        const base = clientesObra.montar(linhas, { periodo: scope.period });
        if (!base.obra) return base;
        // Dados do contrato no ZS0003 (Receita POC), se carregado na competência: cliente, faturamento acumulado e término
        const contrato = await (async () => {
          const { scope: s } = await withModuleCurrency('receita-poc', scope);
          const doc = (await Report.getAllRows('receita-poc', s)).filter((r) => r.centroLucro === base.obra);
          if (!doc.length) return null;
          return {
            clientes: doc.map((r) => r.cliente),
            faturamentoAcumulado: doc.reduce((a, r) => a + (r.faturamentoAcumulado || 0), 0),
            fim: doc.map((r) => r.fim).filter(Boolean).sort().pop() || null,
          };
        })().catch(() => null);
        return clientesObra.montar(linhas, { periodo: scope.period, contrato });
      })().catch(() => null);
    }
    if (def.slug === 'imobilizado' && !view.empty) view.imobMapeamento = await imobilizadoMapeamento.classificar(await Report.getAllRows(def.slug, scope)).catch(() => null);
    // DRE: painel do resultado (cards interativos: resultado, composição, evolução mensal e alertas)
    if (def.slug === 'dre' && !view.empty) view.painelDre = await painelDre.montar(scope, { getSummary: Report.getSummary, periods: Report.periods }).catch(() => null);
    // BP e Capital Empregado: painel patrimonial (destaques, composição dos ativos, ponte, evolução e prazos)
    if (['bp', 'capital-empregado'].includes(def.slug) && !view.empty) {
      const deps = { getSummary: Report.getSummary, periods: Report.periods, getModule: Report.getModule };
      [view.painelPatrimonial, view.temasBalanco] = await Promise.all([
        painelPatrimonial.montar(def.slug, scope, deps).catch(() => null),
        // BP: notas explicativas e liquidez (visão contábil) · CE: o que a obra deve e encerramento (visão de obra)
        temasBalanco.montar(def.slug, scope, deps).catch(() => null),
      ]);
    }
    if (def.slug === 'seguros-garantias' && !view.empty) view.contratosSeguro = segurosTimeline.contratos(await Report.getAllRows(def.slug, scope));
    const columns = [
      ...(scope.company === Report.ALL ? [{ key: 'empresa', label: 'Empresa', type: 'string' }] : []),
      ...view.def.columns.map(({ key, label, type, format }) => ({ key, label, type, format })),
    ];
    res.render('modules/show', {
      title: view.def.title,
      slug: view.def.slug,
      view,
      columns,
      currency: view.currency,
      showCurrency: view.def.source === 'fgi0',
      comparacao: { disponiveis: disponiveis.filter((p) => p !== scope.period), escolhidas: comparar, max: MAX_COMPARAR },
      chartData: view.empty ? null : { charts: view.charts, currency: view.currency, dre: view.painelDre || null, patrimonial: view.painelPatrimonial || null, temas: view.temasBalanco || null },
    });
  } catch (e) { next(e); }
};

/** API JSON: linhas paginadas para a tabela */
exports.rows = async (req, res, next) => {
  try {
    const { scope } = await withModuleCurrency(req.params.slug, sessionScope(req));
    if (!scope.period) return res.json({ total: 0, page: 1, pages: 1, rows: [] });
    const data = await Report.getRows(req.params.slug, scope, {
      page: req.query.page,
      size: req.query.size,
      q: String(req.query.q || '').slice(0, 100),
      sort: req.query.sort,
      dir: req.query.dir,
    });
    res.set('Cache-Control', 'private, no-store');
    res.json(data);
  } catch (e) { next(e); }
};

/** Cores do Status Giro (mesma leitura da tela) */
const GIRO_FILL = { 'Saudável': 'FFD6F0E4', 'Atenção': 'FFFFF1D6', 'Baixo Giro': 'FFFFE0C2', 'Obsoleto': 'FFFAD4D6', 'Sem dados': 'FFE9ECF2' };
const GIRO_FONT = { 'Saudável': 'FF00603F', 'Atenção': 'FF8A5200', 'Baixo Giro': 'FFA34A00', 'Obsoleto': 'FF8E1418', 'Sem dados': 'FF4A5568' };

/** Exportação Excel (.xlsx) do detalhamento, respeitando filtros e permissões */
exports.exportXlsx = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { scope } = await withModuleCurrency(req.params.slug, sessionScope(req));
    const def = Report.getModule(req.params.slug);
    const rows = scope.period ? await Report.getAllRows(def.slug, scope) : [];
    const currency = await Report.displayCurrency(def, scope);
    const cols = [{ key: 'empresa', label: 'Empresa', type: 'string' }, ...def.columns];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AG ContHub';
    const ws = wb.addWorksheet(def.menu.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({
      header: c.format === 'currency' ? `${c.label} (${currency})` : c.label,
      key: c.key,
      width: c.type === 'number' ? 18 : c.type === 'date' ? 14 : c.key === 'descricao' ? 42 : 16,
      style: c.type === 'number' ? { numFmt: c.format === 'currency' ? '#,##0.00' : '#,##0.##' } : c.type === 'date' ? { numFmt: 'dd/mm/yyyy' } : {},
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF06172B' } };
    head.alignment = { vertical: 'middle' };
    for (const r of rows) {
      const out = {};
      for (const c of cols) {
        const v = r[c.key];
        out[c.key] = c.type === 'date' && v ? new Date(`${v}T00:00:00Z`) : v;
      }
      const row = ws.addRow(out);
      if (r.statusGiro) {
        const cell = row.getCell('statusGiro');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GIRO_FILL[r.statusGiro] || 'FFFFFFFF' } };
        cell.font = { bold: true, color: { argb: GIRO_FONT[r.statusGiro] || 'FF000000' } };
      }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const filtro = Object.values(scope.rowFilters || {}).filter(Boolean).join('-');
    const name = `${def.slug}_${scope.period || 'sem-periodo'}${filtro ? '_' + filtro.replace(/\s+/g, '-').toLowerCase() : ''}.xlsx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${name.normalize('NFD').replace(/[̀-ͯ]/g, '')}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
};

/** Exportação CSV (separador ";" e vírgula decimal, abre direto no Excel em pt-BR) */
exports.exportCsv = async (req, res, next) => {
  try {
    const { scope } = await withModuleCurrency(req.params.slug, sessionScope(req));
    const def = Report.getModule(req.params.slug);
    const rows = scope.period ? await Report.getAllRows(def.slug, scope) : [];
    const cols = [{ key: 'empresa', label: 'Empresa', type: 'string' }, ...def.columns];
    const cell = (v, type) => {
      if (v == null) return '';
      if (type === 'number') return String(v).replace('.', ',');
      if (type === 'date') return v.split('-').reverse().join('/');
      const s = String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => c.label).join(';'), ...rows.map((r) => cols.map((c) => cell(r[c.key], c.type)).join(';'))];
    const moeda = def.source === 'fgi0' ? `_${String(scope.moeda).replace(':', '-')}` : '';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${def.slug}_${scope.period || 'sem-periodo'}${moeda}.csv"`);
    res.send(`﻿${lines.join('\r\n')}`);
  } catch (e) { next(e); }
};

/** API JSON: busca de conta contábil na DRE (painel do resultado), com o valor mês a mês no ano */
exports.dreContas = async (req, res, next) => {
  try {
    const scope = sessionScope(req);
    const data = await painelDre.buscarContas(scope, String(req.query.q || '').slice(0, 80), { getSummary: Report.getSummary, periods: Report.periods });
    res.set('Cache-Control', 'private, no-store');
    res.json(data);
  } catch (e) { next(e); }
};

/** API JSON: linha do tempo mensal de apropriação de um contrato de Seguros e Garantias */
exports.seguroTimeline = async (req, res, next) => {
  try {
    const { scope } = await withModuleCurrency('seguros-garantias', sessionScope(req));
    if (!scope.period) return res.status(404).json({ error: 'Sem competência carregada.' });
    const empresa = String(req.query.empresa || '');
    const contrato = String(req.query.contrato || '');
    const linhas = (await Report.getAllRows('seguros-garantias', { ...scope, rowFilters: {} }))
      .filter((r) => String(r.contrato) === contrato && (!empresa || String(r.empresa) === empresa));
    const tl = segurosTimeline.linhaDoTempo(linhas, scope.period);
    if (!tl) return res.status(404).json({ error: 'Contrato não encontrado nesta competência.' });
    return res.json({ ...tl, moeda: scope.moedaContrato });
  } catch (e) { return next(e); }
};

/**
 * Relatórios: central de extração dos detalhamentos (relatórios analíticos) de cada tema do menu.
 * Usa os mesmos filtros do topo (competência, empresa, obra, moeda) e as mesmas exportações das telas.
 */
exports.relatorios = async (req, res, next) => {
  try {
    const Telas = require('../config/telas');
    const base = res.locals.scope;
    const itens = [];
    for (const m of Telas.MODULOS_MENU) {
      if (m.inativo || !Telas.podeVer(req.user, m.slug)) continue;
      const abas = m.tabs?.length ? m.tabs : [{ slug: m.slug }];
      for (const t of abas) {
        const def = Report.getModule(t.slug);
        if (def && !def.inativo) itens.push({ m, def, aba: m.tabs?.length ? t.label : null });
      }
    }
    const relatorios = await Promise.all(itens.map(async ({ m, def, aba }) => {
      let linhas = 0;
      let moeda = null;
      if (base.period) {
        const { scope } = await withModuleCurrency(def.slug, base).catch(() => ({ scope: base }));
        linhas = (await Report.getSummary(def.slug, scope).catch(() => null))?.count || 0;
        moeda = await Report.displayCurrency(def, scope).catch(() => null);
      }
      const giro = (def.rowFilters || []).some((f) => f.param === 'giro');
      // Filtros próprios do tema (ex.: Estoque: Propriedade e Status Giro), aplicados também na extração
      const filtros = (def.rowFilters || []).map((f) => ({ param: f.param, label: f.label, options: f.options, atual: base.rowFilters?.[f.param] || '' }));
      return {
        slug: def.slug, tema: m.menu, aba, titulo: def.title, icon: m.icon, filtros,
        colunas: def.columns.length, linhas, moeda,
        excelLabel: giro ? 'Excel (Status Giro)' : 'Excel',
      };
    }));
    res.render('relatorios/index', {
      title: 'Relatórios',
      subtitle: 'Extraia os detalhamentos analíticos de cada tema',
      relatorios,
    });
  } catch (e) { next(e); }
};
