/**
 * Novidades de cada versão publicada (mais recente primeiro).
 * build = número do build em version.json (soma +1 a cada commit).
 * Ao publicar, inclua aqui uma entrada com o build que o commit vai gerar (build atual + 1).
 * Se uma versão sair sem entrada, os usuários recebem o aviso genérico "O sistema foi atualizado".
 */
module.exports = [
  {
    build: 21,
    data: '2026-11-14',
    titulo: 'Adiantamentos, estoque próprio e gráficos novos',
    itens: [
      'Adiantamentos agora vêm do FGI0: adiantamentos e antecipações a fornecedores e subempreiteiros, e adiantamentos a funcionários.',
      'Estoque separado em estoque próprio e estoque de terceiros (classe "Materiais de Terceiros"), com filtro e cards.',
      'Seguros e Garantias: linha do tempo de cada contrato, mês a mês, com o quanto já foi apropriado.',
      'Gráficos com degradê, animações, rosca com total no centro e áreas para evolução no tempo.',
      'Som de aviso quando chega uma nova versão e tela de login com o título "AG Cont Hub" acima do texto.',
    ],
  },
  {
    build: 20,
    data: '2026-11-14',
    titulo: 'Cards de Clientes',
    itens: ['Saiu o card "Vencido"; ativo e passivo de contrato (CPC 47) passaram a se chamar SAR e SAD.'],
  },
  {
    build: 19,
    data: '2026-11-14',
    titulo: 'Avisos no rodapé e conta 2115100020 no Arrendamento',
    itens: [
      'Faixa de avisos passando no rodapé de todas as telas (ex.: fechamento em andamento), cadastrada pelos administradores em "Mensagens".',
      'Arrendamento: quadro da conta 2115100020 (medições × parcelas pagas) por Atribuição, só com as atribuições que não zeram.',
    ],
  },
  {
    build: 18,
    data: '2026-11-14',
    titulo: 'Olho que mostra as contas',
    itens: [
      'No BP, na DRE e no Capital Empregado, passe o mouse no olho ao lado do valor para ver as contas contábeis que o formam.',
      'Os cards de indicadores ficaram sem a faixa colorida e "levantam" ao passar o mouse.',
    ],
  },
  {
    build: 17,
    data: '2026-11-14',
    titulo: 'Nova tela de login',
    itens: ['A apresentação do sistema passou para o lado do formulário de entrada, e o vídeo de fundo ficou sem legendas.'],
  },
  {
    build: 16,
    data: '2026-11-14',
    titulo: 'Avisos de atualização',
    itens: [
      'Sempre que uma nova versão for publicada, você recebe um aviso com as novidades.',
      'Sininho no topo das telas e página "Novidades" no menu, com o histórico das versões.',
    ],
  },
  {
    build: 15,
    data: '2026-11-14',
    titulo: 'Vídeo na tela de login',
    itens: ['Vídeo institucional como fundo do lado esquerdo da tela de login.'],
  },
  {
    build: 14,
    data: '2026-11-14',
    titulo: 'BP e DRE comparativos',
    itens: [
      'Cada linha do BP e da DRE abre as contas contábeis que a compõem.',
      'Botão "Comparar" para ver até 3 competências lado a lado, com variação e %.',
    ],
  },
  {
    build: 13,
    data: '2026-11-14',
    titulo: 'Ajustes na tela de login',
    itens: ['Ícones das redes sociais em linha e telas sempre com o visual mais recente após cada atualização.'],
  },
  {
    build: 12,
    data: '2026-11-14',
    titulo: 'Nova ordem dos indicadores',
    itens: ['Visão Geral: Ativo, Passivo + PL, Receita líquida, Lucro líquido, Capital empregado e Valor em estoque.'],
  },
  {
    build: 11,
    data: '2026-11-14',
    titulo: 'Filtros recolhidos',
    itens: ['Os filtros ficam no botão de funil à direita do título e se abrem ao passar o mouse.'],
  },
  {
    build: 10,
    data: '2026-11-14',
    titulo: 'Redes sociais no login',
    itens: ['Botões de LinkedIn, Instagram, Facebook, YouTube e TikTok na tela de login.'],
  },
  {
    build: 9,
    data: '2026-11-14',
    titulo: 'Tela Sobre',
    itens: ['Nova tela "Sobre" no menu, com a versão do sistema e os desenvolvedores.'],
  },
  {
    build: 8,
    data: '2026-11-14',
    titulo: 'Clientes, Fornecedores e Seguros',
    itens: [
      'Clientes e Fornecedores a partir do FAGLL03, com aging e composição do saldo.',
      'Seguros e Garantias com o fluxo mensal de apropriação dos prêmios.',
      'Versão do sistema no login e no menu.',
    ],
  },
];
