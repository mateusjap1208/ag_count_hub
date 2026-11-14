/**
 * ZL0190 — Posição de estoque (SAP): uma linha por centro (planta) × depósito × material.
 * Valores em moeda interna da empresa (MI) e na moeda do grupo (M2, USD).
 * Gera, por empresa, duas cargas: moeda do grupo (valores M2) e moeda da empresa (valores MI),
 * no mesmo esquema de moedas do FGI0.
 */
const { readSheets } = require('./sheetReader');
const { normalizeHeader, parseNumber } = require('./txtParser');
const Parameter = require('../models/Parameter');

class EstoqueError extends Error {}

const COLS = {
  centro: ['centro'],
  deposito: ['deposito'],
  tipoMaterial: ['tipo_de_material'],
  grupoMercadorias: ['grupo_de_mercadorias'],
  empresa: ['empresa'],
  classe: ['classe_de_avaliacao'],
  material: ['material'],
  unidade: ['unid_medida_basica', 'unidade'],
  descricao: ['texto_breve_material', 'descricao'],
  qtdEntrada: ['entrada_estoq_aval'],
  valEntrada: ['valentrestavaliado'],
  qtdSaida: ['saida_estoq_avaliado'],
  valSaida: ['valsaidaestoqueaval'],
  pmmMI: ['pmm_mi'],
  pmmM2: ['pmm_m2'],
  quantidade: ['qtd_estoque_no_deposito'],
  valorMI: ['valor_total_mi'],
  valorM2: ['valor_total_m2'],
  transito: ['transito_e_te'],
  ultEntrada: ['ultima_entrada'],
  ultConsumo: ['ultimo_consumo'],
  ultSaida: ['ultima_saida'],
  ultMovimento: ['ultimo_movimento'],
};
const REQUIRED = ['empresa', 'material', 'valorMI'];

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (typeof v === 'number' ? v : (parseNumber(v) ?? 0)) || 0;
const round2 = (n) => Math.round(n * 100) / 100;
const toDate = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const m = str(v).match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : null);
};

/** Lê o arquivo e devolve, por empresa, as linhas de estoque (sem moeda aplicada ainda) */
async function read(buffer, fileName) {
  const sheets = await readSheets(buffer, fileName);
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 15); h++) {
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(str(c)));
      const map = {};
      for (const [k, names] of Object.entries(COLS)) {
        const i = header.findIndex((x) => names.includes(x));
        if (i >= 0) map[k] = i;
      }
      // A coluna "Moeda" aparece repetida (MI e M2): a primeira é a moeda interna
      const moedaIdx = header.indexOf('moeda');
      if (!REQUIRED.every((k) => k in map)) continue;

      // Denominação da classe de avaliação (parâmetro T025)
      const classes = new Map((await Parameter.all('classes-avaliacao').catch(() => [])).map((c) => [String(c.classe), c.denominacao]));
      const byCompany = new Map();
      let linhas = 0;
      for (let i = h + 1; i < sheet.rows.length; i++) {
        const r = sheet.rows[i];
        if (!r || !str(r[map.empresa]) || !str(r[map.material])) continue;
        const empresa = str(r[map.empresa]);
        const classe = str(r[map.classe]);
        const valorMI = num(r[map.valorMI]);
        const valorM2 = map.valorM2 !== undefined ? num(r[map.valorM2]) : 0;
        const quantidade = num(r[map.quantidade]);
        if (!valorMI && !valorM2 && !quantidade && !num(r[map.valEntrada]) && !num(r[map.valSaida])) continue; // sem saldo nem movimento
        const ult = toDate(r[map.ultMovimento]);
        const row = {
          material: str(r[map.material]),
          descricao: str(r[map.descricao]),
          tipoMaterial: str(r[map.tipoMaterial]) || 'Não informado',
          grupoMercadorias: str(r[map.grupoMercadorias]),
          classeCod: classe,
          classe: classe ? `${classe}${classes.get(classe) ? ' · ' + classes.get(classe) : ''}` : 'Não informada',
          // Classe de avaliação "Materiais de Terceiros" (T025) = estoque de terceiros; o resto é da empresa
          posse: /terceiros/i.test(classes.get(classe) || '') ? 'Estoque de terceiros' : 'Estoque próprio',
          centro: str(r[map.centro]),
          deposito: str(r[map.deposito]),
          unidade: str(r[map.unidade]),
          quantidade: round2(quantidade),
          qtdEntrada: round2(num(r[map.qtdEntrada])),
          qtdSaida: round2(num(r[map.qtdSaida])),
          ultimaEntrada: toDate(r[map.ultEntrada]),
          ultimoConsumo: toDate(r[map.ultConsumo]),
          ultimoMovimento: ult,
          // valores nas duas moedas; a carga escolhe qual vira "valor"
          _MI: { valor: round2(valorMI), pmm: num(r[map.pmmMI]), entradas: round2(num(r[map.valEntrada])), saidas: round2(num(r[map.valSaida])) },
          _M2: { valor: round2(valorM2), pmm: map.pmmM2 !== undefined ? num(r[map.pmmM2]) : 0 },
          _moedaMI: moedaIdx >= 0 ? str(r[moedaIdx]) : '',
        };
        let comp = byCompany.get(empresa);
        if (!comp) { comp = { rows: [], moedas: new Map() }; byCompany.set(empresa, comp); }
        comp.rows.push(row);
        if (row._moedaMI) comp.moedas.set(row._moedaMI, (comp.moedas.get(row._moedaMI) || 0) + 1);
        linhas++;
      }
      if (!linhas) throw new EstoqueError('Nenhuma linha de estoque com saldo ou movimento.');
      return { byCompany, linhas, hasM2: map.valorM2 !== undefined };
    }
  }
  throw new EstoqueError('Layout não reconhecido. Colunas esperadas (ZL0190): Centro, Depósito, Empresa, Classe de avaliação, Material, Texto breve material, Qtd. Estoque no Depósito, Valor Total MI, Valor Total M2…');
}

/** Monta as linhas finais de uma moeda: "valor" = MI (moeda da empresa) ou M2 (moeda do grupo) */
function rowsFor(rows, which) {
  return rows.map(({ _MI, _M2, _moedaMI, ...r }) => {
    if (which === 'M2') {
      // Entradas/saídas só existem em MI: convertidas pela razão M2/MI do próprio item
      const fx = _MI.valor ? _M2.valor / _MI.valor : (_MI.pmm ? _M2.pmm / _MI.pmm : 0);
      return { ...r, valor: _M2.valor, pmm: _M2.pmm, entradas: round2(_MI.entradas * fx), saidas: round2(_MI.saidas * fx) };
    }
    return { ...r, valor: _MI.valor, pmm: _MI.pmm, entradas: _MI.entradas, saidas: _MI.saidas };
  });
}

/* ---------- Gravação enxuta ----------
 * O banco guarda só os campos de origem com valor (sem zeros, vazios e campos calculados).
 * Na leitura, reidratar() refaz: classe com descrição, próprio × terceiros, dias sem movimento e status de giro. */
const GUARDAR = ['material', 'descricao', 'tipoMaterial', 'grupoMercadorias', 'classeCod', 'centro', 'deposito', 'unidade',
  'quantidade', 'qtdEntrada', 'qtdSaida', 'ultimaEntrada', 'ultimoConsumo', 'ultimoMovimento', 'valor', 'pmm', 'entradas', 'saidas'];
const NUMEROS = new Set(['quantidade', 'qtdEntrada', 'qtdSaida', 'valor', 'pmm', 'entradas', 'saidas']);
const DATAS = new Set(['ultimaEntrada', 'ultimoConsumo', 'ultimoMovimento']);

function enxugar(row) {
  const out = {};
  for (const k of GUARDAR) {
    const v = row[k];
    if (v === '' || v == null || v === 0) continue;
    out[k] = v;
  }
  return out;
}

let classesCache = null;
async function classesT025() {
  if (!classesCache || Date.now() - classesCache.at > 10 * 60 * 1000) {
    const lista = await Parameter.all('classes-avaliacao').catch(() => []);
    classesCache = { at: Date.now(), map: new Map(lista.map((c) => [String(c.classe), c.denominacao])) };
  }
  return classesCache.map;
}

/** Refaz os campos calculados das linhas gravadas enxutas (refPeriodEnd = último dia da competência, em ms) */
async function reidratar(rows, refPeriodEnd, statusGiro) {
  const classes = await classesT025();
  for (const r of rows) {
    if (r.classeCod === undefined && r.classe && r.posse) continue; // linha antiga, gravada completa
    for (const k of GUARDAR) if (r[k] === undefined) r[k] = NUMEROS.has(k) ? 0 : DATAS.has(k) ? null : '';
    const desc = classes.get(String(r.classeCod)) || '';
    r.tipoMaterial ||= 'Não informado';
    r.classe = r.classeCod ? `${r.classeCod}${desc ? ' · ' + desc : ''}` : 'Não informada';
    r.posse = /terceiros/i.test(desc) ? 'Estoque de terceiros' : 'Estoque próprio';
    const dias = r.ultimoMovimento ? Math.max(0, Math.floor((refPeriodEnd - Date.parse(r.ultimoMovimento)) / 86400000)) : null;
    r.diasSemMov = dias;
    r.statusGiro = statusGiro(dias);
  }
  return rows;
}

module.exports = { read, rowsFor, EstoqueError, enxugar, reidratar };
