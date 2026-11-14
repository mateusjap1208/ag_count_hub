/**
 * Imobilizado classificado pelo Mapeamento de Contas do Capital Empregado:
 *   nível 1 = grupo da estrutura do Capital Empregado (ex.: "Imobilizado Obra", "Intangível")
 *   nível 2 = "Descrição Conta Contábil" do mapeamento (código gerencial C0000… + descrição)
 * Conta do balanço (CAP) do AR02 → mapeamento → código gerencial → estrutura do CE.
 */
const Parameter = require('../models/Parameter');

const FORA_CE = 'Fora da estrutura do Capital Empregado';
const SEM_MAPA = 'Conta sem mapeamento';

let cache = null;
async function dicionarios() {
  if (!cache || Date.now() - cache.at > 10 * 60 * 1000) {
    const mapa = new Map((await Parameter.all('mapeamento-contas').catch(() => [])).map((m) => [String(m.conta), m]));
    const ce = new Map((await Parameter.all('estrutura-ce').catch(() => [])).map((e) => [String(e.codGerencial), e]));
    cache = { at: Date.now(), mapa, ce };
  }
  return cache;
}

async function classificar(rows) {
  if (!rows.length) return null;
  const { mapa, ce } = await dicionarios();
  const grupos = new Map(); // grupo → { ordem, contas: Map(desc → totais) }
  const soma = (o, r) => { o.custo += r.custo || 0; o.dep += r.depAcumulada || 0; o.vc += r.valorContabil || 0; o.bens += 1; return o; };
  const novo = () => ({ custo: 0, dep: 0, vc: 0, bens: 0 });
  for (const r of rows) {
    const m = mapa.get(String(r.conta));
    const e = m ? ce.get(String(m.codGerencial)) : null;
    const grupo = !m ? SEM_MAPA : e ? e.grupo : FORA_CE;
    const conta = m ? `${m.codGerencial} · ${m.descGerencial || m.descricao || ''}`.trim() : `Conta ${r.conta}`;
    const g = grupos.get(grupo) || grupos.set(grupo, { ordem: e ? Number(e.ordem) || 999 : 9999, total: novo(), contas: new Map() }).get(grupo);
    if (e) g.ordem = Math.min(g.ordem, Number(e.ordem) || 999);
    soma(g.total, r);
    soma(g.contas.get(conta) || g.contas.set(conta, novo()).get(conta), r);
  }
  const lista = [...grupos].sort((a, b) => a[1].ordem - b[1].ordem || a[0].localeCompare(b[0])).map(([grupo, g]) => ({
    grupo, total: g.total,
    contas: [...g.contas].map(([conta, t]) => ({ conta, ...t })).sort((a, b) => Math.abs(b.vc) - Math.abs(a.vc)),
  }));
  const total = lista.reduce((t, g) => ({ custo: t.custo + g.total.custo, dep: t.dep + g.total.dep, vc: t.vc + g.total.vc, bens: t.bens + g.total.bens }), novo());
  return { grupos: lista, total };
}

module.exports = { classificar };
