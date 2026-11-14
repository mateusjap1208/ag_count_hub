/**
 * Seguros e Garantias: cada linha do relatório é um prêmio com período de validade
 * ("Linha válida de" → "Linha válida até"). O prêmio é apropriado de forma linear, por dia,
 * dentro desse período ([A CONFIRMAR] critério pró-rata dia).
 * Fluxo mensal: de janeiro do ano da competência até 12 meses depois dela.
 */
const g = (s, key) => (s.breakdowns && s.breakdowns[key]) || {};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const dia = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5);
const diaUTC = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5); // aceita mês fora de 1..12
const chaveMes = (y, m) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

/** Período da linha em dias e valor diário */
function linha(r) {
  const de = dia(r.validoDe);
  const ate = Math.max(de, r.validoAte ? dia(r.validoAte) : de);
  return { de, ate, diario: r.valor / (ate - de + 1) };
}

module.exports = {
  slug: 'seguros-garantias',
  menu: 'Seguros e Garantias',
  title: 'Seguros e Garantias',
  icon: 'shield',
  source: 'generic',
  currencyMode: 'row',
  hasCentro: true,
  rowFilters: [{ param: 'apolice', field: 'situacao', label: 'Situação da apólice', options: ['Vigente', 'A iniciar', 'Encerrada'] }],
  importer: {
    label: 'Seguros e Garantias — apólices e prêmios',
    company: 'empresa',
    currency: 'moeda',
    required: ['empresa', 'contrato', 'validoDe'],
    fields: {
      status: { names: ['status'] },
      empresa: { names: ['empresa'], label: 'Empresa' },
      contrato: { names: ['contrato'], label: 'Contrato' },
      seguradora: { names: ['descr_fluxo_caixa_pn'] },
      inicioVigencia: { names: ['inicio_de_vigencia'], type: 'date' },
      fimVigencia: { names: ['fim_da_validade'], type: 'date' },
      denominacao: { names: ['denominacao_do_contrato'] },
      centroLucro: { names: ['centro_de_lucro'], upper: true },
      moeda: { names: ['moeda_interna'] },
      valor: { names: ['liquido_minterna'], type: 'number', label: 'Líquido MInterna' },
      bruto: { names: ['bruto_moeda_interna'], type: 'number' },
      validoDe: { names: ['linha_valida_de'], type: 'date', label: 'Linha válida de' },
      validoAte: { names: ['linha_valida_ate'], type: 'date', label: 'Linha válida até' },
    },
    derive: (r, ctx) => {
      const [y, m] = ctx.period.split('-').map(Number);
      const ini = diaUTC(y, m, 1);
      const fim = diaUTC(y, m + 1, 0);
      const { de, ate, diario } = linha(r);
      const parte = (a, b) => Math.max(0, Math.min(ate, b) - Math.max(de, a) + 1) * diario;
      const acumulado = parte(-Infinity, fim);
      const aApropriar = r.valor - acumulado;
      const aApropriarCP = parte(fim + 1, diaUTC(y, m + 13, 0));
      const vIni = r.inicioVigencia ? dia(r.inicioVigencia) : de;
      const vFim = r.fimVigencia ? dia(r.fimVigencia) : ate;
      return {
        seguradora: r.seguradora.split(' / ')[0].trim() || 'Não informada',
        apropriadoMes: parte(ini, fim),
        apropriadoAno: parte(diaUTC(y, 1, 1), fim),
        apropriadoAcumulado: acumulado,
        aApropriar,
        aApropriarCP,
        aApropriarLP: aApropriar - aApropriarCP,
        situacao: vIni > fim ? 'A iniciar' : vFim < ini ? 'Encerrada' : 'Vigente',
        _vence90: vFim >= ini && vFim <= fim + 90,
      };
    },
    /** Contagem de apólices (contratos): uma vez por contrato, na primeira linha */
    postProcess: (rows) => {
      const vistos = new Set();
      for (const r of rows) {
        const k = `${r.empresa}|${r.contrato}`;
        const primeira = !vistos.has(k);
        vistos.add(k);
        r.apolices = primeira ? 1 : 0;
        r.apolicesVigentes = primeira && r.situacao === 'Vigente' ? 1 : 0;
        r.vencem90 = primeira && r.situacao === 'Vigente' && r._vence90 ? 1 : 0;
        delete r._vence90;
      }
    },
  },
  sumFields: ['apropriadoAcumulado', 'aApropriarCP', 'aApropriarLP', 'apolices', 'apolicesVigentes', 'vencem90'],
  columns: [
    { key: 'contrato', label: 'Contrato', type: 'string' },
    { key: 'denominacao', label: 'Apólice / garantia', type: 'string' },
    { key: 'seguradora', label: 'Seguradora', type: 'string' },
    { key: 'centroLucro', label: 'Centro de lucro', type: 'string' },
    { key: 'situacao', label: 'Situação', type: 'string' },
    { key: 'inicioVigencia', label: 'Início vigência', type: 'date' },
    { key: 'fimVigencia', label: 'Fim vigência', type: 'date' },
    { key: 'validoDe', label: 'Linha de', type: 'date' },
    { key: 'validoAte', label: 'Linha até', type: 'date' },
    { key: 'valor', label: 'Prêmio da linha', type: 'number', format: 'currency' },
    { key: 'apropriadoMes', label: 'Apropriado no mês', type: 'number', format: 'currency' },
    { key: 'apropriadoAno', label: 'Apropriado no ano', type: 'number', format: 'currency' },
    { key: 'aApropriar', label: 'A apropriar', type: 'number', format: 'currency' },
  ],
  breakdowns: [
    {
      id: 'fluxo', label: 'Fluxo mensal de apropriação', chart: 'bar', sortKeys: true,
      labelFn: (k) => { const [y, m] = k.split('-'); return `${MESES[+m - 1].slice(0, 3).toLowerCase()}/${y.slice(2)}`; },
      // Janela: janeiro do ano da competência até 12 meses depois dela
      spread: (r, period) => {
        const { de, ate, diario } = linha(r);
        const [y, m] = period.split('-').map(Number);
        const out = [];
        for (let i = 1; i <= m + 12; i++) {
          const a = diaUTC(y, i, 1);
          const b = diaUTC(y, i + 1, 0);
          if (b < de) continue;
          if (a > ate) break;
          out.push([chaveMes(y, i), (Math.min(ate, b) - Math.max(de, a) + 1) * diario]);
        }
        return out;
      },
    },
    { id: 'seguradora', label: 'Saldo a apropriar por seguradora', field: 'seguradora', value: 'aApropriar', chart: 'hbar', top: 10 },
    { id: 'centro', label: 'Apropriado no ano por centro de lucro', field: 'centroLucro', value: 'apropriadoAno', chart: 'hbar', top: 10 },
  ],
  /** Fluxo mensal: realizado no ano (até a competência) e a apropriar nos 12 meses seguintes */
  statementFn: (s, scope) => {
    const t = (k) => s.totals?.[k]?.sum ?? 0;
    const fl = g(s, 'fluxo');
    const [y, m] = scope.period.split('-').map(Number);
    const mes = (i) => { const k = chaveMes(y, i); const [yy, mm] = k.split('-'); return { label: `${MESES[+mm - 1]}/${yy}`, value: fl[k] || 0 }; };
    const lines = [{ label: 'Apropriado no ano (realizado)', kind: 'section' }];
    for (let i = 1; i <= m; i++) lines.push(mes(i));
    lines.push({ label: 'Total apropriado no ano', value: t('apropriadoAno'), subtotal: true });
    lines.push({ label: 'A apropriar (despesa antecipada)', kind: 'section' });
    for (let i = m + 1; i <= m + 12; i++) lines.push(mes(i));
    lines.push({ label: 'A apropriar em até 12 meses (circulante)', value: t('aApropriarCP'), subtotal: true });
    lines.push({ label: 'A apropriar após 12 meses (não circulante)', value: t('aApropriarLP') });
    lines.push({ label: 'Saldo a apropriar', value: t('aApropriar'), subtotal: true, highlight: true });
    return lines;
  },
  kpis: (s) => {
    const t = (k) => s.totals?.[k]?.sum ?? 0;
    return [
      { label: 'Apropriado no mês', value: t('apropriadoMes'), format: 'currency' },
      { label: 'Apropriado no ano', value: t('apropriadoAno'), format: 'currency' },
      { label: 'Saldo a apropriar', value: t('aApropriar'), format: 'currency', hint: 'Despesa antecipada' },
      { label: 'A apropriar em 12 meses', value: t('aApropriarCP'), format: 'currency' },
      { label: 'Apólices vigentes', value: t('apolicesVigentes'), format: 'number', hint: `${t('apolices')} apólices na base` },
      { label: 'Vencem em 90 dias', value: t('vencem90'), format: 'number', tone: t('vencem90') > 0 ? 'warn' : undefined },
    ];
  },
};
