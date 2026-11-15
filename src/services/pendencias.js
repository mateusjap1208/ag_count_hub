/**
 * Pendências de cadastro e parâmetros (notificação para os administradores):
 *  - contas contábeis a classificar no FGI0 da competência (BP e DRE "A classificar" / "Não classificado");
 *  - checagens de consistência dos Parâmetros (plano de contas, mapeamento, BPC…);
 *  - tabelas de parâmetros ainda não carregadas;
 *  - centros de lucro com movimento e sem cadastro de obra.
 * Resultado em cache por competência (alguns minutos), pois consulta o FGI0 consolidado.
 */
const Report = require('../models/Report');
const Parameter = require('../models/Parameter');

const TTL = 5 * 60 * 1000;
const cache = new Map(); // competência → { at, dados }

const escopoGrupo = (period) => ({ period, company: Report.ALL, empresas: [], moeda: 'grupo', estrutura: [], sigla: [], centro: [], moedaContrato: 'BRL', rowFilters: {}, allowed: null, allowedKey: '' });

async function contasAClassificar(period) {
  const scope = escopoGrupo(period);
  const [bp, dre] = await Promise.all([
    Report.getAllRows('bp', scope).catch(() => []),
    Report.getAllRows('dre', scope).catch(() => []),
  ]);
  const por = new Map();
  const add = (r, onde, valor) => {
    const k = String(r.conta);
    const o = por.get(k) || por.set(k, { conta: k, descricao: r.descricao || '', onde: new Set(), saldo: 0, centros: new Set() }).get(k);
    o.onde.add(onde);
    o.saldo += valor || 0;
    if (r.centroLucro) o.centros.add(r.centroLucro);
  };
  for (const r of bp) {
    if (/a classificar|não classificado/i.test(`${r.grupo} ${r.classe}`)) add(r, 'BP', r.saldo);
  }
  for (const r of dre) {
    if (/a classificar/i.test(r.grupo || '')) add(r, 'DRE', r.valor);
  }
  const lista = [...por.values()]
    .map((o) => ({ ...o, onde: [...o.onde].join(' e '), centros: o.centros.size }))
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  // Conta cadastrada depois da importação: já tem classificação, só falta reimportar o FGI0 da competência
  for (const o of lista) {
    const resultado = /^[45]/.test(o.conta);
    const cad = await Parameter.find(resultado ? 'plano-contas' : 'mapeamento-contas', o.conta).catch(() => []);
    o.jaClassificada = cad.length
      ? [...new Set(cad.map((c) => (resultado ? c.classe : c.descGerencial || c.contaGrupo)).filter(Boolean))].join(' / ') || 'cadastrada'
      : null;
  }
  return lista;
}

async function calcular(period) {
  const [contas, checagens, carregados, obras] = await Promise.all([
    period ? contasAClassificar(period) : [],
    Parameter.checks().catch(() => []),
    Parameter.loadedIds().catch(() => new Set()),
    period ? Report.effectiveObras(period, 'grupo').catch(() => []) : [],
  ]);
  const naoCarregados = Parameter.definitions.filter((d) => !carregados.has(d.id)).map((d) => ({ id: d.id, titulo: d.title, descricao: d.description }));
  const semObra = obras.filter((o) => o.virtual && o.centroLucro).map((o) => o.centroLucro).sort();
  const avisos = checagens.filter((c) => c.level === 'warn');
  const total = (contas.length ? 1 : 0) + avisos.length + naoCarregados.length + (semObra.length ? 1 : 0);
  return {
    period,
    total, // quantidade de grupos de pendências (selo do ícone)
    contas,
    checagens,
    naoCarregados,
    semObra,
    resumo: [
      contas.length && `${contas.length.toLocaleString('pt-BR')} conta(s) contábil(eis) a classificar${contas.some((c) => c.jaClassificada) ? ` (${contas.filter((c) => c.jaClassificada).length.toLocaleString('pt-BR')} já cadastrada(s): reimporte o FGI0)` : ''}`,
      naoCarregados.length && `${naoCarregados.length} tabela(s) de parâmetros não carregada(s)`,
      avisos.length && `${avisos.length} alerta(s) nos parâmetros`,
      semObra.length && `${semObra.length.toLocaleString('pt-BR')} centro(s) de lucro sem cadastro de obra`,
    ].filter(Boolean),
  };
}

async function doPeriodo(period) {
  const hit = cache.get(period);
  if (hit && Date.now() - hit.at < TTL) return hit.dados;
  const dados = await calcular(period);
  cache.set(period, { at: Date.now(), dados });
  return dados;
}

/** Versão leve para o selo do topo: devolve o que estiver em cache e calcula em segundo plano */
function resumoRapido(period) {
  const hit = cache.get(period);
  if (!hit || Date.now() - hit.at >= TTL) doPeriodo(period).catch(() => {});
  return hit ? hit.dados : null;
}

const limpar = () => cache.clear();

module.exports = { doPeriodo, resumoRapido, limpar };
