/**
 * Adiantamentos · visão de obra (FAGLL03 de fornecedores, já filtrado pelo escopo da tela):
 *  - "Adiantamentos em aberto": cada documento de adiantamento a fornecedor/subempreiteiro com saldo,
 *    do mais antigo para o mais novo, com os dias em aberto contados da data de lançamento até o fim da competência;
 *  - aging (idade) do saldo, nas faixas de AGING_SCHEMES.age;
 *  - saldo com mais de 90 dias (card).
 * Sem comparar obras entre si.
 */
const { AGING_SCHEMES } = require('../config/modules');
const { codigoENome } = require('./maioresFornecedores');

const zero = (v) => Math.abs(v || 0) < 0.005;
const round2 = (n) => Math.round(n * 100) / 100;
const LIMITE = 500;
const DIAS_ALERTA = 90;
const FAIXAS = AGING_SCHEMES.age;
const SEM_DATA = 'Sem data';

/** Linha do FAGLL03 de fornecedores classificada como adiantamento (N4 "Adiantamento a fornecedores…") */
const ehAdiantamento = (r) => /^adiantamento/i.test(String(r.classe || r.nivel || ''));

/** Último dia da competência (ms UTC) */
const fimCompetencia = (p) => { const [y, m] = p.split('-').map(Number); return Date.UTC(y, m, 0); };

function faixa(dias) {
  if (dias == null) return SEM_DATA;
  if (dias <= 30) return FAIXAS[0];
  if (dias <= 90) return FAIXAS[1];
  if (dias <= 180) return FAIXAS[2];
  if (dias <= 365) return FAIXAS[3];
  return FAIXAS[4];
}

/** Situação para a cobrança: até 90 dias em dia; 91–180 atenção; mais de 180 crítico */
function situacao(dias) {
  if (dias == null) return { situacao: 'Sem data de lançamento', tom: 'ok' };
  if (dias <= DIAS_ALERTA) return { situacao: 'Até 90 dias', tom: 'ok' };
  if (dias <= 180) return { situacao: '91 a 180 dias', tom: 'atencao' };
  return { situacao: 'Mais de 180 dias', tom: 'critico' };
}

/**
 * @param {object[]} rows linhas do FAGLL03 de fornecedores (com os campos derivados: classe, parceiroNome…)
 * @param {{ periodo?: string }} opcoes periodo = competência (AAAA-MM), referência para os dias em aberto
 */
function montar(rows, { periodo = null } = {}) {
  const ref = periodo ? fimCompetencia(periodo) : null;
  const linhas = rows.filter((r) => ehAdiantamento(r) && !zero(r.valor));
  const centros = new Set(linhas.map((r) => r.centroLucro).filter(Boolean));

  // Um por empresa + documento + fornecedor (o FAGLL03 pode trazer várias partidas do mesmo documento)
  const porDoc = new Map();
  for (const r of linhas) {
    const { codigo, nome } = codigoENome(r);
    const fornecedor = codigo ? (nome ? `${codigo} - ${nome}` : codigo) : (r.parceiroNome || 'Sem fornecedor');
    const k = `${r.empresa}|${r.documento}|${fornecedor}`;
    const d = porDoc.get(k) || porDoc.set(k, {
      empresa: r.empresa, documento: r.documento || '(sem documento)', tipoDoc: r.tipoDoc || '',
      fornecedor, pedido: r.documentoCompras || '', centroLucro: r.centroLucro || '', lancamento: null, valor: 0, texto: '',
    }).get(k);
    d.valor += r.valor;
    if (r.dataLancamento && (!d.lancamento || r.dataLancamento < d.lancamento)) d.lancamento = r.dataLancamento;
    if (!d.pedido && r.documentoCompras) d.pedido = r.documentoCompras;
    if (!d.texto && r.texto) d.texto = r.texto;
  }
  const docs = [...porDoc.values()].filter((d) => !zero(d.valor)).map((d) => {
    const dias = ref && d.lancamento ? Math.max(0, Math.floor((ref - Date.parse(`${d.lancamento}T00:00:00Z`)) / 864e5)) : null;
    return { ...d, valor: round2(d.valor), dias, faixa: faixa(dias), ...situacao(dias) };
  }).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || b.valor - a.valor);

  const soma = (lista) => round2(lista.reduce((s, d) => s + d.valor, 0));
  const total = soma(docs);
  const acima90 = soma(docs.filter((d) => d.dias != null && d.dias > DIAS_ALERTA));
  const porFaixa = [...FAIXAS, SEM_DATA].map((f) => [f, soma(docs.filter((d) => d.faixa === f))])
    .filter(([f, v]) => f !== SEM_DATA || !zero(v));

  return {
    vazio: !docs.length,
    obra: centros.size === 1 ? [...centros][0] : null,
    documentos: docs.slice(0, LIMITE),
    totalDocumentos: docs.length,
    fornecedores: new Set(docs.map((d) => d.fornecedor)).size,
    total,
    acima90,
    pctAcima90: total > 0 ? acima90 / total : null,
    maisAntigo: docs.length ? docs[0].dias : null,
    aging: { labels: porFaixa.map((x) => x[0]), values: porFaixa.map((x) => x[1]) },
  };
}

module.exports = { montar, ehAdiantamento, DIAS_ALERTA };
