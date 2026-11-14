/**
 * Arrendamento (IFRS 16) — cronograma de contratos exportado do SAP (RE-FX):
 * uma linha por contrato × mês, com o Direito de uso (carteira inicial, depreciação, carteira final)
 * e o Passivo de arrendamento (carteira inicial, parcela, juros, carteira final).
 *
 * A importação grava a "fotografia" de uma competência:
 *   - saldos do mês (direito de uso e passivo)
 *   - passivo circulante = passivo do mês − passivo 12 meses depois (pelo próprio cronograma)
 *   - depreciação, juros, parcelas e despesa acumulados no ano até a competência
 */
const { readSheets } = require('./sheetReader');
const { normalizeHeader, parseNumber, parseDate } = require('./txtParser');

class ArrendamentoError extends Error {}

const COLS = {
  contrato: ['contrato_avaliado', 'contrato'],
  regra: ['regra_de_avaliacao'],
  ano: ['ano_civil', 'ano'],
  mes: ['periodo', 'mes'],
  mesAno: ['mes_ano'],
  valorContrato: ['valor_do_contrato'],
  valorPresente: ['valor_atual_liquido'],
  adicoes: ['ativo'],
  ativoInicial: ['carteira_inicial'],
  depreciacao: ['depreciacao'],
  ativoFinal: ['carteira_final'],
  passivoInicial: ['carteira_inicial_1'],
  parcela: ['compensacao_parcela', 'parcela'],
  juros: ['juros'],
  passivoFinal: ['carteira_final_2'],
  modificacao: ['modificacao_retroativa'],
  despesa: ['despesa_rendimento_leasing'],
  moeda: ['moeda'],
  taxa: ['taxa_de_juros'],
  objetoBalanco: ['objeto_de_balanco'],
  objetoAvaliacao: ['objeto_de_avaliacao'],
  empresa: ['empresa'],
  centroLucro: ['centro_de_lucro'],
  denominacao: ['denominacao_do_contrato'],
  contratoAntigo: ['contrato_antigo'],
  inicio: ['inicio_de_vigencia'],
  fim: ['fim_da_validade'],
  tipo: ['denom_tipo_contrato', 'tipo_contrato'],
  imobilizado: ['imobilizado'],
};
const REQUIRED = ['contrato', 'empresa', 'ativoFinal', 'passivoFinal'];
const NUMERIC = ['valorContrato', 'valorPresente', 'adicoes', 'ativoInicial', 'depreciacao', 'ativoFinal', 'passivoInicial',
  'parcela', 'juros', 'passivoFinal', 'modificacao', 'despesa', 'taxa'];

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (typeof v === 'number' ? v : (parseNumber(v) ?? 0)) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

/** Data do Excel (número serial) ou texto → AAAA-MM-DD; 31/12/9999 = sem fim definido */
function toDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v > 2900000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = str(v);
  if (/^9999/.test(s) || /31[./-]12[./-]9999/.test(s)) return null;
  return parseDate(s) || null;
}

/** Competência AAAA-MM da linha (Ano civil + Período, ou Mês/Ano) */
function monthOf(r, map) {
  const ano = Number(r[map.ano]);
  const mes = Number(r[map.mes]);
  if (ano > 1900 && mes >= 1 && mes <= 12) return `${ano}-${String(mes).padStart(2, '0')}`;
  const d = toDate(r[map.mesAno]);
  return d ? d.slice(0, 7) : null;
}

/** Soma os campos numéricos de duas linhas do mesmo cronograma e mês */
function mergeRows(a, b, map) {
  const out = [...a];
  for (const k of NUMERIC) if (k in map && k !== 'taxa') out[map[k]] = num(a[map[k]]) + num(b[map[k]]);
  return out;
}

const addMonths = (p, n) => {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

async function read(buffer, fileName) {
  const sheets = await readSheets(buffer, fileName);
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 15); h++) {
      // "RECEISASSETCN.Empresa" → "empresa"
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(str(c)).replace(/^receisassetcn_/, ''));
      const map = {};
      for (const [k, names] of Object.entries(COLS)) {
        const i = header.findIndex((x) => names.includes(x));
        if (i >= 0) map[k] = i;
      }
      if (!REQUIRED.every((k) => k in map) || (!('ano' in map && 'mes' in map) && !('mesAno' in map))) continue;
      return { sheet, header: h, map };
    }
  }
  throw new ArrendamentoError('Layout não reconhecido. Colunas esperadas: Contrato avaliado, Ano civil, Período, Carteira inicial/final (direito de uso), Carteira inicial_1/final_2 (passivo), Empresa, Centro de lucro…');
}

/**
 * Lê a planilha e monta as linhas da competência.
 * @returns {{ period, months: {min,max}, byCompany: Map, stats }}
 */
async function buildSnapshot(buffer, fileName, periodIn) {
  const { sheet, header, map } = await read(buffer, fileName);

  // Agrupa o cronograma por contrato (contrato + regra de avaliação)
  const contracts = new Map();
  let dupMonth = 0;
  let minMonth = '9999-99';
  let maxMonth = '0000-00';
  for (let i = header + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    if (!r || !str(r[map.contrato])) continue;
    const month = monthOf(r, map);
    if (!month) continue;
    if (month < minMonth) minMonth = month;
    if (month > maxMonth) maxMonth = month;
    // Um contrato pode ter vários objetos de avaliação, cada um com o seu cronograma
    const key = `${str(r[map.contrato])}|${str(r[map.regra])}|${str(r[map.objetoAvaliacao])}|${str(r[map.objetoBalanco])}`;
    let c = contracts.get(key);
    if (!c) { c = { months: new Map(), row: r }; contracts.set(key, c); }
    if (c.months.has(month)) dupMonth++; // mesma chave repetida no mês: soma os valores
    c.months.set(month, c.months.has(month) ? mergeRows(c.months.get(month), r, map) : r);
  }
  if (!contracts.size) throw new ArrendamentoError('Nenhuma linha de contrato encontrada.');

  // Competência: a informada, ou o último mês fechado (mês anterior ao atual) presente no arquivo
  let period = periodIn;
  if (!period) {
    const now = new Date();
    const lastClosed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    period = lastClosed < minMonth ? minMonth : (lastClosed > maxMonth ? maxMonth : lastClosed);
  }
  if (period < minMonth || period > maxMonth) {
    throw new ArrendamentoError(`A competência ${period} não está no arquivo (meses de ${minMonth} a ${maxMonth}).`);
  }
  const ano = period.slice(0, 4);
  const p12 = addMonths(period, 12);

  const byCompany = new Map();
  const currencies = new Map();
  let contratos = 0;
  const contratosSet = new Set();
  for (const [key, c] of contracts) {
    const r = c.months.get(period);
    if (!r) continue; // contrato sem movimento na competência (encerrado ou ainda não iniciado)
    const v = Object.fromEntries(NUMERIC.filter((k) => k in map).map((k) => [k, num(r[map[k]])]));
    // Passivo circulante: parte do passivo que será amortizada nos próximos 12 meses
    const fut = c.months.get(p12);
    const passivoFut = fut ? num(fut[map.passivoFinal]) : 0;
    const passivoCP = round2(Math.max(0, Math.min(v.passivoFinal, v.passivoFinal - passivoFut)));
    // Acumulados no ano até a competência
    let depAno = 0; let jurosAno = 0; let parcelasAno = 0; let despesaAno = 0;
    for (const [m, x] of c.months) {
      if (m.slice(0, 4) !== ano || m > period) continue;
      depAno += num(x[map.depreciacao]); jurosAno += num(x[map.juros]);
      parcelasAno += num(x[map.parcela]); despesaAno += num(x[map.despesa]);
    }
    const empresa = str(r[map.empresa]);
    const moeda = str(r[map.moeda]) || 'BRL';
    const fim = toDate(r[map.fim]);
    const row = {
      contrato: str(r[map.contrato]),
      regra: str(r[map.regra]),
      denominacao: str(r[map.denominacao]),
      contratoAntigo: str(r[map.contratoAntigo]),
      tipo: str(r[map.tipo]).replace(/^IFRS16\s*[–-]\s*/i, '') || 'Não informado',
      centroLucro: str(r[map.centroLucro]).split('/').pop().toUpperCase(),
      imobilizado: str(r[map.imobilizado]),
      moeda,
      taxa: v.taxa || null,
      inicio: toDate(r[map.inicio]),
      fim,
      anoFim: fim ? fim.slice(0, 4) : 'Indeterminado',
      ativoInicial: round2(v.ativoInicial || 0),
      adicoes: round2(v.adicoes || 0),
      depreciacao: round2(v.depreciacao || 0),
      ativoFinal: round2(v.ativoFinal || 0),
      passivoInicial: round2(v.passivoInicial || 0),
      parcela: round2(v.parcela || 0),
      juros: round2(v.juros || 0),
      passivoFinal: round2(v.passivoFinal || 0),
      passivoCP,
      passivoLP: round2(v.passivoFinal - passivoCP),
      modificacao: round2(v.modificacao || 0),
      despesa: round2(v.despesa || 0),
      depAno: round2(depAno), jurosAno: round2(jurosAno), parcelasAno: round2(parcelasAno), despesaAno: round2(despesaAno),
    };
    let comp = byCompany.get(empresa);
    if (!comp) { comp = { rows: [], moedas: new Map() }; byCompany.set(empresa, comp); }
    comp.rows.push(row);
    comp.moedas.set(moeda, (comp.moedas.get(moeda) || 0) + 1);
    currencies.set(moeda, (currencies.get(moeda) || 0) + 1);
    contratos++;
    contratosSet.add(row.contrato);
    void key;
  }
  if (!contratos) throw new ArrendamentoError(`Nenhum contrato com movimento em ${period}.`);
  return {
    period,
    months: { min: minMonth, max: maxMonth },
    byCompany,
    stats: {
      linhas: contratos, contratos: contratosSet.size,
      contratosArquivo: new Set([...contracts.keys()].map((k) => k.split('|')[0])).size,
      empresas: byCompany.size, moedas: [...currencies].sort((a, b) => b[1] - a[1]), repetidas: dupMonth,
    },
  };
}

module.exports = { buildSnapshot, ArrendamentoError };
