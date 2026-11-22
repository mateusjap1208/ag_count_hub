/**
 * Clientes · visão de obra (FAGLL03 de clientes, já filtrado pelo escopo da tela):
 *  - "Cliente da obra": quando a seleção cai numa obra só (um centro de lucro com saldo faturado em aberto),
 *    mostra o(s) cliente(s) dela no lugar do ranking de clientes;
 *  - "Faturas em aberto": títulos faturados e não recebidos (saldo aberto ≠ 0), por documento,
 *    do maior atraso para o menor.
 * Sem comparar obras entre si.
 */

const zero = (v) => Math.abs(v || 0) < 0.005;
const round2 = (n) => Math.round(n * 100) / 100;
const LIMITE_FATURAS = 500;

/** Faixa de atraso do título (mesmos cortes do aging) */
function situacao(dias, vencimento) {
  if (!vencimento) return 'Sem vencimento';
  if (dias <= 0) return 'A vencer';
  if (dias <= 30) return 'Vencido até 30 dias';
  if (dias <= 90) return 'Vencido 31 a 90 dias';
  return 'Vencido há mais de 90 dias';
}

/**
 * @param {object[]} rows linhas do FAGLL03 de clientes (com campos derivados: aberto, diasAtraso, parceiroNome)
 * @param {{ clientesContrato?: string[] }} opcoes clientes da obra no ZS0003 (cliente_da_obra), se carregado
 */
function montar(rows, { clientesContrato = [] } = {}) {
  const abertas = rows.filter((r) => !zero(r.aberto));
  const centros = new Set(abertas.map((r) => r.centroLucro).filter(Boolean));
  const obra = centros.size === 1 ? [...centros][0] : null;

  // Títulos: um por empresa + documento + cliente (o FAGLL03 pode trazer várias partidas do mesmo documento)
  const porDoc = new Map();
  for (const r of abertas) {
    const k = `${r.empresa}|${r.documento}|${r.parceiroNome}`;
    const t = porDoc.get(k) || porDoc.set(k, {
      empresa: r.empresa, documento: r.documento || '(sem documento)', tipoDoc: r.tipoDoc || '',
      cliente: r.parceiroNome, centroLucro: r.centroLucro || '', lancamento: r.dataLancamento || null,
      vencimento: null, dias: 0, valor: 0, texto: '',
    }).get(k);
    t.valor += r.aberto;
    if (r.vencimento && (!t.vencimento || r.vencimento < t.vencimento)) t.vencimento = r.vencimento;
    t.dias = Math.max(t.dias, r.diasAtraso || 0);
    if (!t.texto && r.texto) t.texto = r.texto;
    if (r.dataLancamento && (!t.lancamento || r.dataLancamento < t.lancamento)) t.lancamento = r.dataLancamento;
  }
  const titulos = [...porDoc.values()]
    .filter((t) => !zero(t.valor))
    .map((t) => ({ ...t, valor: round2(t.valor), situacao: situacao(t.dias, t.vencimento) }))
    .sort((a, b) => b.dias - a.dias || b.valor - a.valor);

  const vencido = titulos.filter((t) => t.dias > 0).reduce((s, t) => s + t.valor, 0);
  const total = titulos.reduce((s, t) => s + t.valor, 0);

  // Clientes da obra (só quando a seleção é uma obra só)
  let clientes = null;
  if (obra) {
    const por = new Map();
    for (const t of titulos) {
      const c = por.get(t.cliente) || por.set(t.cliente, { nome: t.cliente, valor: 0, vencido: 0, titulos: 0, maiorAtraso: 0 }).get(t.cliente);
      c.valor += t.valor;
      if (t.dias > 0) c.vencido += t.valor;
      c.titulos += 1;
      c.maiorAtraso = Math.max(c.maiorAtraso, t.dias);
    }
    clientes = [...por.values()].map((c) => ({ ...c, valor: round2(c.valor), vencido: round2(c.vencido) })).sort((a, b) => b.valor - a.valor);
  }

  return {
    obra,
    clientes,
    clientesContrato: obra ? [...new Set(clientesContrato.map((c) => String(c || '').trim()).filter(Boolean))] : [],
    titulos: titulos.slice(0, LIMITE_FATURAS),
    totalTitulos: titulos.length,
    total: round2(total),
    vencido: round2(vencido),
    maiorAtraso: titulos.length ? titulos[0].dias : 0,
  };
}

module.exports = { montar, situacao };
