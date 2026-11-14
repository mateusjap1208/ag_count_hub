/**
 * Competência (AAAA-MM) a partir do nome do arquivo. Formatos aceitos:
 *   31.10.2026 · 10.2026 · 10-2026 · 10_2026 · 2026-10 · 2026.10 · 102026 (após "_" ou espaço)
 * Ex.: "FGI0 - Moeda da empresa 31.10.2026.XLSX", "ARRENDAMENTO_10.2026.xlsx", "ZL0190 - ESTOQUE_10.2026.XLSX"
 */
const valid = (y, m) => {
  const yy = Number(y); const mm = Number(m);
  return yy >= 2000 && yy <= 2100 && mm >= 1 && mm <= 12 ? `${yy}-${String(mm).padStart(2, '0')}` : null;
};

function periodFromName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, ''); // sem extensão
  let m = base.match(/(?:^|\D)(\d{2})[.\-_/](\d{2})[.\-_/](\d{4})(?:\D|$)/); // dd.mm.aaaa
  if (m && valid(m[3], m[2])) return valid(m[3], m[2]);
  m = base.match(/(?:^|\D)(\d{1,2})[.\-_/](\d{4})(?:\D|$)/); // mm.aaaa
  if (m && valid(m[2], m[1])) return valid(m[2], m[1]);
  m = base.match(/(?:^|\D)(\d{4})[.\-_/](\d{2})(?:\D|$)/); // aaaa-mm
  if (m && valid(m[1], m[2])) return valid(m[1], m[2]);
  m = base.match(/(?:^|[_\s-])(\d{2})(\d{4})(?:\D|$)/); // mmaaaa
  if (m && valid(m[2], m[1])) return valid(m[2], m[1]);
  return null;
}

class CompetenciaError extends Error {}

/**
 * Define a competência da carga: a do nome do arquivo (preferencial) ou a informada na tela.
 * Se as duas existirem e forem diferentes, recusa para evitar gravar na competência errada.
 */
function resolvePeriod(fileName, informed) {
  const fromName = periodFromName(fileName);
  const fromForm = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(informed || '')) ? informed : null;
  if (fromName && fromForm && fromName !== fromForm) {
    throw new CompetenciaError(`A competência do nome do arquivo (${fmt(fromName)}) é diferente da informada na tela (${fmt(fromForm)}). Corrija o nome do arquivo ou o campo Competência.`);
  }
  const period = fromName || fromForm;
  if (!period) {
    throw new CompetenciaError('O nome do arquivo precisa ter a competência (ex.: "_10.2026" ou "31.10.2026"). Renomeie o arquivo ou informe a competência na tela.');
  }
  return { period, source: fromName ? 'arquivo' : 'tela' };
}
const fmt = (p) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;

module.exports = { periodFromName, resolvePeriod, CompetenciaError };
