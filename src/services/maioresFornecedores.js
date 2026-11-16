/**
 * Ranking de fornecedores por valor, a partir do FAGLL03 de fornecedores:
 *  - "adiantamento": linhas classificadas como Adiantamento a fornecedores (saldo devedor, positivo);
 *  - "fornecedor":   demais linhas (contas a pagar; saldo credor, mostrado como valor positivo).
 * Código do fornecedor: campo "fornecedor" do lançamento ou o início do "parceiro" ("1000007779 - NOME").
 * Nome: do lançamento ou, se faltar, do cadastro de fornecedores (LFA1, em Parâmetros).
 */
const Parameter = require('../models/Parameter');

const semZeros = (s) => String(s || '').trim().replace(/^0+(?=\d)/, '');
const ehAdiantamento = (r) => /^adiantamento/i.test(String(r.nivel || ''));

function codigoENome(r) {
  let codigo = semZeros(r.fornecedor);
  let nome = '';
  const parceiro = String(r.parceiroNome || '').trim();
  const i = parceiro.indexOf(' - ');
  if (i > 0) {
    if (!codigo) codigo = semZeros(parceiro.slice(0, i));
    nome = parceiro.slice(i + 3).trim();
  } else if (parceiro && !/^\d+$/.test(parceiro)) nome = parceiro;
  return { codigo, nome };
}

async function nomeNoCadastro(codigo) {
  if (!codigo) return '';
  for (const c of [codigo, codigo.padStart(10, '0')]) {
    const n = await Parameter.nameOf('fornecedores', c).catch(() => null);
    if (n) return n;
  }
  return '';
}

/**
 * @param {object[]} rows linhas do FAGLL03 de fornecedores (já filtradas pelo escopo)
 * @param {{ tipo: 'adiantamento'|'fornecedor', top?: number }} opcoes
 */
async function ranking(rows, { tipo, top = 15 }) {
  const sinal = tipo === 'adiantamento' ? 1 : -1;
  const linhas = rows.filter((r) => (tipo === 'adiantamento' ? ehAdiantamento(r) : !ehAdiantamento(r)));
  const por = new Map();
  for (const r of linhas) {
    const { codigo, nome } = codigoENome(r);
    const k = codigo || '(sem código)';
    const f = por.get(k) || por.set(k, { codigo, nome: '', valor: 0, lancamentos: 0, empresas: new Set() }).get(k);
    f.valor += sinal * (r.valor || 0);
    f.lancamentos += 1;
    if (!f.nome && nome) f.nome = nome;
    if (r.empresa) f.empresas.add(r.empresa);
  }
  // Só fornecedores com saldo no sentido do card (adiantamento a receber / valor a pagar)
  const todos = [...por.values()].filter((f) => f.valor >= 0.005).sort((a, b) => b.valor - a.valor);
  const total = todos.reduce((s, f) => s + f.valor, 0);
  const itens = todos.slice(0, top);
  for (const f of itens) {
    if (!f.nome) f.nome = await nomeNoCadastro(f.codigo);
    f.pct = total ? f.valor / total : 0;
    f.empresas = [...f.empresas].sort();
  }
  const resto = todos.slice(top);
  return {
    tipo,
    vazio: !todos.length,
    itens,
    total,
    fornecedores: todos.length,
    lancamentos: linhas.length,
    demais: { quantidade: resto.length, valor: resto.reduce((s, f) => s + f.valor, 0) },
  };
}

module.exports = { ranking, codigoENome };
