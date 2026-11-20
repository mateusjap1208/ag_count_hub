/**
 * Novidades de cada versão publicada (mais recente primeiro).
 * build = número do build em version.json (soma +1 a cada commit).
 * Ao publicar, inclua aqui uma entrada com o build que o commit vai gerar (build atual + 1).
 * Se uma versão sair sem entrada, os usuários recebem o aviso genérico "O sistema foi atualizado".
 */
module.exports = [
  {
    build: 100,
    data: "2026-11-20",
    titulo: "Balanço na ordem da estrutura BPC",
    itens: [
      "O Balanço Patrimonial agora segue a ordem oficial da estrutura BPC (BP BPC - Class NE): no ativo, Caixa e equivalentes, aplicações financeiras, contas a receber de clientes, partes relacionadas, estoques e assim por diante; no passivo e no PL, a mesma lógica.",
      "As contas dentro de cada linha também aparecem na ordem da estrutura, e não mais pelo valor. Linhas e contas fora da estrutura ficam no fim do seu grupo.",
      "Totais, comparativo de competências e o detalhe das contas continuam iguais. Não é preciso reimportar o FGI0."
    ]
  },
  {
    build: 99,
    data: "2026-11-20",
    titulo: "Nova tela Relatórios",
    itens: [
      "Novo item Relatórios no menu, logo depois de Arrendamento: um só lugar para extrair os detalhamentos (relatórios analíticos) de cada tema, em CSV ou Excel.",
      "A extração respeita os filtros do topo (competência, empresa, obra e moeda) e mostra só os temas liberados ao seu usuário. No Estoque, dá para escolher Propriedade e Status Giro antes de baixar.",
      "As telas de cada tema ficaram mais limpas: a tabela de Detalhamento e os botões de exportação saíram de lá e agora ficam só em Relatórios."
    ]
  },
  {
    build: 97,
    data: "2026-11-20",
    titulo: "Cards de Estoque e Arrendamento",
    itens: [
      "Na Visão Geral, o card Valor em estoque passa a mostrar só o estoque próprio (sem o estoque de terceiros).",
      "O card Passivo de arrendamento agora usa o saldo contábil das contas 2159000020 (Arrendamento Mercantil Curto Prazo) + 2959000020 (Longo Prazo)."
    ]
  },
  {
    build: 96,
    data: "2026-11-18",
    titulo: "Legenda do gráfico Receita x Lucro",
    itens: [
      "Na Visão Geral, a legenda do gráfico Receita líquida x Lucro líquido agora segue a ordem do título: primeiro Receita líquida, depois Lucro líquido."
    ]
  },
  {
    build: 95,
    data: "2026-11-17",
    titulo: "Avatar ampliado",
    itens: [
      "Clique no avatar comemorativo para vê-lo grande, no centro da tela. Para voltar, use o X, a tecla Esc ou clique fora da imagem."
    ]
  },
  {
    build: 94,
    data: "2026-11-17",
    titulo: "Avatar a partir de código SVG",
    itens: [
      "No cadastro do avatar comemorativo, agora dá para colar o código SVG gerado pelo ChatGPT ou pelo Claude, além de enviar o arquivo. Uma prévia mostra como ele vai ficar antes de cadastrar."
    ]
  },
  {
    build: 93,
    data: "2026-11-17",
    titulo: "Avatar comemorativo",
    itens: [
      "Datas especiais ganham um avatar animado flutuando no canto da tela (por exemplo, uma árvore de Natal com pisca-pisca). Para tirá-lo da tela, é só clicar no X.",
      "Administradores cadastram o avatar na tela Personalizar: nome, imagem vetorial (.svg) e período de exibição."
    ]
  },
  {
    build: 92,
    data: "2026-11-17",
    titulo: "Logo acompanha a cor do menu",
    itens: [
      "O fundo da logo Andrade Gutierrez no menu lateral agora acompanha a cor do menu.",
      "A troca entre tema claro e escuro e a escolha de uma paleta em Personalizar agora acontecem com uma transição suave das cores."
    ]
  },
  {
    build: 91,
    data: "2026-11-17",
    titulo: "Menu na cor da paleta",
    itens: [
      "Ao escolher uma paleta ou uma cor principal na tela Personalizar, o menu lateral passa a usar essa cor, num tom um pouco mais forte para destacar do fundo da tela. Na cor padrão, o menu continua azul-escuro."
    ]
  },
  {
    build: 90,
    data: "2026-11-17",
    titulo: "Paletas das empresas do grupo",
    itens: [
      "Na tela Personalizar, as paletas prontas agora seguem a identidade visual de cada empresa: CONSAG, AGSA, AGCS, MOVAG e VERTIN."
    ]
  },
  {
    build: 89,
    data: "2026-11-16",
    titulo: "Auditoria de login e telas por usuário",
    itens: [
      "Datas e horários agora aparecem no horário de Brasília (antes o último acesso aparecia 3 horas adiantado).",
      "Nova tela Auditoria de login, em Administração (só administradores): cada tentativa de login fica registrada com data, hora, IP e navegador, com filtros por usuário, período e resultado.",
      "No cadastro de usuários, novo quadro Telas liberadas: o usuário de consulta vê no menu e na Visão Geral só as telas permitidas; as demais ficam bloqueadas."
    ]
  },
  {
    build: 88,
    data: "2026-11-16",
    titulo: "Velocímetros na Receita POC",
    itens: [
      "Novo quadro Execução orçamentária na aba POC da Receita, com três velocímetros: avanço da receita, avanço do custo direto e avanço do custo indireto.",
      "O ponteiro mostra quanto do orçado já foi realizado; acima de 100% a faixa fica vermelha (acima do orçado)."
    ]
  },
  {
    build: 87,
    data: "2026-11-16",
    titulo: "Seção Administração",
    itens: [
      "Administração virou uma seção do menu, igual a Relatórios e Dados, com Usuários e Mensagens."
    ]
  },
  {
    build: 86,
    data: "2026-11-16",
    titulo: "Upload no topo e menu de Administração",
    itens: [
      "Novo botão Upload ao lado de Filtros, que abre a tela de upload de relatórios.",
      "Usuários e Mensagens ficam na seção Administração do menu."
    ]
  },
  {
    build: 85,
    data: "2026-11-16",
    titulo: "Menu mais limpo",
    itens: [
      "A tela aberta no menu fica marcada só por uma linha azul, sem o fundo preenchido."
    ]
  },
  {
    build: 84,
    data: "2026-11-16",
    titulo: "Aviso de pendências animado",
    itens: [
      "O ícone de pendências alterna entre preenchido e vazado para chamar a atenção."
    ]
  },
  {
    build: 83,
    data: "2026-11-16",
    titulo: "Notificações no menu do avatar",
    itens: [
      "O sino saiu da barra superior: as notificações ficam no menu do avatar, abaixo de Sobre.",
      "Quando há notificações novas, o avatar mostra um contador."
    ]
  },
  {
    build: 82,
    data: "2026-11-16",
    titulo: "Alfinete alinhado",
    itens: [
      "O alfinete do menu fica alinhado ao centro da logo Andrade Gutierrez."
    ]
  },
  {
    build: 81,
    data: "2026-11-16",
    titulo: "Arrastar cards ficou mais fácil",
    itens: [
      "Ao arrastar um card pela alça, uma barra azul mostra onde ele vai entrar; ao soltar, ele fica nesse lugar, mesmo entre cards de tamanhos diferentes ou num espaço vazio."
    ]
  },
  {
    build: 80,
    data: "2026-11-16",
    titulo: "Visão Geral centralizada",
    itens: [
      "Na Visão Geral, os cards de números da última linha ficam centralizados."
    ]
  },
  {
    build: 79,
    data: "2026-11-16",
    titulo: "Ajustes visuais no topo e no menu",
    itens: [
      "O botão de pendências segue o visual do sino de notificações; só o ícone e o contador ficam em amarelo.",
      "Com o menu fixado, o alfinete fica branco."
    ]
  },
  {
    build: 78,
    data: "2026-11-16",
    titulo: "Maiores fornecedores e tela inteira",
    itens: [
      "Adiantamentos: novo card com os maiores adiantamentos por fornecedor (código, nome, valor e % do total).",
      "Fornecedores: novo card com os maiores fornecedores a pagar (código, nome, valor e % do total).",
      "As telas passam a usar a largura toda do monitor; em telas grandes, os gráficos ficam em 3 colunas.",
      "Estoque: corrigido o cache dos filtros Propriedade e Status Giro, que podiam mostrar o resultado de outro filtro."
    ]
  },
  {
    build: 77,
    data: "2026-11-15",
    titulo: "Login no azul da logo",
    itens: [
      "Na tela de login, o botão Entrar e o texto \"em um só lugar.\" usam o mesmo azul da logo AG."
    ]
  },
  {
    build: 76,
    data: "2026-11-15",
    titulo: "Logo AG no menu recolhido",
    itens: [
      "Com o menu recolhido, o ícone do topo passa a ser o AG da logo.",
      "A logo do menu ficou sem o contorno."
    ]
  },
  {
    build: 75,
    data: "2026-11-15",
    titulo: "Sistema no menu do avatar",
    itens: [
      "Personalizar cores, Novidades e Sobre saíram do menu lateral e agora ficam no menu do avatar, no topo."
    ]
  },
  {
    build: 74,
    data: "2026-11-15",
    titulo: "Menu azul-escuro",
    itens: [
      "O menu lateral fica sempre azul-escuro, no tema claro e no escuro.",
      "A logo Andrade Gutierrez no topo do menu ficou maior."
    ]
  },
  {
    build: 73,
    data: "2026-11-15",
    titulo: "Logo AG mais redonda",
    itens: [
      "O G da logo AG ficou mais redondo (login, ícone da aba e logo do menu)."
    ]
  },
  {
    build: 72,
    data: "2026-11-15",
    titulo: "Login errado no próprio botão",
    itens: [
      "Com e-mail ou senha errados, a mensagem aparece no próprio botão vermelho, sem o aviso em cima. Ao digitar de novo, o botão volta para Entrar."
    ]
  },
  {
    build: 71,
    data: "2026-11-15",
    titulo: "Logo Andrade Gutierrez",
    itens: [
      "O menu, a página Sobre e as telas de erro usam a logo Andrade Gutierrez no lugar da logo CONSAG.",
      "O nome do sistema passa a ser AG ContHub."
    ]
  },
  {
    build: 70,
    data: "2026-11-15",
    titulo: "Personalize as cores",
    itens: [
      "Nova tela Personalizar (no menu, em Sistema, e no menu do avatar): escolha a cor principal, os títulos, o fundo e as cores de valores positivos e negativos.",
      "Há paletas prontas para começar, prévia ao vivo e aviso quando a cor principal deixa o texto dos botões difícil de ler.",
      "As cores ficam salvas no seu usuário e valem em qualquer computador."
    ]
  },
  {
    build: 69,
    data: "2026-11-15",
    titulo: "Logo AG redesenhada",
    itens: [
      "A logo AG do login e do ícone da aba foi redesenhada em vetor, mais fiel ao original."
    ]
  },
  {
    build: 68,
    data: "2026-11-15",
    titulo: "Logo AG azul no login",
    itens: [
      "Na tela de login, a logo AG aparece só com as letras, em azul, sem o quadrado.",
      "O vídeo de fundo se esconde quando é pausado, sem mostrar os controles do YouTube."
    ]
  },
  {
    build: 67,
    data: "2026-11-15",
    titulo: "Fixar o menu",
    itens: [
      "No topo do menu, o alfinete fixa o menu aberto: ele para de abrir e fechar com o mouse e o conteúdo se ajusta ao lado. Clique de novo para soltar. A escolha fica salva neste navegador."
    ]
  },
  {
    build: 66,
    data: "2026-11-15",
    titulo: "Painel Contábil",
    itens: [
      "O subtítulo do sistema passou de Dashboard Contábil para Painel Contábil."
    ]
  },
  {
    build: 65,
    data: "2026-11-15",
    titulo: "Login errado mais claro",
    itens: [
      "Quando o e-mail ou a senha estão errados, o botão Entrar fica vermelho e balança como quem diz \"não\". Ele volta ao normal assim que você digita de novo."
    ]
  },
  {
    build: 64,
    data: "2026-11-15",
    titulo: "Logo AG em vetor",
    itens: [
      "A tela de login e o ícone da aba usam a logo AG desenhada em vetor, nítida em qualquer tamanho."
    ]
  },
  {
    build: 63,
    data: "2026-11-15",
    titulo: "Login sem erro 403 e botões com indicador",
    itens: [
      "Corrigido: ao entrar com a página de login aberta há muito tempo (ou restaurada pelo navegador), o sistema mostrava a tela de erro 403. Agora o login aparece de novo, com o e-mail preenchido.",
      "Os botões de envio mostram um indicador circular enquanto processam.",
      "Tela de login: vídeo sem botão de play e sem legenda, e o nome ContHub.",
      "Novo ícone da aba do navegador com a logo AG."
    ]
  },
  {
    build: 62,
    data: "2026-11-15",
    titulo: "Parâmetro Empresas",
    itens: [
      "O parâmetro Empresas (T001) agora pede só o código da empresa e a moeda."
    ]
  },
  {
    build: 61,
    data: "2026-11-15",
    titulo: "Menu com seções separadas",
    itens: [
      "Uma linha separa as seções do menu (Relatórios, Dados e Sistema), inclusive com o menu recolhido."
    ]
  },
  {
    build: 60,
    data: "2026-11-15",
    titulo: "Menu reorganizado",
    itens: [
      "Depois de Capital Empregado, o menu segue a ordem: Clientes, Adiantamentos, Estoque, Seguros e Garantias, Imobilizado, Fornecedores, Receita e Arrendamento."
    ]
  },
  {
    build: 59,
    data: "2026-11-15",
    titulo: "Tema no menu do usuário",
    itens: [
      "O botão de tema claro/escuro agora fica dentro do menu do avatar, no topo.",
      "No menu, a DRE aparece como Demonstração do Resultado."
    ]
  },
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
