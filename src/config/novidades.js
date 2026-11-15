/**
 * Novidades de cada versão publicada (mais recente primeiro).
 * build = número do build em version.json (soma +1 a cada commit).
 * Ao publicar, inclua aqui uma entrada com o build que o commit vai gerar (build atual + 1).
 * Se uma versão sair sem entrada, os usuários recebem o aviso genérico "O sistema foi atualizado".
 */
module.exports = [
  {
    build: 58,
    data: "2026-11-15",
    titulo: "Usuário no topo",
    itens: [
      "O avatar do usuário logado fica no topo, ao lado do botão Filtros. Clique nele para ver seu nome, perfil e sair do sistema.",
      "O menu aberto mostra Demonstração de Resultado por inteiro."
    ]
  },
  {
    build: 57,
    data: "2026-11-15",
    titulo: "Menu",
    itens: [
      "No menu, a DRE aparece como Demonstração de Resultado.",
      "O menu aberto ficou mais largo para mostrar os nomes inteiros."
    ]
  },
  {
    build: 56,
    data: "2026-11-15",
    titulo: "Parâmetros: importar nunca apaga",
    itens: [
      "Subir um arquivo de parâmetro só incrementa a tabela: inclui os registros novos e atualiza os campos preenchidos dos que já existem. Nada é apagado.",
      "Para corrigir ou excluir um registro, use Parâmetros › Consultar."
    ]
  },
  {
    build: 55,
    data: "2026-11-15",
    titulo: "Parâmetros: arquivo completa a tabela",
    itens: [
      "Ao subir um arquivo de parâmetro (como o Plano de Contas), ele agora completa a tabela: inclui o que falta e atualiza o que já existe, sem apagar o resto. Para trocar a tabela inteira, marque \"Substituir a tabela inteira\".",
      "Em Pendências e no popup de vínculo, contas que já estão classificadas no cadastro aparecem como \"Já cadastrada · reimportar FGI0\"."
    ]
  },
  {
    build: 54,
    data: "2026-11-15",
    titulo: "Contas de resultado com mais de uma classificação",
    itens: [
      "Ao vincular uma conta de resultado (começa com 4 ou 5), você pode escolher uma classificação para cada categoria da DRE, como Custos e Despesas Gerais e Administrativas. Na importação do FGI0, a área funcional decide qual vale: Z001 e Z002 viram Despesa; Z003, Z004, Z005 ou vazia viram Custo.",
      "Contas de balanço agora são vinculadas pelo Mapeamento de Contas, que define a linha do BP e do Capital Empregado.",
      "Na DRE, a linha de detalhe de contas com mais de uma classificação passa a seguir a classificação escolhida pela área funcional (vale a partir da próxima importação do FGI0)."
    ]
  },
  {
    build: 53,
    data: '2026-11-15',
    titulo: 'Vincular contas a classificar',
    itens: ['Na lista de contas do olho (linhas "a classificar" do BP e da DRE) e na tela de Pendências, o administrador clica na conta e a vincula a uma conta parecida já classificada no Plano de Contas e no Mapeamento de Contas.'],
  },
  {
    build: 52,
    data: '2026-11-15',
    titulo: 'Filtros organizados',
    itens: ['O painel de filtros abre só ao clicar no botão, e cada lista de seleção abre uma de cada vez.'],
  },
  {
    build: 51,
    data: '2026-11-15',
    titulo: 'Confirmações com a cara do sistema',
    itens: ['As confirmações (como excluir um registro) e os avisos agora aparecem num popup do próprio sistema, e não na janela padrão do navegador.'],
  },
  {
    build: 50,
    data: '2026-11-15',
    titulo: 'Menu',
    itens: ['No menu, a DRE aparece como Demo do Resultado.'],
  },
  {
    build: 49,
    data: '2026-11-15',
    titulo: 'Edição dos parâmetros',
    itens: ['Em Parâmetros › Consultar, os registros podem ser editados, excluídos e incluídos direto na tela.'],
  },
  {
    build: 48,
    data: '2026-11-15',
    titulo: 'Caminhão novo na obra',
    itens: ['Na animação da página de erro, o caminhão cheio vai embora e chega outro vazio.'],
  },
  {
    build: 46,
    data: '2026-11-15',
    titulo: 'Página de erro com obra',
    itens: ['Quando o servidor tiver um problema, a página de erro mostra uma retroescavadeira enchendo a caçamba de um caminhãozinho.'],
  },
  {
    build: 45,
    data: '2026-11-15',
    titulo: 'Menu com nomes completos',
    itens: ['BP e DRE aparecem no menu como Balanço Patrimonial e Demonstração do Resultado.'],
  },
  {
    build: 44,
    data: '2026-11-15',
    titulo: 'Indicadores em velocímetro',
    itens: ['Cada indicador agora aparece num velocímetro: do vermelho (crítico) ao verde-escuro (saudável), com o ponteiro no valor.'],
  },
  {
    build: 43,
    data: '2026-11-15',
    titulo: 'Filtros múltiplos, Indicadores e Pendências',
    itens: [
      'Filtros: escolha várias estruturas, siglas, empresas e centros de lucro ao mesmo tempo.',
      'Visão Geral: novos cards de passivo de arrendamento, adiantamentos, seguros a apropriar e imobilizado.',
      'Novo menu Indicadores (após a DRE): liquidez, rentabilidade e estrutura de capital.',
      'Administradores: alerta de pendências (contas a classificar, parâmetros e obras sem cadastro).',
    ],
  },
  {
    build: 42,
    data: '2026-11-14',
    titulo: 'Cards da Medição',
    itens: ['Receita › Medição: cards na ordem receita do mês, medição acumulada, faturamento do período e acumulado, medido não faturado (SAR) e saldo a medir.'],
  },
  {
    build: 41,
    data: '2026-11-14',
    titulo: 'Imobilizado pelo Mapeamento de Contas',
    itens: ['Novo quadro no Imobilizado: bens classificados pelo grupo do Capital Empregado e pela Descrição Conta Contábil do mapeamento.', 'Abas da Receita renomeadas para POC e Medição.'],
  },
  {
    build: 39,
    data: '2026-11-14',
    titulo: 'Alça em todos os cards',
    itens: ['Na Visão Geral, gráficos e o Status da carga também podem ser reorganizados, num grupo só.'],
  },
  {
    build: 38,
    data: '2026-11-14',
    titulo: 'Fluxo de apropriação em linha do tempo',
    itens: [
      'Seguros e Garantias: o fluxo mensal de apropriação virou uma linha do tempo horizontal, com o realizado, a competência e o que falta apropriar.',
      'As alças para reorganizar os quadros ficam sempre visíveis.',
    ],
  },
  {
    build: 37,
    data: '2026-11-14',
    titulo: 'Todos os quadros reorganizáveis',
    itens: ['Além de cards e gráficos, os quadros (conta 2115100020, demonstrações, linha do tempo, detalhamento) também podem mudar de lugar pela alça no topo de cada um.'],
  },
  {
    build: 36,
    data: '2026-11-14',
    titulo: 'Organize as suas telas',
    itens: ['Arraste os cards de indicadores e os gráficos pela alça (⋮⋮) para deixá-los na ordem que preferir. A ordem fica salva no seu usuário.'],
  },
  {
    build: 35,
    data: '2026-11-14',
    titulo: 'Detalhamento paginado e correção',
    itens: [
      'Tabela de detalhamento com páginas numeradas, primeira/última e escolha de linhas por página; carrega só quando aparece na tela.',
      'Corrigido: BP, Capital Empregado e demais quadros voltaram a expandir os grupos.',
    ],
  },
  {
    build: 34,
    data: '2026-11-14',
    titulo: 'Carregamento mais claro',
    itens: ['Ao trocar de tela ou de filtro, aparece o desenho da página com um brilho em movimento enquanto os dados carregam.'],
  },
  {
    build: 33,
    data: '2026-11-14',
    titulo: 'Ajustes visuais',
    itens: ['Login com a marca "AG" em destaque; versão centralizada no rodapé do menu.'],
  },
  {
    build: 32,
    data: '2026-11-14',
    titulo: 'Tela Sobre',
    itens: ['Desenvolvedores com foto, GitHub e e-mail na tela Sobre.'],
  },
  {
    build: 31,
    data: '2026-11-14',
    titulo: 'Uploads mais leves',
    itens: ['Os relatórios enviados passam a ser gravados só com o necessário, deixando o banco mais leve e as consultas mais rápidas.'],
  },
  {
    build: 30,
    data: '2026-11-14',
    titulo: 'Banco de dados mais leve',
    itens: ['Estoque guardado de forma mais enxuta no banco, sem mudar nenhum valor das telas.'],
  },
  {
    build: 29,
    data: '2026-11-14',
    titulo: 'Pedidos de compra e atribuições',
    itens: [
      'Fornecedores: conta 2115100000 por pedido de compra, com o fornecedor do lançamento ou do EKKO, data do lançamento e montante.',
      'Arrendamento: conta 2115100020 por Atribuição, só com as atribuições que não zeram.',
      'Dados de fornecedores guardados de forma mais enxuta no banco.',
    ],
  },
  {
    build: 27,
    data: '2026-11-14',
    titulo: 'Demonstrações recolhidas',
    itens: ['BP, Capital Empregado e Adiantamentos abrem recolhidos; o botão mostra "Expandir tudo" ou "Recolher tudo" conforme o que está aberto.'],
  },
  {
    build: 26,
    data: '2026-11-14',
    titulo: 'Rodapé do menu',
    itens: ['Com o menu aberto, o botão Sair fica ao lado do seu nome e a versão do sistema aparece logo abaixo.'],
  },
  {
    build: 25,
    data: '2026-11-14',
    titulo: 'Menu mais enxuto',
    itens: ['O Fluxo de Caixa saiu do menu.'],
  },
  {
    build: 24,
    data: '2026-11-14',
    titulo: 'Olho à direita do valor',
    itens: ['No BP, na DRE, no Capital Empregado e em Adiantamentos, o olho das contas fica à direita do número, com os valores alinhados.'],
  },
  {
    build: 23,
    data: '2026-11-14',
    titulo: 'Tema no topo da tela',
    itens: ['O botão de tema claro/escuro foi para o topo, ao lado do sino: sol no tema claro e lua no tema escuro, com animação na troca.'],
  },
  {
    build: 22,
    data: '2026-11-14',
    titulo: 'Faixa de avisos repaginada',
    itens: ['A faixa de avisos do rodapé virou um card com cantos arredondados, alinhado com o menu.'],
  },
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
