/**
 * FGI0 — Saldos contábeis (SAP). Um arquivo por competência e tipo de moeda:
 *   "FGI0 - Moeda do grupo de empresa 31.10.2026.XLSX"  → competência 2026-10, moeda do grupo
 *   "FGI0 - Moeda da empresa 31.10.2026.XLSX"           → competência 2026-10, moeda da empresa
 *
 * Colunas: Empresa | Centro de lucro | Nº conta | Moeda | Saldo acumulado | Área funcional (cód.) |
 *          Área funcional (desc.) | Tipo de moeda
 * Linhas sem empresa são totais do SAP (por conta e total geral) e são ignoradas.
 *
 * Cada linha é classificada pelos Parâmetros e alimenta três relatórios por empresa:
 *   BP  (contas patrimoniais + resultado do exercício no PL)
 *   DRE (contas de resultado)
 *   Capital Empregado (contas mapeadas para a estrutura gerencial)
 */
const { readSheets } = require('./sheetReader');
const { normalizeHeader, parseNumber } = require('./txtParser');
const Parameter = require('../models/Parameter');
const config = require('../config');

class Fgi0Error extends Error {}

const COLS = [
  { key: 'empresa', names: ['empresa', 'bukrs', 'rbukrs'], required: true },
  { key: 'centroLucro', names: ['centro_de_lucro', 'prctr'] },
  { key: 'conta', names: ['n_conta', 'no_conta', 'conta', 'racct', 'conta_do_razao'], required: true },
  { key: 'moeda', names: ['moeda', 'waers'] },
  { key: 'saldo', names: ['saldo_acumulado', 'saldo', 'saldo_acum'], required: true },
  { key: 'areaFuncional', names: ['area_funcional', 'rfarea'] },
  { key: 'areaFuncionalDesc', names: ['area_funcional'], occurrence: 2 },
  { key: 'tipoMoeda', names: ['tipo_de_moeda'] },
];

const str = (v) => (v == null ? '' : String(v).trim());
const stripCode = (s) => str(s).replace(/^[A-Z]\.[\d.]+\s*-\s*/, '').trim();
const noAccents = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Competência (AAAA-MM) a partir do nome do arquivo: 31.10.2026 | 10.2026 | 2026-10 */
function periodFromName(name) {
  let m = name.match(/(\d{2})[.\-_/](\d{2})[.\-_/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}`;
  m = name.match(/(?:^|\D)(\d{2})[.\-_/](\d{4})(?:\D|$)/);
  if (m) return `${m[2]}-${m[1]}`;
  m = name.match(/(\d{4})[.\-_](\d{2})(?:\D|$)/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function currencyTypeFrom(text) {
  const t = noAccents(text);
  if (/moeda do grupo|grupo de empresa|\bgrupo\b/.test(t)) return 'grupo';
  if (/moeda da empresa|\bempresa\b/.test(t)) return 'empresa';
  return null;
}

/** Lê o arquivo (.xlsx ou .txt) e devolve as linhas de saldo + competência e tipo de moeda */
async function readFgi0(buffer, fileName) {
  const sheets = await readSheets(buffer, fileName);
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(sheet.rows.length, 20); h++) {
      const header = (sheet.rows[h] || []).map((c) => normalizeHeader(str(c)));
      const map = {};
      for (const c of COLS) {
        const hits = header.map((x, i) => (c.names.includes(x) ? i : -1)).filter((i) => i >= 0);
        const idx = hits[(c.occurrence || 1) - 1];
        if (idx !== undefined) map[c.key] = idx;
      }
      if (!COLS.filter((c) => c.required).every((c) => c.key in map)) continue;

      const rows = [];
      let skippedTotals = 0;
      let tipoMoeda = '';
      for (let i = h + 1; i < sheet.rows.length; i++) {
        const r = sheet.rows[i];
        if (!r || !r.length) continue;
        const empresa = str(r[map.empresa]);
        const contaRaw = str(r[map.conta]);
        if (!empresa || !contaRaw) { skippedTotals++; continue; } // totais do SAP
        const saldo = typeof r[map.saldo] === 'number' ? r[map.saldo] : parseNumber(r[map.saldo]);
        if (!Number.isFinite(saldo)) { skippedTotals++; continue; }
        if (!tipoMoeda && map.tipoMoeda !== undefined) tipoMoeda = str(r[map.tipoMoeda]);
        rows.push({
          empresa,
          centroLucro: str(r[map.centroLucro]).split('/').pop(),
          conta: contaRaw.split('/').pop(),
          moeda: str(r[map.moeda]),
          saldo,
          areaFuncional: str(r[map.areaFuncional]),
          areaFuncionalDesc: str(r[map.areaFuncionalDesc]),
        });
      }
      if (!rows.length) throw new Fgi0Error('Nenhuma linha de saldo encontrada no arquivo.');
      return {
        rows,
        skippedTotals,
        period: periodFromName(fileName),
        currencyType: currencyTypeFrom(fileName) || currencyTypeFrom(tipoMoeda),
      };
    }
  }
  throw new Fgi0Error('Layout do FGI0 não reconhecido. Colunas esperadas: Empresa, Centro de lucro, Nº conta, Moeda, Saldo acumulado, Área funcional, Tipo de moeda.');
}

/* ------------------------------------------------------------ classificação */

const BP_GROUPS = {
  'A.11': 'Ativo Circulante', 'A.12': 'Ativo Não Circulante', 'A.13': 'Ativo Não Circulante',
  'A.21': 'Passivo Circulante', 'A.22': 'Passivo Não Circulante', 'A.23': 'Patrimônio Líquido',
};

function dreGroup(classe, secao) {
  const c = noAccents(classe);
  if (/^a\.32/i.test(secao || '')) return 'Deduções da Receita';
  if (c.startsWith('receita de servicos')) return 'Receita Bruta';
  if (c.startsWith('custos')) return 'Custos';
  if (c.startsWith('despesas gerais')) return 'Despesas Gerais e Administrativas';
  if (c.includes('equivalencia')) return 'Resultado de Equivalência Patrimonial';
  if (c.includes('perdas e riscos') || c.includes('provis')) return 'Provisões para Perdas e Riscos';
  if (c.startsWith('outras receitas')) return 'Outras Receitas (Despesas) Operacionais';
  if (c.includes('resultado financeiro')) return 'Resultado Financeiro';
  if (/^(corrente|diferido)|imposto de renda/.test(c)) return 'IR e CSLL';
  return null;
}

/**
 * Custos × Despesas G&A: decide pela área funcional do FGI0 (regra da contabilidade):
 *   Z001, Z002                → Despesa
 *   Z003, Z004, Z005 e vazia → Custo
 */
const AREA_DESPESA = ['Z001', 'Z002'];
function resolveClass(planRows, areaFuncional) {
  const classes = [...new Set(planRows.map((p) => p.classe).filter(Boolean))];
  if (classes.length <= 1) return { classe: classes[0] || '', ambigua: false };
  const af = str(areaFuncional).toUpperCase();
  const custo = classes.find((c) => noAccents(c).startsWith('custos'));
  const desp = classes.find((c) => noAccents(c).startsWith('despesas'));
  if (AREA_DESPESA.includes(af) && desp) return { classe: desp, ambigua: true };
  if (custo) return { classe: custo, ambigua: true };
  // combinação diferente de Custo × Despesa: classe mais frequente no plano
  const count = new Map();
  planRows.forEach((p) => count.set(p.classe, (count.get(p.classe) || 0) + 1));
  return { classe: [...count].sort((a, b) => b[1] - a[1])[0][0], ambigua: true };
}

const MIN_PREFIX = 4;
const digitsPrefix = (conta) => (str(conta).match(/^\d+/) || [''])[0];

/**
 * Índice prefixo → contas do grupo das contas do razão já classificadas no Plano de Contas.
 * Permite herdar a conta do grupo de contas "irmãs" (mesmo início) quando a conta não está cadastrada.
 */
async function buildPrefixIndex() {
  const index = new Map();
  for (const r of await Parameter.all('plano-contas')) {
    const d = digitsPrefix(r.conta);
    if (!r.contaGrupo || d.length < MIN_PREFIX) continue;
    for (let k = MIN_PREFIX; k <= Math.min(d.length, 9); k++) {
      const p = d.slice(0, k);
      let m = index.get(p);
      if (!m) { m = new Map(); index.set(p, m); }
      m.set(r.contaGrupo, (m.get(r.contaGrupo) || 0) + 1);
    }
  }
  return index;
}

function createClassifier() {
  const cache = new Map();
  let prefixIndex;

  /** Conta do grupo mais frequente entre as contas classificadas com o maior prefixo em comum */
  async function similarGroup(conta) {
    prefixIndex ||= await buildPrefixIndex();
    const d = digitsPrefix(conta);
    for (let k = Math.min(d.length, 9); k >= MIN_PREFIX; k--) {
      const m = prefixIndex.get(d.slice(0, k));
      if (m) return { contaGrupo: [...m].sort((a, b) => b[1] - a[1])[0][0], prefixo: d.slice(0, k) };
    }
    return null;
  }

  /** Classificação base da conta (independe da área funcional) */
  async function base(conta) {
    if (cache.has(conta)) return cache.get(conta);
    const p = (async () => {
      const mapa = (await Parameter.find('mapeamento-contas', conta))[0] || null;
      let plano = await Parameter.find('plano-contas', conta);
      let via = 'plano';
      if (!plano.length && mapa?.contaGrupo) { plano = await Parameter.find('plano-contas', mapa.contaGrupo, 'contaGrupo'); via = 'mapeamento'; }
      // Conta não cadastrada (e sem estrutura BPC exata): herda a conta do grupo de contas semelhantes já classificadas
      let semelhante = null;
      const grupoDireto = mapa?.contaGrupo || conta;
      const temBpc = (await Parameter.find('bpc-bp', grupoDireto)).length || (await Parameter.find('bpc-dre', grupoDireto)).length;
      if (!plano.length && !temBpc) {
        const sg = await similarGroup(conta);
        if (sg) {
          plano = await Parameter.find('plano-contas', sg.contaGrupo, 'contaGrupo');
          if (plano.length) { via = 'semelhante'; semelhante = sg; }
        }
      }
      const contaGrupo = plano[0]?.contaGrupo || mapa?.contaGrupo || conta;
      const bpcDre = (await Parameter.find('bpc-dre', contaGrupo))[0] || null;
      const bpcBp = (await Parameter.find('bpc-bp', contaGrupo))[0] || null;
      const ce = mapa ? (await Parameter.find('estrutura-ce', mapa.codGerencial))[0] || null : null;
      const descricao = (via === 'plano' && plano[0]?.descricao) || mapa?.descricao || bpcBp?.descricao || bpcDre?.descricao || '';

      let natureza = null; let grupo = null; let subgrupo = '';
      if (plano.length) {
        const n1 = str(plano[0].n1);
        natureza = n1.startsWith('A.1') ? 'ativo' : n1.startsWith('A.2') ? 'passivo' : n1.startsWith('A.3') ? 'pl' : n1.startsWith('A.4') ? 'resultado' : null;
        grupo = natureza === 'resultado' ? null : stripCode(plano[0].n2);
        subgrupo = stripCode(plano[0].n3);
      } else if (bpcBp) {
        const lvl2 = (bpcBp.caminho || '').split(' › ')[1];
        grupo = BP_GROUPS[lvl2] || null;
        natureza = grupo ? (grupo.startsWith('Ativo') ? 'ativo' : grupo.startsWith('Passivo') ? 'passivo' : 'pl') : null;
        via = 'bpc';
      } else if (bpcDre) {
        natureza = 'resultado'; via = 'bpc';
      }
      return { conta, contaGrupo, descricao, plano, mapa, bpcDre, bpcBp, ce, natureza, grupo, subgrupo, semelhante, via: natureza ? via : null };
    })();
    cache.set(conta, p);
    return p;
  }

  /** Classificação completa de uma linha do FGI0 */
  async function classify(row) {
    const b = await base(row.conta);
    let classe = '';
    let ambigua = false;
    let { subgrupo } = b;
    if (b.plano.length) {
      ({ classe, ambigua } = resolveClass(b.plano, row.areaFuncional));
      // conta com várias linhas no Plano de Contas: o detalhe (N3) vem da linha da classe escolhida pela área funcional
      const escolhida = ambigua && b.plano.find((p) => p.classe === classe);
      if (escolhida) subgrupo = stripCode(escolhida.n3);
    } else if (b.bpcBp) classe = b.bpcBp.classeAnalitica || b.bpcBp.descricao;
    else if (b.bpcDre) classe = b.bpcDre.classeDre;

    let dre = null;
    if (b.natureza === 'resultado') dre = dreGroup(classe, b.bpcDre?.secao);
    const classificada = !!b.natureza && (b.natureza !== 'resultado' || !!dre);
    return { ...b, subgrupo, classe, ambigua, dre, classificada };
  }

  return { classify };
}

/* ------------------------------------------------------- montagem das cargas */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Converte as linhas do FGI0 em linhas dos relatórios BP, DRE e CE, por empresa.
 * Sinais de apresentação: ativo (+), passivo/PL (+, invertido do saldo credor),
 * DRE com receita (+) e custos/despesas (−), Capital Empregado com o sinal contábil.
 */
async function buildReports(fgiRows, { ignorePrefixes = config.fgi0IgnorePrefixes } = {}) {
  const classifier = createClassifier();
  const byCompany = new Map();
  const unclassified = new Map();
  const ignored = { contas: new Set(), linhas: 0, saldo: 0 };
  const herdadas = new Map(); // contas sem cadastro classificadas pela conta do grupo de contas semelhantes
  let ambiguas = 0;

  for (const r of fgiRows) {
    if (!r.saldo) continue;
    // Contas desconsideradas por definição da contabilidade (ex.: começam com 6 ou 9)
    if (ignorePrefixes.some((p) => r.conta.startsWith(p))) {
      ignored.contas.add(r.conta); ignored.linhas++; ignored.saldo += r.saldo;
      continue;
    }
    const c = await classifier.classify(r);
    if (c.ambigua) ambiguas++;
    let comp = byCompany.get(r.empresa);
    if (!comp) {
      comp = { moeda: r.moeda, bp: [], dre: [], ce: [], resultado: new Map() }; // resultado por centro de lucro
      byCompany.set(r.empresa, comp);
    }
    if (!comp.moeda && r.moeda) comp.moeda = r.moeda;
    const descricao = c.descricao || (c.semelhante ? `Sem cadastro · grupo ${c.contaGrupo} (contas ${c.semelhante.prefixo}…)` : '');
    const common = { conta: r.conta, descricao, centroLucro: r.centroLucro };
    if (c.semelhante && c.classificada) {
      const s = herdadas.get(r.conta) || { conta: r.conta, contaGrupo: c.contaGrupo, prefixo: c.semelhante.prefixo, classe: c.dre || c.grupo || c.classe, saldo: 0 };
      s.saldo += r.saldo;
      herdadas.set(r.conta, s);
    }

    if (!c.classificada) {
      // Sem cadastro nem conta semelhante: vai para "A classificar" na demonstração indicada pelo 1º dígito
      const dig = r.conta[0];
      const destino = { 1: 'ativo', 2: 'passivo', 3: 'pl', 4: 'resultado', 5: 'resultado' }[dig] || null;
      const u = unclassified.get(r.conta) || { conta: r.conta, descricao: c.descricao, destino, saldo: 0 };
      u.saldo += r.saldo;
      unclassified.set(r.conta, u);
      const item = `${r.conta}${c.descricao ? ` - ${c.descricao}` : ''}`;
      if (destino === 'resultado') {
        comp.resultado.set(r.centroLucro, (comp.resultado.get(r.centroLucro) || 0) + r.saldo);
        comp.dre.push({ ...common, grupo: 'A classificar', subgrupo: 'A classificar', areaFuncional: r.areaFuncional || 'Não atribuída', valor: -r.saldo });
      } else if (destino) {
        const sec = destino === 'ativo' ? 'Ativo' : 'Passivo e PL';
        const grupo = destino === 'ativo' ? 'Ativo a classificar' : destino === 'passivo' ? 'Passivo a classificar' : 'PL a classificar';
        comp.bp.push({ ...common, grupo, classe: 'A classificar', saldo: (destino === 'ativo' ? 1 : -1) * r.saldo, arvore: `${sec}|${grupo}|${item}` });
      } else {
        comp.bp.push({ ...common, grupo: 'Não classificado', classe: 'Conta sem classificação', saldo: r.saldo, arvore: `Não classificado|Não classificado|${item}` });
      }
    } else if (c.natureza === 'resultado') {
      comp.resultado.set(r.centroLucro, (comp.resultado.get(r.centroLucro) || 0) + r.saldo);
      comp.dre.push({
        ...common, grupo: c.dre, subgrupo: c.subgrupo || c.classe,
        areaFuncional: r.areaFuncionalDesc && r.areaFuncionalDesc !== 'não atribuído' ? `${r.areaFuncional} ${r.areaFuncionalDesc}`.trim() : 'Não atribuída',
        valor: -r.saldo,
      });
    } else {
      const sinal = c.natureza === 'ativo' ? 1 : -1;
      const secao = c.natureza === 'ativo' ? 'Ativo' : 'Passivo e PL';
      comp.bp.push({ ...common, grupo: c.grupo, classe: c.classe || c.subgrupo, saldo: sinal * r.saldo, arvore: `${secao}|${c.grupo}|${c.classe || c.subgrupo}` });
    }

    if (c.ce) {
      comp.ce.push({
        ...common, lado: c.ce.lado, grupo: c.ce.grupo, linha: c.ce.linha, codGerencial: c.ce.codGerencial,
        valor: r.saldo, arvore: `${c.ce.lado}|${c.ce.grupo}|${c.ce.linha}`, _ordem: Number(c.ce.ordem) || 999,
      });
    }
  }

  // Resultado do exercício (contas de resultado ainda não encerradas) entra no PL do BP
  for (const comp of byCompany.values()) {
    // Uma linha por centro de lucro: ao filtrar obras, o PL traz o resultado só daquelas obras
    for (const [centro, res] of comp.resultado) {
      if (Math.abs(res) < 0.005) continue;
      comp.bp.push({
        conta: '', descricao: 'Resultado do exercício (DRE)', centroLucro: centro, grupo: 'Patrimônio Líquido',
        classe: 'Resultado do exercício (DRE)', saldo: round2(-res), arvore: 'Passivo e PL|Patrimônio Líquido|Resultado do exercício (DRE)',
      });
    }
    // Capital Empregado na ordem da estrutura gerencial (a árvore preserva a ordem de inserção)
    comp.ce.sort((a, b) => a._ordem - b._ordem);
    comp.ce.forEach((x) => delete x._ordem);
  }

  const naoClassificadas = [...unclassified.values()].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  return {
    byCompany, naoClassificadas, ambiguas,
    herdadas: [...herdadas.values()].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo)),
    ignoradas: { prefixos: ignorePrefixes, contas: ignored.contas.size, linhas: ignored.linhas, saldo: ignored.saldo },
  };
}

/* ------------------------------------------------- ordem da estrutura BPC */

/**
 * Posição de cada conta do razão na estrutura BPC do Balanço ("BP BPC - Class NE").
 * Conta do razão → conta do grupo (Plano de Contas ou Mapeamento) → ordem da linha da conta no parâmetro bpc-bp.
 * Recebe os rótulos "conta - descrição" (ou só a conta) e devolve Map(rótulo → ordem); fora da estrutura = sem entrada.
 */
async function bpcOrder(labels) {
  const out = new Map();
  if (!labels.length || !(await Parameter.all('bpc-bp').catch(() => [])).length) return out;
  const ordemDoGrupo = async (cg) => {
    const r = (await Parameter.find('bpc-bp', cg)).find((x) => x.tipo === 'conta');
    return r ? Number(r.ordem) : null;
  };
  for (const label of new Set(labels)) {
    const conta = str(label).split(' - ')[0].trim();
    if (!conta) continue;
    const plano = (await Parameter.find('plano-contas', conta).catch(() => []))[0];
    const mapa = plano ? null : (await Parameter.find('mapeamento-contas', conta).catch(() => []))[0];
    let ordem = null;
    for (const cg of [plano?.contaGrupo, mapa?.contaGrupo, conta]) {
      if (cg && (ordem = await ordemDoGrupo(cg)) != null) break;
    }
    if (ordem != null && Number.isFinite(ordem)) out.set(label, ordem);
  }
  return out;
}

module.exports = { readFgi0, buildReports, bpcOrder, periodFromName, currencyTypeFrom, Fgi0Error };
