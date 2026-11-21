/**
 * Visão Geral: apresentação do mês no formato de "stories" (rede social).
 * Poucos slides, um número grande e uma frase curta cada, com link para a tela onde está o detalhe.
 * Usa os mesmos serviços das telas (DRE, BP, Capital Empregado), com os filtros e permissões do usuário.
 * Slides sem dados (ou de telas não liberadas) ficam de fora.
 */
const painelDre = require('./painelDre');
const painelPatrimonial = require('./painelPatrimonial');
const temasBalanco = require('./temasBalanco');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const zero = (v) => Math.abs(v || 0) < 0.005;
const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

/** Resultado do mês (ou do ano, sem o mês anterior carregado) a partir do painel da DRE */
function resultado(dp) {
  const ult = dp.meses[dp.meses.length - 1];
  const mes = ult.temMes;
  const d = mes ? ult.mes : ult.ano;
  if (!d) return null;
  const g = d.grupos;
  const receita = (g['Receita Bruta'] || 0) + (g['Deduções da Receita'] || 0);
  const lucro = Object.values(g).reduce((a, v) => a + v, 0);
  const custos = Object.entries(d.subgrupos).filter(([k]) => k.startsWith('Custos|')).map(([k, v]) => [k.split('|')[1], v]).filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1]);
  const totalCustos = custos.reduce((a, [, v]) => a + v, 0);
  return { mes, rotulo: mes ? ult.rotulo : `jan a ${ult.rotulo}`, receita, lucro, custos, totalCustos };
}

async function montar({ scope, deps, pode, subtitulo, telas }) {
  const P = scope.period;
  if (!P) return null;
  const mesNome = MESES[Number(P.slice(5, 7)) - 1];
  const nomeMes = `${mesNome[0].toUpperCase()}${mesNome.slice(1)} ${P.slice(0, 4)}`;
  const slides = [];
  const [dp, bp, ce] = await Promise.all([
    pode('dre') ? painelDre.montar(scope, deps).catch(() => null) : null,
    pode('bp') ? painelPatrimonial.montar('bp', scope, deps).catch(() => null) : null,
    pode('capital-empregado') ? temasBalanco.montar('capital-empregado', scope, deps).catch(() => null) : null,
  ]);

  slides.push({ id: 'abertura', tema: 'abertura', sobre: 'Seu mês em 30 segundos', valor: null, texto: nomeMes, frase: subtitulo });

  const r = dp ? resultado(dp) : null;
  if (r && !zero(r.receita)) {
    slides.push({
      id: 'resultado', tema: 'resultado', sobre: 'Resultado', valor: r.lucro, formato: 'moeda',
      frase: `de ${r.lucro >= 0 ? 'lucro' : 'prejuízo'} em ${r.rotulo}, com margem de ${pct(r.lucro / r.receita)}`,
      link: '/modulos/dre', linkRotulo: 'Ver a DRE',
    });
  }
  if (r && r.custos.length && !zero(r.totalCustos)) {
    const [nome, v] = r.custos[0];
    const top = r.custos.slice(0, 3).map(([n, x]) => ({ nome: n, pct: x / r.totalCustos }));
    const resto = 1 - top.reduce((a, x) => a + x.pct, 0);
    if (resto > 0.005) top.push({ nome: 'Demais custos', pct: resto });
    slides.push({
      id: 'custos', tema: 'custos', sobre: 'Para onde foi o custo', valor: v / r.totalCustos, formato: 'pct',
      frase: `do custo de ${r.rotulo} foi com ${nome.toLowerCase()}`, barras: top,
      link: '/modulos/dre', linkRotulo: 'Ver a composição',
    });
  }
  if (bp) {
    const per = bp.periodos[bp.periodos.length - 1];
    const ant = bp.periodos.length > 1 ? bp.periodos[bp.periodos.length - 2] : null;
    const caixa = per.destaques.caixa || 0;
    const dCaixa = ant ? caixa - (ant.destaques.caixa || 0) : null;
    const dRec = ant ? (per.destaques.receber || 0) - (ant.destaques.receber || 0) : null;
    if (!zero(caixa)) {
      const partes = [];
      if (dCaixa != null && !zero(dCaixa)) partes.push(`${dCaixa > 0 ? 'subiu' : 'caiu'} ${'§'}${Math.abs(dCaixa)}§ vs ${ant.rotulo}`);
      if (dRec != null && !zero(dRec)) partes.push(`a receber ${dRec > 0 ? 'subiu' : 'caiu'} ${'§'}${Math.abs(dRec)}§`);
      slides.push({
        id: 'caixa', tema: 'caixa', sobre: 'Caixa e aplicações', valor: caixa, formato: 'moeda',
        frase: partes.length ? partes.join(' · ') : `em ${per.rotulo}`,
        link: '/modulos/bp', linkRotulo: 'Ver o Balanço',
      });
    }
  }
  if (ce && ce.liquidacao) {
    const L = ce.liquidacao;
    const rec = L.recursos.reduce((a, x) => a + (x.fixo ? 0 : x.valor * (x.realizacao / 100)), 0);
    const obr = L.obrigacoes.reduce((a, x) => a + x.valor, 0);
    if (!zero(rec) || !zero(obr)) {
      const pos = rec - obr;
      slides.push({
        id: 'liquidacao', tema: pos >= 0 ? 'positivo' : 'negativo', sobre: `${pos >= 0 ? 'Superávit' : 'Déficit'} de liquidação`, valor: Math.abs(pos), formato: 'moeda',
        frase: `obrigações de ${'§'}${obr}§ frente a recursos realizáveis de ${'§'}${rec}§`,
        link: '/modulos/capital-empregado', linkRotulo: 'Simular premissas',
      });
    }
  }
  if (dp) {
    const pontos = dp.alertas.map((a) => a.titulo);
    slides.push({
      id: 'atencao', tema: pontos.length ? 'atencao' : 'positivo', sobre: pontos.length ? 'Pontos de atenção' : 'Tudo em ordem',
      valor: pontos.length, formato: 'inteiro',
      frase: pontos.length ? `${pontos.length === 1 ? 'ponto' : 'pontos'} para olhar na contabilidade da seleção` : 'nenhum alerta contábil nesta seleção',
      chips: pontos, link: pontos.length ? '/modulos/dre' : null, linkRotulo: 'Ver os alertas',
    });
  }
  slides.push({ id: 'explorar', tema: 'explorar', sobre: 'Agora é com você', valor: null, texto: 'Explore os temas', telas });
  // Só abertura e "explorar": sem dados para contar uma história
  return slides.length > 2 ? { periodo: P, nomeMes, slides } : null;
}

module.exports = { montar };
