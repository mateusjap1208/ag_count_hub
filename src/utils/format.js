/** Formatação no padrão brasileiro: R$ 1.234,56 · US$ 1.234,56 · DD/MM/AAAA */
const num = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Formatadores de moeda por código (BRL, USD, ARS…), criados uma vez
const moneyFmt = new Map();
function money(code = 'BRL', compact = false) {
  const k = `${code}|${compact}`;
  if (!moneyFmt.has(k)) {
    let f;
    try {
      f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code || 'BRL', ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) });
    } catch {
      f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) });
    }
    moneyFmt.set(k, f);
  }
  return moneyFmt.get(k);
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

module.exports = {
  currency: (v, code) => (v == null ? '—' : money(code).format(v)),
  compact: (v, code) => (v == null ? '—' : money(code, true).format(v)),
  number: (v) => (v == null ? '—' : num.format(v)),
  percent: (v) => (v == null || !Number.isFinite(v) ? '—' : pct.format(v)),
  ratio: (v) => (v == null || !Number.isFinite(v) ? '—' : dec.format(v)),
  value(v, format, code) { return format === 'currency' ? this.currency(v, code) : (this[format] || this.number)(v); },
  /** Valor curto para cards de KPI (R$ 83,9 mi); o valor completo vai no detalhe */
  kpi(v, format, code) {
    if (format === 'currency' && v != null && Math.abs(v) >= 1e6) return this.compact(v, code);
    return this.value(v, format, code);
  },
  /** Empresa para listas: só o código ("1000") sem nome cadastrado, ou "1000 · Nome" (com T001) */
  company: (c) => (!c ? '—' : (!c.name || c.name === c.code || c.name === `Empresa ${c.code}` ? c.code : `${c.code} · ${c.name}`)),
  date: (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'),
  dateTime: (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', '') : '—'),
  period: (p) => (p ? `${MONTHS[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}` : '—'),
  periodFull: (p) => (p ? `${MONTHS_FULL[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}` : '—'),
};
