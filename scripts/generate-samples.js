/**
 * Gera arquivos .txt de EXEMPLO com dados 100% FICTÍCIOS para testar o sistema.
 * Nenhum dado real de empresa, cliente ou fornecedor é utilizado.
 *
 * Uso: npm run samples  → cria a pasta samples/<AAAA-MM>/<empresa>_<modulo>.txt
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '..', 'samples');
const COMPANIES = [
  { code: '1000', name: 'Construtora Exemplo Alfa (fictícia)', scale: 1 },
  { code: '2000', name: 'Infraestrutura Exemplo Beta (fictícia)', scale: 0.6 },
  { code: '3000', name: 'Saneamento Exemplo Gama (fictícia)', scale: 0.35 },
];
const PERIODS = (() => {
  const out = []; const d = new Date(Date.UTC(2026, 4, 1));
  for (let i = 0; i < 6; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out; // 2026-05 .. 2026-10
})();
const OBRAS = ['Obra 101 - Rodovia', 'Obra 202 - Saneamento', 'Obra 303 - Ponte', 'Obra 404 - Edificação', 'Obra 505 - Metrô', 'Obra 606 - Barragem'];

// Gerador pseudoaleatório determinístico (mesmos arquivos a cada execução)
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const br = (n, sapNeg = false) => {
  const s = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return sapNeg ? `${s}-` : `-${s}`;
  return s;
};
const dt = (d) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const periodEnd = (p) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function write(period, company, slug, header, rows, delim = ';') {
  const dir = path.join(OUT, period);
  fs.mkdirSync(dir, { recursive: true });
  let lines;
  if (delim === '|') {
    // Simula relatório ALV do SAP: título, separadores e pipes nas bordas
    const sep = '-'.repeat(80);
    lines = [`Relatório ${slug.toUpperCase()} - Empresa ${company.code} - ${period} (DADOS FICTÍCIOS)`, sep,
      `|${header.join('|')}|`, sep, ...rows.map((r) => `|${r.join('|')}|`), sep];
  } else {
    lines = [header.join(delim), ...rows.map((r) => r.join(delim))];
  }
  fs.writeFileSync(path.join(dir, `${company.code}_${slug}.txt`), lines.join('\r\n'), 'latin1');
}

for (const [pi, period] of PERIODS.entries()) {
  const end = periodEnd(period);
  for (const c of COMPANIES) {
    const k = c.scale * (1 + pi * 0.03) * between(0.95, 1.05);
    const M = 1_000_000;

    // ---- DRE ----
    const rb = 42 * M * k;
    const dre = [
      ['3.1.01', 'Receita de obras públicas', 'Receita Bruta', rb * 0.7],
      ['3.1.02', 'Receita de obras privadas', 'Receita Bruta', rb * 0.3],
      ['3.2.01', 'ISS sobre faturamento', 'Deduções da Receita', -rb * 0.04],
      ['3.2.02', 'PIS e COFINS', 'Deduções da Receita', -rb * 0.0365],
      ['4.1.01', 'Custo de materiais aplicados', 'Custos', -rb * between(0.28, 0.33)],
      ['4.1.02', 'Custo de mão de obra direta', 'Custos', -rb * between(0.22, 0.26)],
      ['4.1.03', 'Custo de equipamentos e subempreiteiros', 'Custos', -rb * between(0.14, 0.17)],
      ['5.1.01', 'Despesas administrativas', 'Despesas Operacionais', -rb * 0.06],
      ['5.1.02', 'Despesas comerciais', 'Despesas Operacionais', -rb * 0.012],
      ['5.1.03', 'Depreciação e amortização', 'Despesas Operacionais', -rb * 0.018],
      ['6.1.01', 'Receitas financeiras', 'Resultado Financeiro', rb * 0.008],
      ['6.1.02', 'Despesas financeiras', 'Resultado Financeiro', -rb * 0.021],
    ];
    const lair = dre.reduce((a, r) => a + r[3], 0);
    dre.push(['7.1.01', 'IR e CSLL correntes', 'IR e CSLL', -Math.max(lair, 0) * 0.34]);
    write(period, c, 'dre', ['Conta', 'Descricao', 'Grupo', 'Valor'], dre.map((r) => [r[0], r[1], r[2], br(r[3], true)]));

    // ---- BP ----
    const ac = [['1.1.01', 'Caixa e equivalentes', 18], ['1.1.02', 'Clientes', 46], ['1.1.03', 'Estoques', 14], ['1.1.04', 'Adiantamentos a fornecedores', 6], ['1.1.05', 'Impostos a recuperar', 5]];
    const anc = [['1.2.01', 'Depósitos judiciais', 4], ['1.2.02', 'Imobilizado', 58], ['1.2.03', 'Intangível', 3]];
    const pc = [['2.1.01', 'Fornecedores', 31], ['2.1.02', 'Salários e encargos', 9], ['2.1.03', 'Empréstimos e financiamentos CP', 12], ['2.1.04', 'Adiantamentos de clientes', 8], ['2.1.05', 'Impostos a recolher', 5]];
    const pnc = [['2.2.01', 'Empréstimos e financiamentos LP', 28], ['2.2.02', 'Provisões para contingências', 6]];
    const v = (x) => x * M * k * between(0.93, 1.07);
    const bp = [];
    let ativo = 0; let passivo = 0;
    for (const [a, d, x] of ac) { const val = v(x); ativo += val; bp.push([a, d, 'Ativo Circulante', val]); }
    for (const [a, d, x] of anc) { const val = v(x); ativo += val; bp.push([a, d, 'Ativo Não Circulante', val]); }
    for (const [a, d, x] of pc) { const val = v(x); passivo += val; bp.push([a, d, 'Passivo Circulante', val]); }
    for (const [a, d, x] of pnc) { const val = v(x); passivo += val; bp.push([a, d, 'Passivo Não Circulante', val]); }
    const capital = 40 * M * c.scale;
    bp.push(['2.3.01', 'Capital social', 'Patrimônio Líquido', capital]);
    bp.push(['2.3.02', 'Reservas e lucros acumulados', 'Patrimônio Líquido', ativo - passivo - capital]);
    // BP em formato ALV do SAP (pipes)
    write(period, c, 'bp', ['Conta', 'Descrição', 'Grupo', 'Saldo'], bp.map((r) => [r[0], r[1], r[2], br(r[3], true)]), '|');

    // ---- Capital empregado ----
    const ce = [
      ['1.1.02', 'Clientes', 'Clientes', v(46)], ['1.1.03', 'Estoques', 'Estoques', v(14)],
      ['1.1.04', 'Adiantamentos a fornecedores', 'Adiantamentos', v(6)], ['2.1.01', 'Fornecedores', 'Fornecedores', -v(31)],
      ['1.2.02', 'Imobilizado', 'Imobilizado', v(58)], ['1.2.03', 'Intangível', 'Intangível', v(3)],
    ];
    write(period, c, 'capital-empregado', ['Conta', 'Descricao', 'Componente', 'Valor'], ce.map((r) => [r[0], r[1], r[2], br(r[3])]));

    // ---- Clientes / Fornecedores ----
    const titulos = (n, prefix, kind) => Array.from({ length: n }, (_, i) => {
      const id = 1 + Math.floor(rnd() * Math.max(6, n / 3));
      // Nome derivado do código: o mesmo código sempre corresponde ao mesmo nome
      const tipos = kind === 'cli'
        ? ['Concessionária', 'Prefeitura', 'Companhia de Saneamento', 'Governo Estadual', 'Incorporadora']
        : ['Fornecedora de Aço', 'Concreteira', 'Locadora de Equipamentos', 'Transportadora', 'Distribuidora de Combustível', 'Subempreiteira'];
      const nome = `${tipos[id % tipos.length]} Exemplo ${String(id).padStart(2, '0')}`;
      const venc = addDays(end, Math.round(rnd() < 0.65 ? between(1, 120) : between(-200, 0)));
      return [`${prefix}${String(id).padStart(5, '0')}`, nome, pick(OBRAS), `${kind === 'cli' ? 'NF' : 'DOC'}-${100000 + i}`, dt(venc), br(between(15, 900) * 1000 * c.scale)];
    });
    write(period, c, 'clientes', ['Codigo', 'Nome', 'Obra', 'Documento', 'Vencimento', 'Valor'], titulos(60, 'C', 'cli'));
    write(period, c, 'fornecedores', ['Codigo', 'Nome', 'Obra', 'Documento', 'Vencimento', 'Valor'], titulos(120, 'F', 'for'), '\t');

    // ---- Adiantamentos ----
    const adt = Array.from({ length: 35 }, (_, i) => [
      `A${String(i + 1).padStart(4, '0')}`,
      `${pick(['Fornecedor', 'Colaborador', 'Subempreiteira'])} Exemplo ${String(1 + Math.floor(rnd() * 15)).padStart(2, '0')}`,
      pick(['Fornecedores', 'Viagens', 'Salários', 'Subempreiteiros']), pick(OBRAS),
      dt(addDays(end, -Math.round(between(1, 420)))), br(between(2, 180) * 1000 * c.scale),
    ]);
    write(period, c, 'adiantamentos', ['Codigo', 'Nome', 'Tipo', 'Obra', 'Data', 'Valor'], adt);

    // ---- Estoque ----
    const mats = [['Cimento CP-II 50kg', 'Cimentos', 'SC'], ['Aço CA-50 10mm', 'Aço', 'KG'], ['Brita 1', 'Agregados', 'M3'], ['Areia média', 'Agregados', 'M3'],
      ['Óleo diesel S10', 'Combustíveis', 'L'], ['Tubo PEAD 200mm', 'Tubulações', 'M'], ['Asfalto CAP 50/70', 'Asfalto', 'T'], ['EPI - Capacete', 'EPI', 'UN'],
      ['Madeira para forma', 'Madeira', 'M3'], ['Peças de reposição', 'Manutenção', 'UN']];
    const est = [];
    mats.forEach((m, i) => OBRAS.slice(0, 4).forEach((o, j) => {
      const q = Math.round(between(10, 3000) * c.scale);
      est.push([`MAT${String(i * 10 + j).padStart(5, '0')}`, m[0], m[1], o, m[2], br(q).replace(',00', ''), br(q * between(5, 120))]);
    }));
    write(period, c, 'estoque', ['Material', 'Descricao', 'Categoria', 'Deposito', 'Unidade', 'Quantidade', 'Valor_Total'], est);

    // ---- Seguros e garantias ----
    const seg = OBRAS.flatMap((o, i) => ['Seguro Garantia', 'Risco de Engenharia', 'Responsabilidade Civil'].map((t, j) => {
      const ini = addDays(end, -Math.round(between(100, 600)));
      const fim = addDays(end, Math.round(between(-20, 400)));
      const is = between(2, 60) * M * c.scale;
      return [`AP-${c.code}-${i}${j}${pi}`, `Seguradora Exemplo ${String.fromCharCode(65 + ((i + j) % 5))}`, t, o, dt(ini), dt(fim), br(is), br(is * between(0.004, 0.012))];
    }));
    write(period, c, 'seguros-garantias', ['Apolice', 'Seguradora', 'Tipo', 'Obra', 'Inicio', 'Vencimento', 'Importancia_Segurada', 'Premio'], seg);

    // ---- Fluxo de caixa ----
    const fc = [];
    const days = end.getUTCDate();
    for (let d = 1; d <= days; d++) {
      const day = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), d));
      if ([0, 6].includes(day.getUTCDay())) continue;
      fc.push([dt(day), 'Operacional', 'Recebimento de clientes', br(between(1.6, 3.2) * M * k)]);
      fc.push([dt(day), 'Operacional', 'Pagamento a fornecedores', br(-between(0.7, 2.2) * M * k, true)]);
      if (d % 5 === 0) fc.push([dt(day), 'Operacional', 'Folha de pagamento', br(-between(1.5, 2.5) * M * k, true)]);
      if (d % 7 === 0) fc.push([dt(day), 'Investimento', 'Aquisição de equipamentos', br(-between(0.3, 1.4) * M * k, true)]);
      if (d === 15) fc.push([dt(day), 'Financiamento', 'Amortização de empréstimos', br(-between(1, 2) * M * k, true)]);
      if (d === 20 && pi % 2 === 0) fc.push([dt(day), 'Financiamento', 'Captação de empréstimo', br(between(2, 4) * M * k)]);
    }
    write(period, c, 'fluxo-caixa', ['Data', 'Atividade', 'Descricao', 'Valor'], fc);

    // ---- Imobilizado ----
    const classes = [['Máquinas pesadas', 'Escavadeira hidráulica'], ['Máquinas pesadas', 'Trator de esteira'], ['Veículos', 'Caminhão-caçamba'], ['Veículos', 'Veículo leve'],
      ['Equipamentos', 'Usina de asfalto'], ['Equipamentos', 'Betoneira'], ['Edificações', 'Galpão de apoio'], ['Informática', 'Servidores e notebooks']];
    const imob = Array.from({ length: 30 }, (_, i) => {
      const [cl, d] = classes[i % classes.length];
      const custo = between(0.1, 3.5) * M * c.scale;
      const anos = between(0.5, 8);
      return [`IM${String(i + 1).padStart(6, '0')}`, `${d} ${String(i + 1).padStart(2, '0')}`, cl, dt(addDays(end, -Math.round(anos * 365))), br(custo), br(-Math.min(custo, custo * anos * 0.1), true)];
    });
    write(period, c, 'imobilizado', ['Bem', 'Descricao', 'Classe', 'Data_Aquisicao', 'Valor_Aquisicao', 'Depreciacao_Acumulada'], imob);
  }
}

fs.writeFileSync(path.join(OUT, 'empresas.json'), JSON.stringify(COMPANIES.map(({ code, name }) => ({ code, name })), null, 2));
console.log(`Arquivos fictícios gerados em ${OUT} (${PERIODS.length} períodos × ${COMPANIES.length} empresas).`);
