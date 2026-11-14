/**
 * Seguros e Garantias: linha do tempo de apropriação por contrato (apólice).
 * Cada linha do contrato é um prêmio apropriado por dia entre "linha válida de" e "linha válida até";
 * aqui somamos, mês a mês, o que cada linha apropria — do primeiro ao último mês do contrato.
 */
const dia = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5);
const diaUTC = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
const chave = (y, m) => { const d = new Date(Date.UTC(y, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const r2 = (n) => Math.round(n * 100) / 100;

/** Contratos da tela (para escolher na linha do tempo): os que ainda têm saldo ou apropriaram no ano */
function contratos(rows) {
  const por = new Map();
  for (const r of rows) {
    const k = `${r.empresa}|${r.contrato}`;
    const c = por.get(k) || por.set(k, {
      empresa: r.empresa, contrato: r.contrato, denominacao: r.denominacao, seguradora: r.seguradora,
      situacao: r.situacao, inicio: r.inicioVigencia, fim: r.fimVigencia, aApropriar: 0, apropriadoAno: 0, premio: 0,
    }).get(k);
    c.aApropriar += r.aApropriar || 0;
    c.apropriadoAno += r.apropriadoAno || 0;
    c.premio += r.valor || 0;
  }
  return [...por.values()]
    .filter((c) => Math.abs(c.aApropriar) >= 0.005 || Math.abs(c.apropriadoAno) >= 0.005)
    .sort((a, b) => Math.abs(b.aApropriar) - Math.abs(a.aApropriar) || Math.abs(b.apropriadoAno) - Math.abs(a.apropriadoAno));
}

/** Série mensal de um contrato: apropriado no mês, acumulado, saldo a apropriar e % apropriado */
function linhaDoTempo(linhas, period) {
  if (!linhas.length) return null;
  const partes = linhas.map((r) => {
    const de = dia(r.validoDe);
    const ate = Math.max(de, r.validoAte ? dia(r.validoAte) : de);
    return { de, ate, diario: (r.valor || 0) / (ate - de + 1), valor: r.valor || 0 };
  });
  const premio = partes.reduce((a, p) => a + p.valor, 0);
  const primeiro = new Date(Math.min(...partes.map((p) => p.de)) * 864e5);
  const ultimo = new Date(Math.max(...partes.map((p) => p.ate)) * 864e5);
  let y = primeiro.getUTCFullYear(); let m = primeiro.getUTCMonth() + 1;
  const fimY = ultimo.getUTCFullYear(); const fimM = ultimo.getUTCMonth() + 1;
  const meses = [];
  let acumulado = 0;
  while (y < fimY || (y === fimY && m <= fimM)) {
    const a = diaUTC(y, m, 1); const b = diaUTC(y, m + 1, 0);
    const mes = partes.reduce((s, p) => s + Math.max(0, Math.min(p.ate, b) - Math.max(p.de, a) + 1) * p.diario, 0);
    acumulado += mes;
    const k = chave(y, m);
    meses.push({
      mes: k, apropriado: r2(mes), acumulado: r2(acumulado), saldo: r2(premio - acumulado),
      pct: premio ? Math.round((acumulado / premio) * 1000) / 10 : 0,
      fase: k < period ? 'realizado' : k === period ? 'atual' : 'futuro',
    });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  const atual = meses.find((x) => x.mes === period) || [...meses].reverse().find((x) => x.mes < period) || null;
  const r0 = linhas[0];
  return {
    empresa: r0.empresa, contrato: r0.contrato, denominacao: r0.denominacao, seguradora: r0.seguradora, centroLucro: r0.centroLucro,
    situacao: r0.situacao, inicio: r0.inicioVigencia, fim: r0.fimVigencia, linhas: linhas.length,
    premio: r2(premio), meses, competencia: period,
    acumuladoAteCompetencia: atual ? atual.acumulado : 0,
    pctAteCompetencia: atual ? atual.pct : 0,
  };
}

module.exports = { contratos, linhaDoTempo };
