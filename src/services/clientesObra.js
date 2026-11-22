/**
 * Clientes · visão de obra (FAGLL03 de clientes, já filtrado pelo escopo da tela):
 *  - "Cliente da obra": quando a seleção cai numa obra só (um centro de lucro com saldo faturado em aberto),
 *    mostra o(s) cliente(s) dela no lugar do ranking de clientes;
 *  - "Faturas em aberto": títulos faturados e não recebidos (saldo aberto ≠ 0), por documento,
 *    do maior atraso para o menor (sem a conta de retenções contratuais);
 *  - "Retenções contratuais": a conta 1214000000 à parte, por documento (campo "retencao" do FAGLL03), com a
 *    idade de cada retenção e, numa obra só com o ZS0003 carregado, o % sobre o faturamento acumulado e a
 *    liberação esperada pelo término do contrato.
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

const FAIXAS_IDADE = ['Até 12 meses', '12 a 24 meses', 'Mais de 24 meses', 'Sem data'];
/** Último dia da competência (AAAA-MM-DD) */
const fimDoMes = (p) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
/** Meses completos entre duas datas AAAA-MM-DD */
const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) - (b.slice(8) < a.slice(8) ? 1 : 0);
function faixaIdade(meses) {
  if (meses == null) return 'Sem data';
  if (meses < 12) return 'Até 12 meses';
  if (meses < 24) return '12 a 24 meses';
  return 'Mais de 24 meses';
}

/**
 * Retenção × contrato (ZS0003): % retido sobre o faturamento acumulado da obra e situação da liberação
 * pela data de término (retenção costuma voltar no fim do contrato / aceite da obra).
 */
function liberacao(retido, contrato, fimCompetencia) {
  const pct = contrato.faturamentoAcumulado ? retido / contrato.faturamentoAcumulado : null;
  let situacao = 'Sem data de término no ZS0003';
  let tom = '';
  if (contrato.fim && fimCompetencia) {
    if (contrato.fim > fimCompetencia) {
      const m = mesesEntre(fimCompetencia, contrato.fim);
      situacao = m >= 1 ? `Liberação esperada após o término (em ${m} ${m === 1 ? 'mês' : 'meses'})` : 'Contrato termina neste mês';
    } else {
      situacao = 'Contrato terminado: retenção a cobrar do cliente';
      tom = 'alerta';
    }
  }
  return { pct, faturamentoAcumulado: round2(contrato.faturamentoAcumulado || 0), fim: contrato.fim || null, situacao, tom };
}

/**
 * @param {object[]} rows linhas do FAGLL03 de clientes (com campos derivados: aberto, retencao, diasAtraso, parceiroNome)
 * @param {{ periodo?: string, contrato?: { clientes: string[], faturamentoAcumulado: number, fim: string|null } }} opcoes
 *        periodo = competência (AAAA-MM); contrato = dados da obra no ZS0003 (Receita POC), se carregado
 */
function montar(rows, { periodo = null, contrato = null } = {}) {
  const clientesContrato = contrato?.clientes || [];
  const abertas = rows.filter((r) => !zero(r.aberto));
  const retidas = rows.filter((r) => !zero(r.retencao));
  const centros = new Set([...abertas, ...retidas].map((r) => r.centroLucro).filter(Boolean));
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

  // Retenções contratuais: um por empresa + documento + cliente, do maior valor para o menor
  const porRet = new Map();
  for (const r of retidas) {
    const k = `${r.empresa}|${r.documento}|${r.parceiroNome}`;
    const t = porRet.get(k) || porRet.set(k, {
      empresa: r.empresa, documento: r.documento || '(sem documento)', tipoDoc: r.tipoDoc || '',
      cliente: r.parceiroNome, centroLucro: r.centroLucro || '', lancamento: r.dataLancamento || null, valor: 0, texto: '',
    }).get(k);
    t.valor += r.retencao;
    if (!t.texto && r.texto) t.texto = r.texto;
    if (r.dataLancamento && (!t.lancamento || r.dataLancamento < t.lancamento)) t.lancamento = r.dataLancamento;
  }
  const fim = periodo ? fimDoMes(periodo) : null;
  const retencoes = [...porRet.values()].filter((t) => !zero(t.valor))
    .map((t) => {
      const meses = fim && t.lancamento ? mesesEntre(t.lancamento, fim) : null;
      return { ...t, valor: round2(t.valor), meses, idade: faixaIdade(meses) };
    }).sort((a, b) => b.valor - a.valor);
  const retencaoPorCliente = new Map();
  for (const t of retencoes) retencaoPorCliente.set(t.cliente, (retencaoPorCliente.get(t.cliente) || 0) + t.valor);

  // Clientes da obra (só quando a seleção é uma obra só)
  let clientes = null;
  if (obra) {
    const por = new Map();
    for (const t of titulos) {
      const c = por.get(t.cliente) || por.set(t.cliente, { nome: t.cliente, valor: 0, vencido: 0, titulos: 0, maiorAtraso: 0, retido: 0 }).get(t.cliente);
      c.valor += t.valor;
      if (t.dias > 0) c.vencido += t.valor;
      c.titulos += 1;
      c.maiorAtraso = Math.max(c.maiorAtraso, t.dias);
    }
    // Cliente só com retenção (sem fatura em aberto) também aparece
    for (const nome of retencaoPorCliente.keys()) if (!por.has(nome)) por.set(nome, { nome, valor: 0, vencido: 0, titulos: 0, maiorAtraso: 0, retido: 0 });
    for (const [nome, v] of retencaoPorCliente) por.get(nome).retido = v;
    clientes = [...por.values()].map((c) => ({ ...c, valor: round2(c.valor), vencido: round2(c.vencido), retido: round2(c.retido) })).sort((a, b) => b.valor - a.valor || b.retido - a.retido);
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
    retencoes: retencoes.slice(0, LIMITE_FATURAS),
    totalRetencoes: retencoes.length,
    retido: round2(retencoes.reduce((s, t) => s + t.valor, 0)),
    retencaoIdade: FAIXAS_IDADE.map((f) => ({ faixa: f, valor: round2(retencoes.filter((t) => t.idade === f).reduce((s, t) => s + t.valor, 0)) }))
      .filter((x) => !zero(x.valor)),
    retencaoContrato: obra && contrato ? liberacao(retencoes.reduce((s, t) => s + t.valor, 0), contrato, fim) : null,
  };
}

module.exports = { montar, situacao };
