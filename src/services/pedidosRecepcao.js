/**
 * Conta 2115100000 (Fornecedores Recepção & Conferência), do FAGLL03 de fornecedores:
 * saldo por pedido de compra, com o fornecedor do lançamento ou, quando ele não vem
 * no lançamento, o fornecedor do pedido no EKKO (parâmetro "pedidos-compra").
 */
const Parameter = require('../models/Parameter');

const CONTA = '2115100000';
const semZeros = (s) => String(s || '').replace(/^0+/, '');

async function porPedido(rows) {
  const linhas = rows.filter((r) => String(r.conta) === CONTA);
  if (!linhas.length) return { conta: CONTA, vazio: true };
  const temEkko = await Parameter.loadedIds().then((ids) => ids.has('pedidos-compra')).catch(() => false);

  const por = new Map();
  for (const r of linhas) {
    const pedido = r.documentoCompras || '';
    const p = por.get(pedido) || por.set(pedido, { pedido, fornecedor: '', montante: 0, lancamentos: 0, data: '' }).get(pedido);
    p.montante += r.valor || 0;
    p.lancamentos += 1;
    if (!p.fornecedor && r.fornecedor) p.fornecedor = r.fornecedor;
    if (r.dataLancamento && r.dataLancamento > p.data) p.data = r.dataLancamento;
  }

  const lista = [...por.values()].filter((p) => Math.abs(p.montante) >= 0.005);
  let doEkko = 0;
  for (const p of lista) {
    p.origem = p.fornecedor ? 'lançamento' : '';
    if (!p.fornecedor && p.pedido && temEkko) {
      const ek = (await Parameter.find('pedidos-compra', p.pedido).catch(() => []))[0];
      if (ek?.fornecedor) { p.fornecedor = String(ek.fornecedor); p.origem = 'EKKO'; doEkko += 1; }
    }
    const nome = p.fornecedor ? await Parameter.nameOf('fornecedores', semZeros(p.fornecedor)).catch(() => null)
      || await Parameter.nameOf('fornecedores', p.fornecedor).catch(() => null) : null;
    p.fornecedorNome = p.fornecedor ? (nome ? `${p.fornecedor} - ${nome}` : p.fornecedor) : '';
  }
  lista.sort((a, b) => Math.abs(b.montante) - Math.abs(a.montante));
  return {
    conta: CONTA,
    temEkko,
    saldo: linhas.reduce((a, r) => a + (r.valor || 0), 0),
    lancamentos: linhas.length,
    pedidos: lista,
    pedidosZerados: por.size - lista.length,
    doEkko,
    semFornecedor: lista.filter((p) => !p.fornecedor).length,
  };
}

module.exports = { porPedido, CONTA };
