/* AG Cont Hub — scripts de interface (sem inline scripts, compatível com CSP) */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- Popups do sistema (substituem confirm/alert do navegador) ----------
     confirmar({ titulo, texto, ok, cancelar, perigo }) → Promise<boolean>
     aviso({ titulo, texto, ok }) → Promise<void> */
  function popup({ titulo, texto, ok = 'OK', cancelar = null, perigo = false, icone = perigo ? 'perigo' : 'info' }) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = `modal popup popup-${icone}`;
      d.setAttribute('aria-labelledby', 'popup-titulo');
      const ic = document.createElement('div');
      ic.className = 'popup-icone';
      ic.setAttribute('aria-hidden', 'true');
      ic.innerHTML = icone === 'perigo'
        ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>'
        : '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg>';
      const h = document.createElement('h2');
      h.id = 'popup-titulo';
      h.textContent = titulo || 'Atenção';
      const p = document.createElement('p');
      p.textContent = texto || '';
      const acoes = document.createElement('div');
      acoes.className = 'modal-actions popup-acoes';
      const fechar = (valor) => { d.close(); d.remove(); resolve(valor); };
      if (cancelar) {
        const bc = document.createElement('button');
        bc.type = 'button'; bc.className = 'btn btn-ghost'; bc.textContent = cancelar;
        bc.addEventListener('click', () => fechar(false));
        acoes.append(bc);
      }
      const bo = document.createElement('button');
      bo.type = 'button'; bo.className = `btn ${perigo ? 'btn-perigo' : 'btn-primary'}`; bo.textContent = ok;
      bo.addEventListener('click', () => fechar(true));
      acoes.append(bo);
      d.append(ic, h, p, acoes);
      d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(false); }); // Esc = cancelar
      d.addEventListener('click', (e) => { if (e.target === d) fechar(false); }); // clique fora
      document.body.append(d);
      d.showModal();
      (cancelar ? acoes.firstChild : bo).focus(); // em ações destrutivas o foco começa em "Cancelar"
    });
  }
  const confirmar = (o) => popup({ cancelar: 'Cancelar', ok: 'Confirmar', ...o });
  const aviso = (o) => popup({ ok: 'Entendi', ...o }).then(() => {});
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // Paleta CONSAG (principal + apoio + mídias digitais). No tema escuro, os tons escuros
  // (azul-escuro e cinza-azulado) são trocados por tons claros da mesma paleta para manter contraste.
  const PALETTE_LIGHT = ['#3074F6', '#06172B', '#00A1D4', '#2D758E', '#69A2C2', '#283344', '#74C9E5', '#777777', '#FDB913', '#F37021', '#1D5050'];
  const PALETTE_DARK = ['#3074F6', '#74C9E5', '#00A1D4', '#69A2C2', '#2D758E', '#DEDCCF', '#16BECF', '#C0BDA8', '#FDB913', '#F37021', '#009360'];
  let PALETTE = PALETTE_LIGHT;
  let NEG = '#D2232A';
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  /* ---------- Tema claro/escuro ---------- */
  const themeBtn = $('#theme-toggle');
  const syncThemeLabel = () => {
    if (!themeBtn) return;
    const texto = isDark() ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    themeBtn.title = texto;
    themeBtn.setAttribute('aria-label', texto);
    themeBtn.setAttribute('aria-pressed', String(isDark()));
    const rotulo = themeBtn.querySelector('.tema-texto');
    if (rotulo) rotulo.textContent = isDark() ? 'Tema claro' : 'Tema escuro';
  };
  if (themeBtn && window.agchTheme) {
    themeBtn.addEventListener('click', () => { window.agchTheme.toggle(); });
    document.addEventListener('themechange', syncThemeLabel);
    syncThemeLabel();
  }

  // Formatadores de moeda por código (BRL, USD, ARS…) — os relatórios do FGI0 podem estar em várias moedas
  const fmtCache = new Map();
  const moneyFmt = (code = 'BRL', compact = false) => {
    const k = `${code}|${compact}`;
    if (!fmtCache.has(k)) {
      const opts = { style: 'currency', currency: code || 'BRL', ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) };
      try { fmtCache.set(k, new Intl.NumberFormat('pt-BR', opts)); } catch { fmtCache.set(k, new Intl.NumberFormat('pt-BR', { ...opts, currency: 'BRL' })); }
    }
    return fmtCache.get(k);
  };
  const num = new Intl.NumberFormat('pt-BR');
  const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

  /* ---------- Menu lateral (mobile) ---------- */
  const toggle = $('#menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', (e) => { e.stopPropagation(); document.body.classList.toggle('nav-open'); });
    document.addEventListener('click', (e) => {
      if (document.body.classList.contains('nav-open') && !e.target.closest('#sidebar')) document.body.classList.remove('nav-open');
    });
  }

  // Mantém o item ativo visível quando o menu tem rolagem (telas mais baixas)
  const activeItem = $('.nav .nav-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });

  /* ---------- Filtros (empresa / período) ---------- */
  /* ---------- Ordem dos cards e gráficos escolhida pelo usuário (salva nas preferências) ----------
     Cada grupo marcado com data-ordenavel pode ser reorganizado: arrastando pela alça (⋮⋮) ou,
     com a alça em foco, pelas setas do teclado. A ordem é salva no usuário e vale em qualquer computador. */
  const prefsEl = document.getElementById('user-prefs');
  const prefs = prefsEl ? JSON.parse(prefsEl.textContent) : { ordem: {} };
  const telaChave = (grupo) => `${location.pathname.replace(/[^a-z0-9-]+/gi, '_')}:${grupo}`;
  const chaveDe = (el) => el.dataset.ordemChave;
  const salvarOrdem = async (box, ordem) => {
    try {
      await fetch('/api/preferencias/ordem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': prefs.csrf || '' },
        body: JSON.stringify({ chave: telaChave(box.dataset.ordenavel), ordem }),
      });
    } catch { /* sem rede: a ordem vale até recarregar */ }
  };
  const restaurarBtn = (box) => {
    let b = box.nextElementSibling;
    if (!b || !b.classList.contains('ordem-restaurar')) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'ordem-restaurar';
      b.textContent = 'Restaurar ordem padrão';
      b.addEventListener('click', () => {
        const padrao = JSON.parse(box.dataset.ordemPadrao || '[]');
        padrao.forEach((k) => { const el = [...box.children].find((x) => chaveDe(x) === k); if (el) box.append(el); });
        salvarOrdem(box, null);
        b.remove();
      });
      box.after(b);
    }
  };
  $$('[data-ordenavel]').forEach((box) => {
    const itens = () => [...box.children].filter((x) => x.dataset.ordemChave !== undefined);
    box.dataset.ordemPadrao = JSON.stringify(itens().map(chaveDe));
    // 1) aplica a ordem salva. Itens novos (que não estavam na ordem salva, ex.: cards lançados depois)
    //    entram na posição padrão: antes do primeiro item salvo que vem depois deles na ordem padrão.
    const salva = (prefs.ordem || {})[telaChave(box.dataset.ordenavel)];
    if (Array.isArray(salva) && salva.length) {
      const padrao = JSON.parse(box.dataset.ordemPadrao);
      const ordem = salva.filter((k) => padrao.includes(k));
      padrao.forEach((k, i) => {
        if (ordem.includes(k)) return;
        const proximo = padrao.slice(i + 1).find((x) => ordem.includes(x));
        if (proximo) ordem.splice(ordem.indexOf(proximo), 0, k); else ordem.push(k);
      });
      ordem.forEach((k) => { const el = itens().find((x) => chaveDe(x) === k); if (el) box.append(el); });
      restaurarBtn(box);
    }
    const mudou = () => { salvarOrdem(box, itens().map(chaveDe)); restaurarBtn(box); };
    // 2) alça de arrastar em cada item
    itens().forEach((item) => {
      const alca = document.createElement('button');
      alca.type = 'button';
      alca.className = 'ordem-alca';
      alca.title = 'Arraste para mudar a ordem (ou use as setas do teclado)';
      alca.setAttribute('aria-label', `Mover "${(item.querySelector('h2, .label')?.textContent || chaveDe(item)).trim()}" (setas para mudar a posição)`);
      alca.innerHTML = '<svg viewBox="0 0 24 12" width="20" height="10" aria-hidden="true"><circle cx="6" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/><circle cx="18" cy="3" r="1.6"/><circle cx="6" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="18" cy="9" r="1.6"/></svg>';
      alca.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      alca.addEventListener('pointerdown', () => { item.draggable = true; });
      alca.addEventListener('keydown', (e) => {
        const antes = ['ArrowLeft', 'ArrowUp'].includes(e.key);
        const depois = ['ArrowRight', 'ArrowDown'].includes(e.key);
        if (!antes && !depois) return;
        e.preventDefault();
        const lista = itens();
        const i = lista.indexOf(item);
        const alvo = lista[antes ? i - 1 : i + 1];
        if (!alvo) return;
        if (antes) box.insertBefore(item, alvo); else box.insertBefore(alvo, item);
        alca.focus();
        mudou();
      });
      item.classList.add('ordenavel-item');
      item.prepend(alca);
      item.addEventListener('dragstart', (e) => {
        item.classList.add('arrastando');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', chaveDe(item)); } catch { /* alguns navegadores */ }
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('arrastando');
        item.draggable = false;
        limparMarca();
      });
    });
    // Enquanto arrasta, nada muda de lugar: uma barra mostra onde o card vai entrar (antes/depois do card
    // mais próximo do cursor, inclusive em espaço vazio). Ao soltar, o card vai para lá e a ordem é salva.
    let destino = null; // { alvo, depois }
    const limparMarca = () => {
      $$('.ordem-marca-antes, .ordem-marca-depois', box).forEach((x) => x.classList.remove('ordem-marca-antes', 'ordem-marca-depois', 'ordem-marca-vertical'));
      destino = null;
    };
    const maisProximo = (x, y, arrastando) => {
      const larguraBox = box.getBoundingClientRect().width;
      let melhor = null;
      for (const el of itens()) {
        if (el === arrastando) continue;
        const r = el.getBoundingClientRect();
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = Math.hypot(dx, dy);
        if (!melhor || d < melhor.d) melhor = { el, r, d };
      }
      if (!melhor) return null;
      const { el, r } = melhor;
      // card que ocupa a linha inteira: antes/depois pela altura; os demais, pela lateral
      const largo = r.width > larguraBox * 0.6;
      let depois;
      if (y > r.bottom) depois = true;
      else if (y < r.top) depois = false;
      else depois = largo ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      return { alvo: el, depois, vertical: largo || y > r.bottom || y < r.top };
    };
    box.addEventListener('dragover', (e) => {
      const arrastando = $('.arrastando', box);
      if (!arrastando) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const d = maisProximo(e.clientX, e.clientY, arrastando);
      if (!d) return;
      if (destino && destino.alvo === d.alvo && destino.depois === d.depois) return;
      limparMarca();
      destino = d;
      d.alvo.classList.add(d.depois ? 'ordem-marca-depois' : 'ordem-marca-antes');
      if (d.vertical) d.alvo.classList.add('ordem-marca-vertical');
    });
    box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) limparMarca(); });
    box.addEventListener('drop', (e) => {
      const arrastando = $('.arrastando', box);
      if (!arrastando) return;
      e.preventDefault();
      const d = destino || maisProximo(e.clientX, e.clientY, arrastando);
      limparMarca();
      if (!d) return;
      const antes = itens().map(chaveDe).join();
      box.insertBefore(arrastando, d.depois ? d.alvo.nextSibling : d.alvo);
      if (itens().map(chaveDe).join() !== antes) mudou();
    });
  });
  // Os gráficos se ajustam ao novo tamanho do card depois de mudar de lugar
  document.addEventListener('dragend', () => { if (window.Chart) Object.values(Chart.instances).forEach((c) => c.resize()); });

  /* ---------- Carregamento de página: esqueleto com brilho (shimmer) enquanto a próxima página chega ----------
     As páginas são montadas no servidor; entre o clique e a resposta, a área de conteúdo mostra o
     "desenho" de cards, gráficos e tabela, para deixar claro que está carregando. */
  const conteudo = $('.main > .content');
  const bloco = (cls) => { const d = document.createElement('div'); d.className = `sk ${cls}`; return d; };
  const mostrarCarregando = (titulo) => {
    if (!conteudo || document.body.classList.contains('carregando-pagina')) return;
    const sk = document.createElement('div');
    sk.className = 'skeleton-page';
    sk.setAttribute('role', 'status');
    sk.setAttribute('aria-live', 'polite');
    const aviso = document.createElement('span');
    aviso.className = 'sr-only';
    aviso.textContent = `Carregando${titulo ? ' ' + titulo : ''}…`;
    const kpis = bloco('sk-grid');
    for (let i = 0; i < 4; i += 1) {
      const c = bloco('sk-card');
      c.append(bloco('sk-line sk-w40'), bloco('sk-line sk-big sk-w70'), bloco('sk-line sk-w55'));
      kpis.append(c);
    }
    const graficos = bloco('sk-duo');
    for (let i = 0; i < 2; i += 1) {
      const c = bloco('sk-card sk-chart');
      c.append(bloco('sk-line sk-w40'));
      const barras = bloco('sk-bars');
      [62, 85, 48, 92, 70, 55, 78].forEach((h) => { const b = bloco('sk-bar'); b.style.setProperty('--h', `${h}%`); barras.append(b); });
      c.append(barras);
      graficos.append(c);
    }
    const tabela = bloco('sk-card sk-table');
    tabela.append(bloco('sk-line sk-w30'));
    for (let i = 0; i < 6; i += 1) {
      const linha = bloco('sk-row');
      linha.append(bloco('sk-line sk-w35'), bloco('sk-line sk-w20'), bloco('sk-line sk-w15'));
      tabela.append(linha);
    }
    sk.append(aviso, kpis, graficos, tabela);
    conteudo.prepend(sk);
    // Título do topo já mostra a página de destino
    const h1 = $('.topbar h1');
    const sub = $('.topbar .subtitle');
    if (titulo && h1) h1.textContent = titulo;
    if (sub) sub.textContent = 'Carregando…';
    document.body.classList.add('carregando-pagina');
    window.scrollTo({ top: 0 });
  };
  const esconderCarregando = () => {
    document.body.classList.remove('carregando-pagina');
    $$('.skeleton-page').forEach((e) => e.remove());
  };
  // Voltar/avançar do navegador pode restaurar a página do cache: tira o esqueleto
  window.addEventListener('pageshow', (e) => { if (e.persisted) esconderCarregando(); });

  /** Link interno que realmente troca de página (não abre aba, não baixa arquivo, não é âncora) */
  const navegaNaMesmaAba = (a, e) => {
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download') || a.dataset.semCarregando !== undefined) return false;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    let url;
    try { url = new URL(href, location.href); } catch { return false; }
    if (url.origin !== location.origin) return false;
    if (/\/(exportar|modelo)|\.(csv|xlsx|txt)$/i.test(url.pathname)) return false; // downloads
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return true;
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!navegaNaMesmaAba(a, e)) return;
    // Destaca já no menu o item clicado
    if (a.classList.contains('nav-item')) {
      $$('.sidebar .nav-item.active').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
    }
    mostrarCarregando(a.textContent.trim());
  });
  // Formulários de consulta (GET), como filtros e "Comparar"
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!e.defaultPrevented && (f.method || 'get').toLowerCase() === 'get' && !f.target) mostrarCarregando();
  });

  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => { mostrarCarregando(); el.form.submit(); }));

  /* ---------- Botão de envio mostra um indicador circular enquanto processa ---------- */
  document.addEventListener('submit', (e) => {
    if (e.defaultPrevented) return;
    const f = e.target;
    const btn = e.submitter || f.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
    if (!btn || btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    setTimeout(() => { btn.disabled = true; }); // depois do envio, para o valor do botão ir junto
  });
  // Voltar pelo histórico (página restaurada do cache): botões liberados de novo
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    // A tela de login restaurada traz um token antigo: recarrega para pegar um novo
    if (document.getElementById('login-form')) { window.location.reload(); return; }
    $$('.is-busy').forEach((b) => { b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); b.disabled = false; });
  });

  /* ---------- Login errado: botão vermelho volta ao normal quando a pessoa digita de novo ---------- */
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn && loginBtn.classList.contains('btn-nao')) {
    const limpar = () => { loginBtn.classList.remove('btn-nao'); loginBtn.textContent = 'Entrar'; };
    ['email', 'password'].forEach((id) => document.getElementById(id)?.addEventListener('input', limpar, { once: true }));
    document.getElementById('password')?.focus();
  }

  /* ---------- Vídeo do login: só aparece quando está tocando (nunca mostra o botão de play) ---------- */
  const video = document.getElementById('login-video');
  if (video) {
    const ouvir = () => { try { video.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'login', channel: 'widget' }), '*'); } catch { /* ignore */ } };
    video.addEventListener('load', ouvir);
    const t = setInterval(ouvir, 1000);
    setTimeout(() => clearInterval(t), 15000);
    window.addEventListener('message', (e) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
      let d;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const estado = d?.info?.playerState;
      if (estado === 1 && !video.classList.contains('tocando')) {
        clearInterval(t);
        clearTimeout(video._mostrar);
        video._mostrar = setTimeout(() => video.classList.add('tocando'), 1200); // pula a faixa de título do início
      } else if (estado === 2 || estado === -1 || estado === 5) {
        // pausado (aba em segundo plano, economia de bateria…): esconde para não mostrar os controles do YouTube
        clearTimeout(video._mostrar);
        video.classList.remove('tocando');
      }
    });
  }

  /* ---------- Faixa de avisos do rodapé: velocidade constante, qualquer que seja o tamanho do texto ---------- */
  const ticker = $('[data-ticker]');
  if (ticker) {
    const ajustar = () => {
      const largura = ticker.firstElementChild.getBoundingClientRect().width;
      ticker.style.setProperty('--ticker-dur', `${Math.max(12, largura / 70)}s`); // ~70 px por segundo
    };
    ajustar();
    window.addEventListener('resize', ajustar);
  }

  /* ---------- Som de aviso quando chega uma nova versão ----------
     Toca uma vez por versão neste navegador (não repete a cada troca de tela). O navegador só libera som
     depois de alguma interação: se estiver bloqueado, toca no primeiro clique ou tecla da pessoa. */
  const toastVersao = document.getElementById('notif-toast');
  if (toastVersao && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const versao = toastVersao.dataset.versao || '';
    let jaTocou = false;
    try { jaTocou = localStorage.getItem('agch.somVersao') === versao; } catch { /* armazenamento indisponível */ }
    const tocar = async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* bloqueado */ } }
      if (ctx.state !== 'running') { ctx.close(); return false; }
      // "Plim" suave: duas notas curtas (Mi e Lá), volume baixo
      [[659.25, 0], [880, 0.14]].forEach(([freq, atraso]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const t = ctx.currentTime + atraso;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.5);
      });
      setTimeout(() => ctx.close(), 900);
      try { localStorage.setItem('agch.somVersao', versao); } catch { /* sem armazenamento: pode tocar de novo */ }
      return true;
    };
    if (!jaTocou) {
      tocar().then((ok) => {
        if (ok) return;
        const naInteracao = () => { tocar(); window.removeEventListener('pointerdown', naInteracao); window.removeEventListener('keydown', naInteracao); };
        window.addEventListener('pointerdown', naInteracao, { once: true });
        window.addEventListener('keydown', naInteracao, { once: true });
      });
    }
  }

  /* ---------- Aviso de nova versão: "Entendi" marca como visto sem recarregar a página ---------- */
  const notifForm = $('[data-notif-form]');
  if (notifForm) {
    notifForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const toast = document.getElementById('notif-toast');
      try {
        const r = await fetch(notifForm.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(notifForm)),
        });
        if (!r.ok) throw new Error();
        toast.classList.add('saindo');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 400);
        // Notificações vistas: some o contador do avatar e do item "Notificações"
        $('.user-badge')?.remove();
        $('.user-notif .user-novo')?.remove();
      } catch { notifForm.submit(); }
    });
  }

  /* ---------- Painel de filtros: abre ao passar o mouse (CSS); o clique fixa/solta, Esc e clique fora fecham ---------- */
  /* ---------- Avatar comemorativo flutuante: aparece até a pessoa fechar (lembrado neste navegador) ---------- */
  const avatarBox = document.getElementById('avatar-flutuante');
  if (avatarBox) {
    const chave = `agch-avatar-fechado-${avatarBox.dataset.avatarId}`;
    let fechado = false;
    try { fechado = localStorage.getItem(chave) === '1'; } catch { /* sem armazenamento: mostra sempre */ }
    if (!fechado) avatarBox.hidden = false;
    // Clique no avatar: abre ampliado no centro da tela (Esc, X ou clique fora fecham)
    const zoom = document.getElementById('avatar-zoom');
    if (zoom?.showModal) {
      avatarBox.querySelector('[data-avatar-abrir]')?.addEventListener('click', () => zoom.showModal());
      zoom.querySelector('[data-avatar-zoom-fechar]')?.addEventListener('click', () => zoom.close());
      zoom.addEventListener('click', (e) => { if (e.target === zoom) zoom.close(); });
    }
    avatarBox.querySelector('[data-avatar-fechar]')?.addEventListener('click', () => {
      avatarBox.classList.add('saindo');
      try { localStorage.setItem(chave, '1'); } catch { /* vale só nesta página */ }
      setTimeout(() => { avatarBox.hidden = true; }, 250);
    });
  }

  /* ---------- Cadastro do avatar: prévia do código SVG colado ou do arquivo escolhido ---------- */
  const avatarPrevia = document.getElementById('avatar-previa');
  if (avatarPrevia) {
    const codigo = document.getElementById('av-svg');
    const arquivo = document.getElementById('av-arquivo');
    const img = avatarPrevia.querySelector('img');
    const msg = avatarPrevia.querySelector('[data-previa-msg]');
    // Mesma limpeza do servidor: fica só com o trecho <svg ...>...</svg> (a IA costuma mandar texto e ``` em volta)
    const extrair = (t) => { t = String(t || '').trim(); const i = t.search(/<svg[\s>]/i); const f = t.toLowerCase().lastIndexOf('</svg>'); return i >= 0 && f > i ? t.slice(i, f + 6) : t; };
    const mostrar = (svg) => {
      if (!svg) { avatarPrevia.hidden = true; img.removeAttribute('src'); return; }
      avatarPrevia.hidden = false;
      if (!/<svg[\s>]/i.test(svg)) { img.removeAttribute('src'); msg.textContent = 'Isso não parece um código SVG: ele precisa ter <svg ...> e </svg>.'; return; }
      msg.textContent = /<script|\son[a-z]+\s*=|javascript:/i.test(svg) ? 'O código tem scripts: o cadastro vai recusar. Peça à IA uma versão só com CSS.' : 'É assim que o avatar vai aparecer.';
      // Prévia como imagem (data:): scripts não rodam, animações em CSS/SMIL sim
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };
    const atualizar = () => {
      if (codigo.value.trim()) return mostrar(extrair(codigo.value));
      const f = arquivo.files?.[0];
      if (!f) return mostrar(null);
      f.text().then((t) => mostrar(extrair(t))).catch(() => mostrar(null));
    };
    codigo.addEventListener('input', atualizar);
    arquivo.addEventListener('change', atualizar);
    atualizar();
  }

  /* ---------- Personalizar: cores do sistema com prévia ao vivo ---------- */
  const formCores = document.getElementById('form-cores');
  if (formCores) {
    const html = document.documentElement;
    const dadosCores = (() => { try { return JSON.parse(document.getElementById('pers-dados').textContent); } catch { return { paletas: [] }; } })();
    const seletores = [...formCores.querySelectorAll('input[type="color"]')];
    const hexDe = (chave) => formCores.querySelector(`[data-hex="${chave}"]`);
    const btnSalvar = document.getElementById('pers-salvar');
    const aviso2 = document.getElementById('pers-contraste');
    const HEX = /^#[0-9a-f]{6}$/i;
    const rgbDe = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgbaDe = (h, a) => `rgba(${rgbDe(h).join(', ')}, ${a})`;
    const luz = (h) => { const [r, g, b] = rgbDe(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrasteBranco = (h) => 1.05 / (luz(h) + 0.05);
    // Tom do menu: cor principal mais saturada e escura (mesma conta de corMenu em src/config/cores.js)
    const corMenu = (hex) => {
      const [r, g, b] = rgbDe(hex).map((v) => v / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0, s = 0, l = (max + min) / 2;
      if (d) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
      }
      s = Math.min(1, s * 1.15 + 0.05);
      l *= 0.82;
      const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
      return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    };
    const valores = () => Object.fromEntries(seletores.map((s) => [s.dataset.chave, s.value.toUpperCase()]));
    let salvo = JSON.stringify(valores());

    // Aplica as cores na página (variáveis CSS), respeitando o tema atual
    const aplicar = () => {
      const v = valores();
      const escuro = isDark();
      const set = (k, val) => (val ? html.style.setProperty(k, val) : html.style.removeProperty(k));
      set('--consag-blue', v.principal);
      set('--blue-soft', rgbaDe(v.principal, escuro ? 0.18 : 0.1));
      set('--chip-border', rgbaDe(v.principal, escuro ? 0.45 : 0.4));
      set('--section-bg', rgbaDe(v.principal, escuro ? 0.16 : 0.08));
      set('--dropzone-border', escuro ? null : rgbaDe(v.principal, 0.35));
      set('--heading', escuro ? null : v.titulos);
      set('--bg', escuro ? null : v.fundo);
      set('--topbar-bg', escuro ? null : rgbaDe(v.fundo, 0.92));
      set('--ok', v.positivo);
      set('--danger', v.negativo);
      // Menu lateral na cor principal (só quando ela foge do padrão; no padrão o menu fica azul-escuro)
      const padraoPrincipal = seletores.find((s) => s.dataset.chave === 'principal')?.dataset.padrao || '';
      const menuCor = v.principal !== padraoPrincipal.toUpperCase();
      Object.entries(dadosCores.menu || {}).forEach(([k, val]) => set(`--${k}`, menuCor ? (val === 'principal' ? corMenu(v.principal) : val) : (dadosCores.menuPadrao || {})[k]));
      aviso2.hidden = contrasteBranco(v.principal) >= 3;
      btnSalvar.disabled = JSON.stringify(v) === salvo;
    };
    const definir = (chave, cor) => {
      const s = seletores.find((x) => x.dataset.chave === chave);
      if (!s || !HEX.test(cor)) return;
      s.value = cor.toLowerCase();
      hexDe(chave).value = cor.toUpperCase();
      hexDe(chave).classList.remove('needs-attention');
    };
    seletores.forEach((s) => s.addEventListener('input', () => { hexDe(s.dataset.chave).value = s.value.toUpperCase(); aplicar(); }));
    formCores.querySelectorAll('[data-hex]').forEach((t) => t.addEventListener('input', () => {
      let v = t.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      const ok = HEX.test(v);
      t.classList.toggle('needs-attention', !ok);
      if (ok) { seletores.find((x) => x.dataset.chave === t.dataset.hex).value = v.toLowerCase(); aplicar(); }
    }));
    formCores.querySelectorAll('[data-padrao-de]').forEach((b) => b.addEventListener('click', () => {
      const s = seletores.find((x) => x.dataset.chave === b.dataset.padraoDe);
      window.agchTheme?.fade();
      definir(s.dataset.chave, s.dataset.padrao);
      aplicar();
    }));
    document.getElementById('pers-restaurar').addEventListener('click', () => { window.agchTheme?.fade(); seletores.forEach((s) => definir(s.dataset.chave, s.dataset.padrao)); aplicar(); });
    // Paletas prontas: amostras pintadas por JS (a política de segurança não permite estilo no HTML)
    document.querySelectorAll('.paleta-cor[data-cor]').forEach((el) => el.style.setProperty('background', el.dataset.cor));
    document.querySelectorAll('[data-paleta]').forEach((b) => b.addEventListener('click', () => {
      const p = dadosCores.paletas.find((x) => x.id === b.dataset.paleta);
      if (!p) return;
      window.agchTheme?.fade();
      Object.entries(p.cores).forEach(([k, v]) => definir(k, v));
      document.querySelectorAll('[data-paleta]').forEach((x) => x.classList.toggle('ativa', x === b));
      aplicar();
    }));
    document.addEventListener('themechange', aplicar);
    btnSalvar.addEventListener('click', async () => {
      btnSalvar.disabled = true;
      btnSalvar.classList.add('is-busy');
      try {
        const r = await fetch('/api/preferencias/cores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': prefsV.csrf || '' },
          body: JSON.stringify({ cores: valores() }),
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || 'Não foi possível salvar as cores.');
        // Troca o CSS das cores do usuário pela versão nova (vale em todas as telas)
        let link = document.getElementById('cores-usuario');
        if (res.cores) {
          if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.id = 'cores-usuario'; document.head.append(link); }
          link.href = `/preferencias/cores.css?v=${res.versao}`;
        } else if (link) link.remove();
        salvo = JSON.stringify(valores());
        aplicar();
        aviso({ titulo: 'Cores salvas', texto: res.cores ? 'As novas cores já valem em todas as telas, neste e em outros computadores.' : 'As cores voltaram ao padrão CONSAG.' });
      } catch (e) {
        aviso({ titulo: 'Não foi possível salvar', texto: e.message });
        btnSalvar.disabled = false;
      } finally { btnSalvar.classList.remove('is-busy'); }
    });
    window.addEventListener('beforeunload', (e) => { if (JSON.stringify(valores()) !== salvo) { e.preventDefault(); e.returnValue = ''; } });
    aplicar();
  }

  /* ---------- Barras de % dos rankings (largura definida por JS: CSP sem estilo inline) ---------- */
  $$('.mf-barra-cheia[data-pct]').forEach((el) => el.style.setProperty('width', `${Math.min(100, parseFloat(el.dataset.pct) || 0)}%`));

  /* ---------- Fixar o menu aberto (alfinete) ---------- */
  const pinBtn = document.getElementById('menu-pin');
  if (pinBtn) {
    const html = document.documentElement;
    const fixo = () => html.getAttribute('data-menu') === 'fixo';
    const sync = () => {
      const t = fixo() ? 'Soltar o menu (abrir só ao passar o mouse)' : 'Fixar o menu aberto';
      pinBtn.setAttribute('aria-pressed', String(fixo()));
      pinBtn.title = t;
      pinBtn.setAttribute('aria-label', t);
    };
    sync();
    pinBtn.addEventListener('click', () => {
      const novo = !fixo();
      if (novo) html.setAttribute('data-menu', 'fixo'); else html.removeAttribute('data-menu');
      try { localStorage.setItem('agch-menu-fixo', novo ? '1' : '0'); } catch { /* vale só nesta página */ }
      sync();
      if (!novo) pinBtn.blur(); // solta: o menu recolhe ao tirar o mouse
      setTimeout(() => window.dispatchEvent(new Event('resize')), 320); // gráficos se ajustam à nova largura
    });
  }

  /* ---------- Avatar do usuário (topo): painel com nome, perfil e Sair ---------- */
  const uMenu = document.getElementById('user-menu');
  const uBtn = document.getElementById('user-btn');
  const uPanel = document.getElementById('user-panel');
  if (uMenu && uBtn && uPanel) {
    const abrir = (sim) => { uPanel.hidden = !sim; uBtn.setAttribute('aria-expanded', String(sim)); uMenu.classList.toggle('open', sim); };
    uBtn.addEventListener('click', (e) => { e.stopPropagation(); abrir(uPanel.hidden); });
    document.addEventListener('click', (e) => { if (!uPanel.hidden && !uMenu.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !uPanel.hidden) { abrir(false); uBtn.focus(); } });
  }

  const fWrap = document.getElementById('filters-wrap');
  const fBtn = document.getElementById('filters-toggle');
  if (fWrap && fBtn) {
    const sync = () => fBtn.setAttribute('aria-expanded', String(fWrap.matches('.open')));
    const close = () => { fWrap.classList.remove('open'); if (fWrap.contains(document.activeElement)) document.activeElement.blur(); sync(); };
    fBtn.addEventListener('click', () => {
      if (fWrap.classList.contains('open')) close(); else { fWrap.classList.add('open'); sync(); }
    });
    ['mouseenter', 'mouseleave', 'focusin', 'focusout'].forEach((ev) => fWrap.addEventListener(ev, () => setTimeout(sync)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fWrap.matches(':focus-within, .open')) close(); });
    document.addEventListener('click', (e) => { if (!fWrap.contains(e.target)) close(); });
  }

  /* ---------- Filtros com seleção múltipla (Estrutura, Sigla, Empresa, Centro de lucro) ----------
     Substitui visualmente o <select multiple>: caixas de seleção, busca e "Aplicar".
     O formulário só é enviado no "Aplicar" (ou Enter), para escolher vários itens de uma vez. */
  function enhanceMulti(sel) {
    const wrap = document.createElement('div');
    wrap.className = 'mselect';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('mselect-native');
    sel.tabIndex = -1;
    const todos = sel.dataset.todos || 'Todos';
    const plural = sel.dataset.plural || 'itens';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'select mselect-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const rotulo = () => {
      const marcados = [...sel.options].filter((o) => o.selected);
      btn.textContent = !marcados.length ? todos : marcados.length === 1 ? marcados[0].textContent : `${marcados.length} ${plural}`;
      btn.classList.toggle('tem-selecao', marcados.length > 0);
      if (marcados.length > 1) btn.title = marcados.map((o) => o.textContent).join('\n'); else btn.removeAttribute('title');
    };
    const painel = document.createElement('div');
    painel.className = 'mselect-panel';
    painel.hidden = true;
    const busca = document.createElement('input');
    busca.type = 'search';
    busca.className = 'input mselect-busca';
    busca.placeholder = 'Buscar…';
    busca.setAttribute('aria-label', `Buscar em ${sel.closest('div')?.querySelector('label')?.textContent || 'opções'}`);
    const acoes = document.createElement('div');
    acoes.className = 'mselect-acoes';
    const marcarTodos = document.createElement('button');
    marcarTodos.type = 'button'; marcarTodos.className = 'link-btn'; marcarTodos.textContent = 'Marcar visíveis';
    const limpar = document.createElement('button');
    limpar.type = 'button'; limpar.className = 'link-btn'; limpar.textContent = 'Limpar';
    acoes.append(marcarTodos, limpar);
    const listaEl = document.createElement('ul');
    listaEl.className = 'mselect-lista';
    listaEl.setAttribute('role', 'listbox');
    listaEl.setAttribute('aria-multiselectable', 'true');
    [...sel.options].forEach((o, i) => {
      const li = document.createElement('li');
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = o.selected;
      cb.dataset.i = i;
      cb.addEventListener('change', () => { o.selected = cb.checked; rotulo(); });
      const t = document.createElement('span');
      t.textContent = o.textContent;
      lbl.append(cb, t);
      li.append(lbl);
      listaEl.append(li);
    });
    if (!sel.options.length) { const vazio = document.createElement('li'); vazio.className = 'mselect-vazio'; vazio.textContent = 'Nenhuma opção para os filtros atuais.'; listaEl.append(vazio); }
    const rodape = document.createElement('div');
    rodape.className = 'mselect-rodape';
    const aplicar = document.createElement('button');
    aplicar.type = 'button'; aplicar.className = 'btn btn-primary'; aplicar.textContent = 'Aplicar';
    rodape.append(aplicar);
    painel.append(busca, acoes, listaEl, rodape);
    wrap.append(btn, painel);
    const inicial = () => [...sel.options].map((o) => o.selected).join();
    let estadoAoAbrir = inicial();
    const abrir = () => {
      document.querySelectorAll('.mselect.open').forEach((w) => { if (w !== wrap) w.dispatchEvent(new Event('fechar')); });
      estadoAoAbrir = inicial();
      painel.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      busca.value = ''; filtrar(); busca.focus();
    };
    const fechar = (aplicando) => {
      if (!aplicando && inicial() !== estadoAoAbrir) {
        // fechou sem aplicar: volta ao que estava
        const antes = estadoAoAbrir.split(',');
        [...sel.options].forEach((o, i) => { o.selected = antes[i] === 'true'; });
        listaEl.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.checked = sel.options[cb.dataset.i].selected; });
        rotulo();
      }
      painel.hidden = true; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    };
    const filtrar = () => {
      const q = busca.value.trim().toLowerCase();
      listaEl.querySelectorAll('li').forEach((li) => { li.hidden = !!q && !li.textContent.toLowerCase().includes(q); });
    };
    const enviar = () => { fechar(true); if (inicial() !== estadoAoAbrir) { if (typeof mostrarCarregando === 'function') mostrarCarregando(); sel.form.submit(); } };
    btn.addEventListener('click', () => (wrap.classList.contains('open') ? fechar(false) : abrir()));
    busca.addEventListener('input', filtrar);
    busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
    marcarTodos.addEventListener('click', () => {
      listaEl.querySelectorAll('li:not([hidden]) input[type=checkbox]').forEach((cb) => { cb.checked = true; sel.options[cb.dataset.i].selected = true; });
      rotulo();
    });
    limpar.addEventListener('click', () => {
      listaEl.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.checked = false; sel.options[cb.dataset.i].selected = false; });
      rotulo();
    });
    aplicar.addEventListener('click', enviar);
    wrap.addEventListener('fechar', () => fechar(false));
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap.classList.contains('open')) { e.stopPropagation(); fechar(false); btn.focus(); } });
    document.addEventListener('click', (e) => { if (wrap.classList.contains('open') && !wrap.contains(e.target)) fechar(false); });
    rotulo();
  }
  $$('select[data-enhance="multi"]').forEach(enhanceMulti);

  /* ---------- Seletor de moeda com ícones (substitui visualmente o <select> nativo) ---------- */
  function enhanceCurrency(sel) {
    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('cselect-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const badge = (o) => {
      const sym = o.dataset.symbol || '';
      const flag = o.dataset.flag;
      const b = el('span', `cur-badge ${o.dataset.group === 'Moeda do grupo' ? 'is-group' : ''} ${flag ? 'has-flag' : (sym.length >= 4 ? 'is-long' : '')}`, flag ? null : sym);
      if (flag) {
        const img = document.createElement('img');
        img.src = flag; img.alt = ''; img.decoding = 'async';
        img.addEventListener('error', () => { img.remove(); b.classList.remove('has-flag'); b.textContent = sym; }); // sem bandeira: símbolo
        b.append(img);
      }
      b.setAttribute('aria-hidden', 'true');
      return b;
    };
    const describe = (o, li) => {
      li.append(badge(o));
      const txt = el('span', 'cur-text');
      const code = el('strong', '', o.dataset.code);
      if (o.dataset.symbol && o.dataset.symbol !== o.dataset.code) code.append(el('span', 'cur-sym', o.dataset.symbol));
      txt.append(code, el('small', '', o.dataset.group));
      li.append(txt);
      const n = Number(o.dataset.count);
      li.append(el('span', 'cur-count', `${n} empresa${n > 1 ? 's' : ''}`));
    };

    const btn = el('button', 'select cselect-btn');
    btn.type = 'button';
    btn.id = `${sel.id}-btn`;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const label = document.querySelector(`label[for="${sel.id}"]`);
    if (label) label.htmlFor = btn.id;

    const list = el('ul', 'cselect-list');
    list.setAttribute('role', 'listbox');
    list.id = `${sel.id}-list`;
    list.tabIndex = -1;
    btn.setAttribute('aria-controls', list.id);

    const items = [];
    $$('optgroup', sel).forEach((g) => {
      const head = el('li', 'cselect-group', g.label);
      head.setAttribute('role', 'presentation');
      list.append(head);
      $$('option', g).forEach((o) => {
        const li = el('li', 'cselect-opt');
        li.id = `${sel.id}-opt-${items.length}`;
        li.setAttribute('role', 'option');
        li.dataset.value = o.value;
        li.setAttribute('aria-selected', String(o.selected));
        describe(o, li);
        li.addEventListener('click', () => choose(li));
        li.addEventListener('mousemove', () => setActive(items.indexOf(li)));
        list.append(li);
        items.push(li);
      });
    });

    const renderBtn = () => {
      btn.textContent = '';
      const o = sel.options[sel.selectedIndex];
      if (!o) return;
      describe(o, btn);
      btn.querySelector('.cur-count').remove();
      btn.append(el('span', 'cselect-caret', '▾'));
    };
    renderBtn();
    wrap.append(btn, list);

    let active = -1;
    const setActive = (i) => {
      active = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((li, k) => li.classList.toggle('active', k === active));
      list.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    };
    const open = () => {
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      setActive(Math.max(0, items.findIndex((li) => li.dataset.value === sel.value)));
      list.focus();
    };
    const close = (focusBtn = true) => {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    };
    function choose(li) {
      close();
      if (li.dataset.value === sel.value) return;
      sel.value = li.dataset.value;
      renderBtn();
      sel.dispatchEvent(new Event('change', { bubbles: true })); // dispara o autosubmit do filtro
    }

    btn.addEventListener('click', () => (wrap.classList.contains('open') ? close() : open()));
    btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(items[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target) && wrap.classList.contains('open')) close(false); });
  }
  $$('select[data-enhance="currency"]').forEach(enhanceCurrency);

  /* ---------- Formulários com envio demorado (importação de planilhas grandes) ---------- */
  $$('form[data-busy]').forEach((f) => f.addEventListener('submit', () => {
    const btn = $('button[type="submit"]', f);
    if (!btn) return;
    btn.disabled = true;
    btn.lastChild.textContent = 'Importando…';
  }));

  /* ---------- Visão Geral: resumo do mês em "stories" ----------
     Barras de progresso no topo, troca automática, toque/clique à direita avança e à esquerda volta, deslizar no
     celular, setas do teclado. Pausa ao passar o mouse, ao focar ou com a aba escondida. Pode ser ocultado
     (lembrado por competência neste navegador). Sem animação automática para quem prefere menos movimento. */
  (function stories() {
    const raiz = $('#ap-stories');
    if (!raiz) return;
    const slides = $$('[data-ap-slide]', raiz);
    const segs = $$('.ap-seg i', raiz);
    const reabrir = $('[data-ap-reabrir]');
    const moeda = raiz.dataset.moeda || 'BRL';
    const DURACAO = 5500;
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chave = 'ag-stories-oculto';
    let i = 0; let inicio = 0; let decorrido = 0; let pausado = false; let pausaUsuario = false; let raf = 0;
    const ler = () => { try { return localStorage.getItem(chave); } catch { return null; } };
    const gravar = (v) => { try { if (v) localStorage.setItem(chave, v); else localStorage.removeItem(chave); } catch { /* sem armazenamento */ } };
    const formatar = (v, f) => (f === 'moeda' ? moneyFmt(moeda, true).format(v) : f === 'pct' ? `${Math.round(v * 100)}%` : num.format(Math.round(v)));
    const contar = (el) => {
      const alvo = Number(el.dataset.apValor);
      const f = el.dataset.apFormato;
      if (semMovimento || !Number.isFinite(alvo)) { el.textContent = formatar(alvo, f); return; }
      const t0 = performance.now();
      const passo = (t) => {
        const p = Math.min(1, (t - t0) / 900);
        el.textContent = formatar(alvo * (1 - Math.pow(1 - p, 3)), f);
        if (p < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    };
    const ir = (n) => {
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach((s, k) => { s.classList.toggle('ativo', k === i); if (k === i) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true'); });
      segs.forEach((g, k) => g.style.setProperty('--p', k < i ? '100%' : '0%'));
      const s = slides[i];
      $$('[data-ap-valor]', s).forEach(contar);
      $$('.ap-barra[data-w]', s).forEach((b) => { b.style.setProperty('--w', '0%'); requestAnimationFrame(() => b.style.setProperty('--w', `${b.dataset.w}%`)); });
      decorrido = 0; inicio = performance.now();
    };
    const tick = (t) => {
      if (!pausado && !pausaUsuario && !semMovimento && i < slides.length - 1) {
        const p = Math.min(1, (decorrido + (t - inicio)) / DURACAO);
        segs[i].style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
        if (p >= 1) ir(i + 1);
      } else if (i === slides.length - 1 && segs[i]) segs[i].style.setProperty('--p', '100%');
      raf = requestAnimationFrame(tick);
    };
    const pausar = (sim) => {
      if (sim && !pausado) decorrido += performance.now() - inicio;
      if (!sim && pausado) inicio = performance.now();
      pausado = sim;
    };
    const btnPausa = $('[data-ap-pausar]', raiz);
    const alternarPausa = () => {
      if (pausaUsuario) inicio = performance.now(); else decorrido += performance.now() - inicio;
      pausaUsuario = !pausaUsuario;
      btnPausa.textContent = pausaUsuario ? '▶' : '❚❚';
      btnPausa.setAttribute('aria-label', pausaUsuario ? 'Continuar' : 'Pausar');
      btnPausa.title = pausaUsuario ? 'Continuar' : 'Pausar';
    };
    raiz.addEventListener('click', (e) => {
      if (e.target.closest('[data-ap-prox]')) ir(i + 1);
      else if (e.target.closest('[data-ap-ant]')) ir(i - 1);
      else if (e.target.closest('[data-ap-pausar]')) alternarPausa();
      else if (e.target.closest('[data-ap-ocultar]')) { raiz.hidden = true; reabrir.hidden = false; gravar(raiz.dataset.periodo); }
    });
    reabrir?.addEventListener('click', () => { gravar(null); raiz.hidden = false; reabrir.hidden = true; ir(0); raiz.focus(); });
    raiz.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); ir(i - 1); }
    });
    raiz.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pausar(true); });
    raiz.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') pausar(false); });
    raiz.addEventListener('focusin', () => pausar(true));
    raiz.addEventListener('focusout', (e) => { if (!raiz.contains(e.relatedTarget)) pausar(false); });
    document.addEventListener('visibilitychange', () => pausar(document.hidden));
    // Deslizar (celular): para a esquerda avança, para a direita volta
    let x0 = null;
    raiz.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    raiz.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 45) { e.preventDefault(); ir(dx < 0 ? i + 1 : i - 1); }
    });
    if (ler() === raiz.dataset.periodo) { raiz.hidden = true; reabrir.hidden = false; }
    ir(0);
    raf = requestAnimationFrame(tick);
  }());

  /* ---------- Visão Geral: carrossel de destaques, "ver mais" do feed e busca rápida ---------- */
  (function visaoGeral() {
    const trilho = $('[data-vg-trilho]');
    if (trilho) {
      const atualizarSetas = () => {
        const fim = trilho.scrollWidth - trilho.clientWidth - 2;
        $$('[data-vg-seta]').forEach((b) => { b.disabled = b.dataset.vgSeta === '-1' ? trilho.scrollLeft <= 2 : trilho.scrollLeft >= fim; });
      };
      $$('[data-vg-seta]').forEach((b) => b.addEventListener('click', () => {
        trilho.scrollBy({ left: Number(b.dataset.vgSeta) * trilho.clientWidth * 0.85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }));
      trilho.addEventListener('scroll', atualizarSetas, { passive: true });
      window.addEventListener('resize', atualizarSetas);
      atualizarSetas();
    }

    const mais = $('[data-vg-mais]');
    if (mais) mais.addEventListener('click', () => { $$('.vg-post.extra').forEach((p) => { p.hidden = false; }); mais.remove(); });

    const campo = $('[data-vg-busca]');
    const lista = $('[data-vg-busca-lista]');
    if (!campo || !lista) return;
    let dados = { telas: [], contas: false };
    try { dados = JSON.parse(document.getElementById('page-data')?.textContent || '{}').busca || dados; } catch { /* sem dados */ }
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let timer = null; let pedido = 0; let ativo = -1;
    const fechar = () => { lista.hidden = true; campo.setAttribute('aria-expanded', 'false'); ativo = -1; };
    const mostrar = (html) => { lista.innerHTML = html; lista.hidden = !html; campo.setAttribute('aria-expanded', String(!!html)); ativo = -1; };
    const itemTela = (t) => `<li role="option"><a href="${esc(t.url)}"><span class="vg-busca-tipo">Tema</span><strong>${esc(t.nome)}</strong></a></li>`;
    const buscar = async () => {
      const q = campo.value.trim();
      if (q.length < 2) { fechar(); return; }
      const termos = norm(q).split(/\s+/);
      const telas = dados.telas.filter((t) => termos.every((x) => norm(`${t.nome} ${t.palavras}`).includes(x))).slice(0, 5);
      let html = telas.map(itemTela).join('');
      mostrar(html || (dados.contas ? '<li class="vg-busca-info">Buscando contas…</li>' : '<li class="vg-busca-info">Nada encontrado.</li>'));
      if (!dados.contas) return;
      const n = ++pedido;
      try {
        const r = await fetch(`/api/dre/contas?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
        const j = r.ok ? await r.json() : { contas: [] };
        if (n !== pedido) return;
        html += (j.contas || []).slice(0, 6).map((c) => {
          const cod = c.conta.split(' - ')[0];
          return `<li role="option"><a href="/modulos/dre#conta=${encodeURIComponent(cod)}"><span class="vg-busca-tipo">Conta</span><strong>${esc(c.conta)}</strong><em>${esc(moneyFmt('BRL', true).format(c.ano))} no ano</em></a></li>`;
        }).join('');
        mostrar(html || '<li class="vg-busca-info">Nada encontrado. Tente outro termo.</li>');
      } catch { if (n === pedido && !html) mostrar('<li class="vg-busca-info">Não foi possível buscar agora.</li>'); }
    };
    campo.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 250); });
    campo.addEventListener('focus', () => { if (campo.value.trim().length >= 2) buscar(); });
    campo.addEventListener('keydown', (e) => {
      const links = $$('a', lista);
      if (e.key === 'Escape') { fechar(); return; }
      if (!links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        ativo = (ativo + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((a, k) => a.classList.toggle('ativo', k === ativo));
        links[ativo].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); (links[ativo] || links[0]).click(); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.vg-busca')) fechar(); });
  }());

  /* ---------- Visão Geral: "?" de cada card abre a explicação resumida por cima do próprio card ----------
     Um aberto por vez; fecha clicando de novo, fora do card ou com Esc. */
  const fecharAjuda = (btn, foco = false) => {
    const painel = document.getElementById(btn.dataset.ajuda);
    if (painel) painel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('aberto');
    if (foco) btn.focus();
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ajuda]');
    const abertos = $$('[data-ajuda][aria-expanded="true"]');
    if (btn) {
      e.preventDefault();
      const abrir = btn.getAttribute('aria-expanded') !== 'true';
      abertos.forEach((b) => fecharAjuda(b));
      if (abrir) {
        document.getElementById(btn.dataset.ajuda).hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('aberto');
      }
      return;
    }
    // Clique dentro da explicação não navega nem fecha; fora dela, fecha
    if (e.target.closest('.kpi-ajuda')) { e.preventDefault(); return; }
    abertos.forEach((b) => fecharAjuda(b));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('[data-ajuda][aria-expanded="true"]').forEach((b) => fecharAjuda(b, true));
  });

  /* ---------- Confirmações (popup próprio no lugar do confirm do navegador) ---------- */
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', async (e) => {
    if (f.dataset.confirmado === '1') { delete f.dataset.confirmado; return; }
    e.preventDefault();
    const destrutivo = /exclu|remov|apag/i.test(f.dataset.confirm);
    const ok = await confirmar({ titulo: destrutivo ? 'Confirmar exclusão' : 'Confirmar', texto: f.dataset.confirm, ok: destrutivo ? 'Excluir' : 'Confirmar', perigo: destrutivo });
    if (!ok) return;
    f.dataset.confirmado = '1';
    if (f.requestSubmit) f.requestSubmit(); else f.submit();
  }));

  /* ---------- Gráficos ---------- */
  const dataEl = $('#page-data');
  if (dataEl && window.Chart) {
    const data = JSON.parse(dataEl.textContent);
    Chart.defaults.font.family = "'Montserrat', system-ui, sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.maintainAspectRatio = false;

    const tooltipMoneyIn = (code) => ({ callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${moneyFmt(code).format(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } });
    const tooltipCount = { callbacks: { label: (c) => ` ${num.format(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } };
    let grid = {};

    // Cores dependentes do tema; os gráficos são redesenhados ao trocar o tema
    const applyChartTheme = () => {
      PALETTE = isDark() ? PALETTE_DARK : PALETTE_LIGHT;
      // Cor principal personalizada (tela Personalizar) entra como a 1ª cor dos gráficos
      const principal = cssVar('--consag-blue');
      if (principal) PALETTE = [principal, ...PALETTE.slice(1)];
      NEG = cssVar('--danger') || (isDark() ? '#FF6B70' : '#D2232A');
      Chart.defaults.color = cssVar('--chart-text') || '#283344';
      Chart.defaults.borderColor = cssVar('--chart-grid') || '#EEF1F6';
      grid = { color: cssVar('--chart-grid') || '#EEF1F6' };
    };

    /* ---- Visual moderno: degradês suaves (mesma cor, da forte para a clara), cantos arredondados,
       animação de entrada em cascata e tooltips limpos. As cores continuam fortes o bastante para ler. ---- */
    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rgba = (hex, a) => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };
    /** Degradê na direção da barra (vertical: de cima para baixo; horizontal: da direita para a esquerda) */
    const degrade = (cor, horizontal = false, de = 1, ate = 0.45) => (ctx) => {
      const { chart } = ctx;
      const area = chart.chartArea;
      if (!area) return cor;
      const g = horizontal
        ? chart.ctx.createLinearGradient(area.right, 0, area.left, 0)
        : chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, rgba(cor, de));
      g.addColorStop(1, rgba(cor, ate));
      return g;
    };
    /** Preenchimento de área (linha): cor translúcida que some até a base */
    const area = (cor) => (ctx) => {
      const { chart } = ctx;
      const a = chart.chartArea;
      if (!a) return rgba(cor, 0.15);
      const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
      g.addColorStop(0, rgba(cor, 0.32));
      g.addColorStop(1, rgba(cor, 0.02));
      return g;
    };
    const entrada = (passo = 70) => (reduzMovimento ? false : {
      duration: 900,
      easing: 'easeOutQuart',
      delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * passo : 0),
    });
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(6, 23, 43, .92)';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.plugins.tooltip.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';

    /** Total no centro do gráfico de rosca */
    const centroRosca = {
      id: 'centroRosca',
      afterDraw(chart, _args, opts) {
        if (!opts || !opts.texto) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data.length) return;
        const { x, y } = meta.data[0];
        const c = chart.ctx;
        c.save();
        c.textAlign = 'center';
        c.fillStyle = cssVar('--chart-text') || '#283344';
        c.font = "500 11px 'Montserrat', system-ui, sans-serif";
        c.globalAlpha = 0.75;
        c.fillText(opts.rotulo || 'Total', x, y - 9);
        c.globalAlpha = 1;
        c.font = "700 15px 'Montserrat', system-ui, sans-serif";
        c.fillText(opts.texto, x, y + 11);
        c.restore();
      },
    };

    function render(id, c) {
      const el = document.getElementById(id);
      if (!el || !c || !c.labels || !c.labels.length) {
        if (el) el.parentElement.innerHTML = '<p class="note">Sem dados para exibir.</p>';
        return;
      }
      const isCount = !!c.isCount;
      const code = c.currency || data.currency || 'BRL';
      const money = (v) => moneyFmt(code).format(v);
      const curto = (v) => (isCount ? num.format(v) : moneyFmt(code, true).format(v));
      const valueAxis = { grid, border: { display: false }, ticks: { callback: curto } };
      const tooltip = isCount ? tooltipCount : tooltipMoneyIn(code);

      // Rosca: fatias com espaço entre si, cantos arredondados e o total no centro
      if (c.type === 'doughnut') {
        const valores = c.values.map(Math.abs);
        const total = valores.reduce((a, v) => a + v, 0);
        return new Chart(el, {
          type: 'doughnut',
          plugins: [centroRosca],
          data: { labels: c.labels, datasets: [{ data: valores, backgroundColor: PALETTE.map((p) => rgba(p, 0.92)), hoverBackgroundColor: PALETTE, borderWidth: 0, borderRadius: 6, spacing: 3, hoverOffset: 10 }] },
          options: {
            cutout: '68%',
            animation: reduzMovimento ? false : { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart' },
            layout: { padding: 8 },
            plugins: {
              legend: { position: 'right' },
              tooltip: { callbacks: { label: (x) => ` ${x.label}: ${isCount ? num.format(x.parsed) : money(x.parsed)} (${total ? ((x.parsed / total) * 100).toFixed(1).replace('.', ',') : '0'}%)` } },
              centroRosca: { texto: curto(total) },
            },
          },
        });
      }
      // Área: evolução no tempo (movimento diário, fluxo mensal)
      if (c.type === 'line' || c.type === 'area') {
        const cor = PALETTE[0];
        return new Chart(el, {
          type: 'line',
          data: {
            labels: c.type === 'line' ? c.labels.map(fmtDate) : c.labels,
            datasets: [{
              label: c.label || 'Valor', data: c.values, fill: true, tension: 0.4,
              borderColor: cor, borderWidth: 2.5, backgroundColor: area(cor),
              pointRadius: c.values.length > 24 ? 0 : 3, pointHoverRadius: 6, pointBackgroundColor: cssVar('--surface') || '#fff', pointBorderColor: cor, pointBorderWidth: 2,
            }],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: reduzMovimento ? false : { duration: 1100, easing: 'easeOutQuart' },
            plugins: { legend: { display: false }, tooltip },
            scales: { x: { grid: { display: false }, border: { display: false } }, y: valueAxis },
          },
        });
      }
      // Barras: degradê da própria cor, cantos arredondados, entrada em cascata
      const horizontal = c.type === 'hbar';
      const corDe = (v, i) => (v < 0 ? NEG : (horizontal ? PALETTE[0] : PALETTE[i % PALETTE.length]));
      return new Chart(el, {
        type: 'bar',
        data: {
          labels: c.labels,
          datasets: [{
            data: c.values,
            backgroundColor: (ctx) => degrade(corDe(c.values[ctx.dataIndex] ?? 0, ctx.dataIndex), horizontal)(ctx),
            hoverBackgroundColor: (ctx) => corDe(c.values[ctx.dataIndex] ?? 0, ctx.dataIndex),
            borderRadius: 8, borderSkipped: false, maxBarThickness: horizontal ? 22 : 46,
          }],
        },
        options: {
          indexAxis: horizontal ? 'y' : 'x',
          animation: entrada(horizontal ? 60 : 80),
          plugins: { legend: { display: false }, tooltip },
          scales: horizontal
            ? { x: valueAxis, y: { grid: { display: false }, border: { display: false }, ticks: { callback(v) { const l = this.getLabelForValue(v); return l.length > 28 ? l.slice(0, 27) + '…' : l; } } } }
            : { x: { grid: { display: false }, border: { display: false } }, y: valueAxis },
        },
      });
    }

    /* ---- DRE: painel do resultado (services/painelDre.js) ----
       Cards ligados entre si: o mês e o modo (mês × acumulado no ano) valem para o resultado, a composição e o gráfico;
       clicar num card de resultado escolhe a parte exibida na composição; clicar num mês do gráfico troca o mês. */
    function criarPainelDre(dp) {
      const raiz = $('#dp-resultado');
      if (!raiz || !dp.meses.length) return null;
      const code = data.currency || 'BRL';
      const money = (v) => moneyFmt(code).format(v);
      const curto = (v) => moneyFmt(code, true).format(v);
      const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const zeroV = (v) => Math.abs(v || 0) < 0.005;
      const parteDe = Object.fromEntries(dp.partes.map((p) => [p.id, p]));
      const mesDe = (p) => dp.meses.find((m) => m.periodo === p);
      const anterior = (p) => { const i = dp.meses.findIndex((m) => m.periodo === p); return i > 0 ? dp.meses[i - 1] : null; };
      const ultimo = mesDe(dp.periodo);
      const st = { periodo: dp.periodo, modo: ultimo && ultimo.temMes ? 'mes' : 'ano', parte: 'custos', aberto: null };
      let grafico = null;

      const dados = (m, modo = st.modo) => (m ? (modo === 'mes' ? m.mes : m.ano) : null);
      const somaParte = (grupos, id) => parteDe[id].grupos.reduce((a, g) => a + (grupos[g] || 0), 0);
      /** Totais do resultado a partir dos grupos da DRE */
      function totais(grupos) {
        if (!grupos) return null;
        const receita = somaParte(grupos, 'receita');
        const custos = somaParte(grupos, 'custos');
        const total = Object.values(grupos).reduce((a, v) => a + v, 0);
        return { receita, custos, lucroBruto: receita + custos, demais: total - receita - custos, lucro: total };
      }
      const rotuloPeriodo = (m) => (st.modo === 'mes' ? m.rotulo : `jan a ${m.rotulo}`);

      function tiles() {
        const m = mesDe(st.periodo);
        const d = dados(m);
        const t = totais(d?.grupos);
        const box = $('[data-dp-tiles]', raiz);
        $('[data-dp-titulo]', raiz).textContent = `· ${rotuloPeriodo(m)}`;
        if (!t) { box.innerHTML = '<p class="note">Sem dados para este mês.</p>'; return; }
        const antM = anterior(st.periodo);
        const ant = st.modo === 'mes' ? totais(antM?.mes?.grupos) : null;
        const rl = t.receita;
        const demaisParte = ['despesas', 'financeiro', 'ir', 'classificar'].find((id) => !zeroV(somaParte(d.grupos, id))) || 'despesas';
        const cards = [
          { id: 'receita', label: 'Receita líquida', v: t.receita, meta: 'Receita bruta − deduções', parte: 'receita' },
          { id: 'custos', label: 'Custos', v: t.custos, meta: rl ? `${pct(Math.abs(t.custos) / Math.abs(rl))} da receita líquida` : '', parte: 'custos' },
          { id: 'lucroBruto', label: 'Lucro bruto', v: t.lucroBruto, meta: rl ? `Margem bruta ${pct(t.lucroBruto / rl)}` : '', resultado: true },
          { id: 'demais', label: 'Despesas e outros', v: t.demais, meta: 'Despesas, financeiro, IR e a classificar', parte: demaisParte, grupoPartes: ['despesas', 'financeiro', 'ir', 'classificar'] },
          { id: 'lucro', label: 'Lucro líquido', v: t.lucro, meta: rl ? `Margem líquida ${pct(t.lucro / rl)}` : '', resultado: true },
        ];
        box.innerHTML = cards.map((c) => {
          const dv = ant ? c.v - ant[c.id] : null;
          const tom = c.resultado ? (c.v < 0 ? 'neg' : 'pos') : '';
          const ativo = !!c.parte && (c.parte === st.parte || (c.grupoPartes || []).includes(st.parte));
          const variacao = dv == null ? '' : `<span class="dp-tile-var ${zeroV(dv) ? '' : dv > 0 ? 'up' : 'down'}">${zeroV(dv) ? '=' : dv > 0 ? '▲' : '▼'} ${curto(Math.abs(dv))} vs ${esc(antM.rotulo)}</span>`;
          const inner = `<span class="dp-tile-label">${c.label}</span>
            <strong class="dp-tile-valor" title="${esc(money(c.v))}">${curto(c.v)}</strong>
            <span class="dp-tile-meta">${esc(c.meta)}</span>${variacao}`;
          return c.parte
            ? `<button type="button" class="dp-tile ${ativo ? 'ativo' : ''}" data-dp-parte="${c.parte}" aria-pressed="${ativo}">${inner}</button>`
            : `<div class="dp-tile resultado ${tom}">${inner}</div>`;
        }).join('');
      }

      function composicao() {
        const m = mesDe(st.periodo);
        const subs = dados(m)?.subgrupos || {};
        const daParte = (p) => Object.entries(subs).filter(([k, v]) => p.grupos.includes(k.split('|')[0]) && !zeroV(v));
        const comDados = dp.partes.filter((p) => daParte(p).length);
        if (comDados.length && !comDados.some((p) => p.id === st.parte)) st.parte = comDados[0].id;
        const parte = parteDe[st.parte];
        $('[data-dp-partes]').innerHTML = comDados.map((p) => `<button type="button" class="chip ${p.id === st.parte ? 'active' : ''}" data-dp-parte="${p.id}" aria-pressed="${p.id === st.parte}">${p.label}</button>`).join('');
        const itens = daParte(parte).map(([k, v]) => { const [g, s] = k.split('|'); return { k, g, s, v }; }).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
        const totalAbs = itens.reduce((a, x) => a + Math.abs(x.v), 0);
        const max = Math.max(...itens.map((x) => Math.abs(x.v)), 1);
        $('[data-dp-comp-titulo]').textContent = `· ${parte.label} · ${rotuloPeriodo(m)}`;
        $('[data-dp-comp-total]').textContent = itens.length ? `Total ${money(itens.reduce((a, x) => a + x.v, 0))}` : '';
        const varios = parte.grupos.length > 1;
        const contas = st.periodo === dp.periodo ? dp.contas[st.modo] : null;
        const lista = $('[data-dp-barras]');
        if (!itens.length) { lista.innerHTML = '<li class="note">Sem valores nesta parte do resultado.</li>'; return; }
        lista.innerHTML = itens.map((x, i) => {
          const aberto = st.aberto === x.k;
          let det = '';
          if (aberto) {
            det = contas && contas[x.k]
              ? `<ul class="dp-contas">${contas[x.k].map(([c, v]) => { const sep = c.indexOf(' - '); return `<li><span class="dp-conta-nome"><span class="pop-cod">${esc(sep > 0 ? c.slice(0, sep) : c)}</span>${esc(sep > 0 ? c.slice(sep + 3) : '')}</span><span class="num ${v < 0 ? 'neg' : ''}">${money(v)}</span></li>`; }).join('')}</ul>`
              : `<p class="note dp-contas-nota">O detalhe por conta está disponível na competência escolhida no topo (${esc(ultimo.rotulo)}).</p>`;
          }
          return `<li class="dp-barra ${aberto ? 'aberta' : ''}">
            <button type="button" class="dp-barra-btn" data-dp-sub="${esc(x.k)}" aria-expanded="${aberto}">
              <span class="dp-barra-nome">${esc(x.s)}${varios ? `<small>${esc(x.g)}</small>` : ''}</span>
              <span class="dp-barra-valor">${curto(x.v)}<small>${totalAbs ? pct(Math.abs(x.v) / totalAbs) : ''}</small></span>
              <span class="dp-barra-trilho" aria-hidden="true"><span class="dp-barra-fill ${x.v < 0 ? 'negativo' : ''}" data-w="${(Math.abs(x.v) / max * 100).toFixed(1)}" data-d="${i * 40}"></span></span>
            </button>${det}</li>`;
        }).join('');
        // Largura e atraso da animação via JS (a CSP do app não aceita o atributo style inline)
        $$('.dp-barra-fill', lista).forEach((b) => { b.style.setProperty('--w', `${b.dataset.w}%`); b.style.setProperty('--d', `${b.dataset.d}ms`); });
      }

      function controles() {
        const m = mesDe(st.periodo);
        const antM = anterior(st.periodo);
        $$('[data-dp-modo]', raiz).forEach((b) => {
          const ativo = b.dataset.dpModo === st.modo;
          b.classList.toggle('ativo', ativo);
          b.setAttribute('aria-pressed', String(ativo));
          b.disabled = b.dataset.dpModo === 'mes' && !m.temMes;
          b.title = b.disabled ? `Sem o FGI0 de ${antM ? antM.rotulo : 'mês anterior'} não dá para separar o valor do mês` : '';
        });
        $('[data-dp-mes]', raiz).value = st.periodo;
        const aviso = $('[data-dp-aviso]', raiz);
        const msg = !m.temMes && antM ? `Mostrando o acumulado no ano: falta o FGI0 de ${antM.rotulo} para separar o valor de ${m.rotulo}.` : '';
        aviso.textContent = msg;
        aviso.hidden = !msg;
      }

      function atualizar({ redesenhar = false } = {}) {
        const m = mesDe(st.periodo);
        if (st.modo === 'mes' && !m.temMes) st.modo = 'ano';
        controles();
        tiles();
        composicao();
        if (redesenhar && grafico) { grafico.destroy(); desenharGrafico(); } else if (grafico) grafico.update('none');
        if (iniciado) pareto(); // o Pareto segue o modo (mês × ano) escolhido no card de resultado
      }
      let iniciado = false; // gráficos só depois do tema aplicado (drawCharts)

      // Eventos delegados (os cards são redesenhados a cada mudança)
      document.addEventListener('click', (e) => {
        const parte = e.target.closest('[data-dp-parte]');
        if (parte) { st.parte = parte.dataset.dpParte; st.aberto = null; atualizar(); return; }
        const sub = e.target.closest('[data-dp-sub]');
        if (sub) { st.aberto = st.aberto === sub.dataset.dpSub ? null : sub.dataset.dpSub; composicao(); return; }
        const modo = e.target.closest('[data-dp-modo]');
        if (modo && !modo.disabled && modo.dataset.dpModo !== st.modo) { st.modo = modo.dataset.dpModo; st.aberto = null; atualizar({ redesenhar: true }); }
      });
      $('[data-dp-mes]', raiz).addEventListener('change', (e) => { st.periodo = e.target.value; st.aberto = null; atualizar(); });

      /** Evolução no ano: barras de receita líquida e custos, linha do lucro líquido; o mês escolhido fica em destaque */
      function desenharGrafico() {
        const el = document.getElementById('chart-dre-evolucao');
        if (!el) return;
        const serie = (campo) => dp.meses.map((m) => { const t = totais(dados(m)?.grupos); return t ? t[campo] : null; });
        const lucro = serie('lucro');
        const realce = (cor) => (ctx) => (dp.meses[ctx.dataIndex]?.periodo === st.periodo ? cor : rgba(cor, 0.35));
        grafico = new Chart(el, {
          type: 'bar',
          data: {
            labels: dp.meses.map((m) => m.rotulo.slice(0, 3)),
            datasets: [
              { label: 'Receita líquida', data: serie('receita'), order: 2, backgroundColor: realce(PALETTE[0]), hoverBackgroundColor: PALETTE[0], borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
              { label: 'Custos', data: serie('custos'), order: 3, backgroundColor: realce(PALETTE[2]), hoverBackgroundColor: PALETTE[2], borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
              {
                type: 'line', label: 'Lucro líquido', data: lucro, order: 1, tension: 0.35,
                borderColor: PALETTE[1], borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7, pointBorderWidth: 2,
                pointBackgroundColor: lucro.map((v) => (v < 0 ? NEG : (cssVar('--ok') || '#009360'))), pointBorderColor: cssVar('--surface') || '#fff',
              },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: entrada(50),
            onHover: (ev, els) => { ev.native.target.style.cursor = els.length && dp.meses[els[0].index]?.carregado ? 'pointer' : 'default'; },
            onClick: (_ev, els) => {
              const m = els.length ? dp.meses[els[0].index] : null;
              if (!m || !m.carregado) return;
              st.periodo = m.periodo;
              st.aberto = null;
              atualizar();
            },
            plugins: {
              legend: { position: 'bottom', labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex } },
              tooltip: {
                filter: (c) => c.parsed.y != null,
                callbacks: {
                  label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}`,
                  footer: (items) => {
                    const m = dp.meses[items[0]?.dataIndex];
                    const t = totais(dados(m)?.grupos);
                    return t && t.receita ? `Margem líquida ${pct(t.lucro / t.receita)}` : '';
                  },
                },
              },
            },
            scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } } },
          },
        });
      }

      /* ---- Gráficos extras do painel (ponte, Pareto, conta): uma instância por canvas, refeita ao trocar dados ou tema ---- */
      const extras = {};
      const novoGrafico = (id, cfg) => {
        try { if (extras[id]) extras[id].destroy(); } catch { /* já destruído na troca de tema */ }
        const el = document.getElementById(id);
        extras[id] = el ? new Chart(el, cfg) : null;
        return extras[id];
      };
      const curtoRot = (t, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
      const sinal = (v) => `${v > 0 ? '+' : ''}${money(v)}`;

      /* ---- Ponte do lucro: lucro do período "de" → variação de cada subgrupo → lucro do período "para" ---- */
      const ponteRaiz = $('#dp-ponte');
      const carregados = dp.meses.filter((m) => m.carregado);
      const pst = { modo: 'mes', de: null, para: dp.periodo, passos: [] };
      if (ponteRaiz) {
        const i = carregados.findIndex((m) => m.periodo === dp.periodo);
        pst.de = (carregados[i - 1] || carregados[i]).periodo;
        pst.modo = mesDe(pst.de)?.temMes && mesDe(pst.para)?.temMes ? 'mes' : 'ano';
        $('[data-ponte-de]', ponteRaiz).value = pst.de;
        $('[data-ponte-para]', ponteRaiz).value = pst.para;
      }
      function ponte() {
        if (!ponteRaiz) return;
        const mDe = mesDe(pst.de);
        const mPara = mesDe(pst.para);
        const mesOk = !!(mDe?.temMes && mPara?.temMes);
        if (pst.modo === 'mes' && !mesOk) pst.modo = 'ano';
        $$('[data-ponte-modo]', ponteRaiz).forEach((b) => {
          const ativo = b.dataset.ponteModo === pst.modo;
          b.classList.toggle('ativo', ativo);
          b.setAttribute('aria-pressed', String(ativo));
          b.disabled = b.dataset.ponteModo === 'mes' && !mesOk;
          b.title = b.disabled ? 'Para comparar meses, carregue o FGI0 do mês anterior a cada um deles' : '';
        });
        const aviso = $('[data-ponte-aviso]', ponteRaiz);
        const msg = pst.de === pst.para ? 'Escolha dois períodos diferentes.'
          : !mesOk ? 'Comparando o acumulado no ano: para comparar só os meses, falta o FGI0 do mês anterior a um deles.' : '';
        aviso.textContent = msg;
        aviso.hidden = !msg;
        const dDe = dados(mDe, pst.modo);
        const dPara = dados(mPara, pst.modo);
        if (!dDe || !dPara) { pst.passos = []; novoGrafico('chart-dre-ponte', { type: 'bar', data: { labels: [], datasets: [] } }); return; }
        const lucroDe = totais(dDe.grupos).lucro;
        const lucroPara = totais(dPara.grupos).lucro;
        const chaves = new Set([...Object.keys(dDe.subgrupos), ...Object.keys(dPara.subgrupos)]);
        const nomes = {};
        [...chaves].forEach((k) => { const s = k.split('|')[1]; nomes[s] = (nomes[s] || 0) + 1; });
        let passos = [...chaves].map((k) => {
          const [g, s] = k.split('|');
          const suf = nomes[s] > 1 ? ` (${g === 'Custos' ? 'custo' : 'desp.'})` : '';
          return { k, g, rot: `${s}${suf}`, curto: `${curtoRot(s, suf ? 15 : 22)}${suf}`, v: (dPara.subgrupos[k] || 0) - (dDe.subgrupos[k] || 0) };
        }).filter((x) => !zeroV(x.v)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
        const resto = passos.slice(8);
        passos = passos.slice(0, 8);
        const somaResto = resto.reduce((a, x) => a + x.v, 0) + (lucroPara - lucroDe - [...passos, ...resto].reduce((a, x) => a + x.v, 0));
        if (Math.abs(somaResto) >= 1) { const rot = resto.length ? `Demais ${resto.length} itens` : 'Outros'; passos.push({ k: null, rot, curto: rot, v: somaResto }); }
        pst.passos = passos;
        let acc = lucroDe;
        const barras = [[0, lucroDe]];
        passos.forEach((x) => { barras.push([acc, acc + x.v]); acc += x.v; });
        barras.push([0, lucroPara]);
        const rotulos = [`Lucro ${mDe.rotulo}`, ...passos.map((x) => x.curto), `Lucro ${mPara.rotulo}`];
        const cores = barras.map((_, i) => (i === 0 || i === barras.length - 1 ? PALETTE[0] : passos[i - 1].v >= 0 ? (cssVar('--ok') || '#009360') : NEG));
        novoGrafico('chart-dre-ponte', {
          type: 'bar',
          data: { labels: rotulos, datasets: [{ data: barras, backgroundColor: cores.map((c) => rgba(c, 0.85)), hoverBackgroundColor: cores, borderRadius: 6, borderSkipped: false, maxBarThickness: 48 }] },
          options: {
            animation: entrada(60),
            onHover: (ev, els) => { ev.native.target.style.cursor = els.length && els[0].index > 0 && els[0].index <= passos.length && passos[els[0].index - 1].k ? 'pointer' : 'default'; },
            onClick: (_ev, els) => {
              const x = els.length ? passos[els[0].index - 1] : null;
              if (!x || !x.k) return;
              st.parte = dp.partes.find((p) => p.grupos.includes(x.g))?.id || st.parte;
              st.periodo = pst.para;
              st.modo = pst.modo;
              st.aberto = x.k;
              atualizar({ redesenhar: true });
              $('.dp-composicao')?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' });
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => { const i = items[0].dataIndex; return i === 0 || i === barras.length - 1 ? rotulos[i] : passos[i - 1].rot; },
                  label: (c) => { const i = c.dataIndex; return i === 0 || i === barras.length - 1 ? ` ${money(barras[i][1])}` : ` ${sinal(passos[i - 1].v)} no lucro`; },
                },
              },
            },
            scales: { x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } }, y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } } },
          },
        });
      }
      if (ponteRaiz) {
        ponteRaiz.addEventListener('change', (e) => {
          if (e.target.matches('[data-ponte-de]')) pst.de = e.target.value;
          if (e.target.matches('[data-ponte-para]')) pst.para = e.target.value;
          ponte();
        });
        ponteRaiz.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ponte-modo]');
          if (b && !b.disabled) { pst.modo = b.dataset.ponteModo; ponte(); }
        });
      }

      /* ---- Pareto: contas de custos (ou despesas) da maior para a menor, com o % acumulado e um corte ajustável ---- */
      const paretoRaiz = $('#dp-pareto');
      const pp = { parte: 'custos', corte: 80 };
      function pareto() {
        if (!paretoRaiz || !dp.pareto) return;
        const modo = st.modo === 'mes' && dp.pareto.mes ? 'mes' : 'ano';
        const fonte = dp.pareto[modo] || {};
        const disponiveis = ['custos', 'despesas'].filter((id) => fonte[id]);
        if (!disponiveis.includes(pp.parte) && disponiveis.length) pp.parte = disponiveis[0];
        $('[data-pareto-partes]', paretoRaiz).innerHTML = disponiveis.map((id) => `<button type="button" class="chip ${id === pp.parte ? 'active' : ''}" data-pareto-parte="${id}" aria-pressed="${id === pp.parte}">${parteDe[id].label}</button>`).join('');
        const d = fonte[pp.parte];
        $('[data-pareto-titulo]', paretoRaiz).textContent = d ? `· ${parteDe[pp.parte].label} · ${modo === 'mes' ? ultimo.rotulo : `jan a ${ultimo.rotulo}`}` : '';
        const nota = $('[data-pareto-nota]', paretoRaiz);
        const notas = [];
        if (st.periodo !== dp.periodo) notas.push(`O Pareto mostra a competência escolhida no topo (${ultimo.rotulo}).`);
        if (d?.demais) notas.push(`Fora do gráfico: mais ${num.format(d.demais.quantidade)} contas, que somam ${money(d.demais.valor)}.`);
        nota.textContent = notas.join(' ');
        nota.hidden = !notas.length;
        if (!d) { $('[data-pareto-resumo]', paretoRaiz).textContent = 'Sem contas nesta seleção.'; novoGrafico('chart-dre-pareto', { type: 'bar', data: { labels: [], datasets: [] } }); return; }
        let acc = 0;
        const acum = d.contas.map(([, , v]) => { acc += Math.abs(v); return (acc / d.totalAbs) * 100; });
        const dentro = (i) => (i === 0 ? 0 : acum[i - 1]) < pp.corte;
        const n = acum.findIndex((p) => p >= pp.corte) + 1 || d.contas.length;
        $('[data-pareto-resumo]', paretoRaiz).textContent = `${num.format(n)} de ${num.format(d.quantidade)} contas fazem ${pp.corte}% do valor · clique numa barra para ver a conta`;
        $('[data-pareto-corte-valor]', paretoRaiz).textContent = `${pp.corte}%`;
        novoGrafico('chart-dre-pareto', {
          type: 'bar',
          data: {
            labels: d.contas.map(([c]) => c.split(' - ')[0]),
            datasets: [
              { type: 'line', label: '% acumulado', data: acum, yAxisID: 'y2', order: 1, borderColor: PALETTE[1], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25 },
              { type: 'line', label: `Corte ${pp.corte}%`, data: acum.map(() => pp.corte), yAxisID: 'y2', order: 2, borderColor: rgba(PALETTE[8] || '#FDB913', 0.9), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0 },
              { label: 'Valor', data: d.contas.map(([, , v]) => Math.abs(v)), order: 3, backgroundColor: d.contas.map((_, i) => (dentro(i) ? rgba(PALETTE[0], 0.9) : rgba(PALETTE[0], 0.25))), hoverBackgroundColor: PALETTE[0], borderRadius: 3, borderSkipped: false, maxBarThickness: 18 },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: entrada(12),
            onHover: (ev, els) => { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: (_ev, els) => { if (els.length) buscarConta(d.contas[els[0].index][0].split(' - ')[0], true); },
            plugins: {
              legend: { position: 'bottom', labels: { filter: (l) => l.text !== 'Valor' } },
              tooltip: {
                callbacks: {
                  title: (items) => d.contas[items[0].dataIndex][0],
                  label: (c) => (c.dataset.label === 'Valor' ? ` ${money(d.contas[c.dataIndex][2])} · ${d.contas[c.dataIndex][1]}` : c.dataset.label === '% acumulado' ? ` Acumulado: ${pct(c.parsed.y / 100)}` : null),
                },
              },
            },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
              y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } },
              y2: { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { callback: (v) => `${v}%` } },
            },
          },
        });
      }
      if (paretoRaiz) {
        paretoRaiz.addEventListener('click', (e) => { const b = e.target.closest('[data-pareto-parte]'); if (b) { pp.parte = b.dataset.paretoParte; pareto(); } });
        $('[data-pareto-corte]', paretoRaiz).addEventListener('input', (e) => { pp.corte = Number(e.target.value); pareto(); });
      }

      /* ---- Buscar conta: número ou descrição → valor no ano, no mês, peso no grupo e evolução mês a mês ---- */
      const buscaRaiz = $('#dp-busca');
      const bst = { contas: [], escolhida: null, timer: null, pedido: 0 };
      async function buscarConta(termo, escolherPrimeira = false) {
        if (!buscaRaiz) return;
        const campo = $('[data-busca-campo]', buscaRaiz);
        if (campo.value !== termo) campo.value = termo;
        const lista = $('[data-busca-lista]', buscaRaiz);
        if (String(termo).trim().length < 2) { lista.innerHTML = ''; bst.contas = []; return; }
        const pedido = ++bst.pedido;
        lista.innerHTML = '<li class="note">Buscando…</li>';
        try {
          const r = await fetch(`/api/dre/contas?q=${encodeURIComponent(termo)}`, { headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          if (pedido !== bst.pedido) return; // chegou uma busca mais nova
          bst.contas = j.contas || [];
          if (!bst.contas.length) { lista.innerHTML = '<li class="note">Nenhuma conta encontrada nesta seleção.</li>'; $('[data-busca-detalhe]', buscaRaiz).hidden = true; return; }
          lista.innerHTML = bst.contas.map((c, i) => { const sep = c.conta.indexOf(' - '); return `<li><button type="button" class="dp-busca-item ${bst.escolhida === c.conta ? 'ativo' : ''}" data-busca-i="${i}"><span class="dp-conta-nome"><span class="pop-cod">${esc(sep > 0 ? c.conta.slice(0, sep) : c.conta)}</span>${esc(sep > 0 ? c.conta.slice(sep + 3) : '')}</span><span class="num ${c.ano < 0 ? 'neg' : ''}">${curto(c.ano)}</span></button></li>`; }).join('');
          if (escolherPrimeira) mostrarConta(0);
        } catch (err) {
          if (pedido === bst.pedido) lista.innerHTML = `<li class="note">Não foi possível buscar agora (${esc(err.message)}).</li>`;
        }
      }
      function mostrarConta(i) {
        const c = bst.contas[i];
        if (!c) return;
        bst.escolhida = c.conta;
        $$('.dp-busca-item', buscaRaiz).forEach((b) => b.classList.toggle('ativo', Number(b.dataset.buscaI) === i));
        const det = $('[data-busca-detalhe]', buscaRaiz);
        det.hidden = false;
        $('[data-busca-nome]', buscaRaiz).textContent = c.conta;
        $('[data-busca-grupo]', buscaRaiz).textContent = c.grupos.join(' · ');
        const cel = (rot, v, extra = '') => `<div><span>${rot}</span><strong class="${v < 0 ? 'neg' : ''}">${v == null ? '—' : money(v)}</strong>${extra}</div>`;
        $('[data-busca-nums]', buscaRaiz).innerHTML = cel(`Jan a ${ultimo.rotulo}`, c.ano)
          + cel(`Em ${ultimo.rotulo}`, c.mes, c.mes == null ? '<small>sem o mês anterior</small>' : '')
          + `<div><span>Peso no grupo</span><strong>${c.pesoGrupo == null ? '—' : pct(c.pesoGrupo)}</strong><small>${esc(c.grupos[0] || '')}</small></div>`;
        desenharConta();
        det.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'nearest' });
      }
      function desenharConta() {
        const c = bst.contas.find((x) => x.conta === bst.escolhida);
        if (!c) return;
        novoGrafico('chart-dre-conta', {
          type: 'bar',
          data: {
            labels: c.serie.map((x) => x.rotulo.slice(0, 3)),
            datasets: [
              { type: 'line', label: 'Acumulado no ano', data: c.serie.map((x) => x.ano), order: 1, borderColor: PALETTE[1], borderWidth: 2, pointRadius: 3, tension: 0.3, spanGaps: true },
              { label: 'No mês', data: c.serie.map((x) => x.mes), order: 2, backgroundColor: c.serie.map((x) => rgba((x.mes || 0) < 0 ? PALETTE[2] : PALETTE[0], 0.85)), borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: entrada(40),
            plugins: { legend: { position: 'bottom' }, tooltip: { filter: (x) => x.parsed.y != null, callbacks: { label: (x) => ` ${x.dataset.label}: ${money(x.parsed.y)}` } } },
            scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } } },
          },
        });
      }
      if (buscaRaiz) {
        $('[data-busca-campo]', buscaRaiz).addEventListener('input', (e) => {
          clearTimeout(bst.timer);
          bst.timer = setTimeout(() => buscarConta(e.target.value), 300);
        });
        buscaRaiz.addEventListener('click', (e) => { const b = e.target.closest('[data-busca-i]'); if (b) mostrarConta(Number(b.dataset.buscaI)); });
      }

      /* ---- Simulador "e se": variação % em cada alavanca sobre uma base (mês, média de 3 meses ou ano) ---- */
      const simRaiz = $('#dp-simulador');
      const ALAVANCAS = [
        { id: 'receita', rot: 'Receita', ajuda: 'As deduções (impostos) acompanham a receita' },
        { id: 'salarios', rot: 'Salários e encargos', ajuda: 'Custo de pessoal' },
        { id: 'materiais', rot: 'Materiais aplicados', ajuda: '' },
        { id: 'servicos', rot: 'Serviços de terceiros', ajuda: 'Inclui aluguel de equipamentos' },
        { id: 'outros', rot: 'Demais custos', ajuda: 'Depreciação, viagens, impostos e outros' },
        { id: 'despesas', rot: 'Despesas operacionais', ajuda: 'G&A, provisões e outras' },
      ];
      const sim = { base: dp.meses[dp.meses.length - 1].temMes ? 'mes' : 'ano', ajustes: Object.fromEntries(ALAVANCAS.map((a) => [a.id, 0])) };
      const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      /** Divide um período (grupos + subgrupos da DRE) nas alavancas do simulador */
      function alavancasDe(d) {
        const v = { receita: 0, salarios: 0, materiais: 0, servicos: 0, outros: 0, despesas: 0, fixo: 0 };
        for (const [k, x] of Object.entries(d.subgrupos)) {
          const [g, s] = k.split('|');
          const n = norm(s);
          if (parteDe.receita.grupos.includes(g)) v.receita += x;
          else if (g === 'Custos') {
            if (n.startsWith('salarios')) v.salarios += x;
            else if (n.startsWith('materiais')) v.materiais += x;
            else if (n.startsWith('contratacao de servicos')) v.servicos += x;
            else v.outros += x;
          } else if (parteDe.despesas.grupos.includes(g)) v.despesas += x;
          else v.fixo += x;
        }
        // diferença de arredondamento entre grupos e subgrupos fica no que não muda
        v.fixo += totais(d.grupos).lucro - Object.values(v).reduce((a, x) => a + x, 0);
        return v;
      }
      function baseSim() {
        if (sim.base === 'ano') return { v: alavancasDe(ultimo.ano), rot: `jan a ${ultimo.rotulo}`, receitaRef: totais(ultimo.ano.grupos).receita };
        const comMes = dp.meses.filter((m) => m.temMes);
        if (sim.base === 'mes' || comMes.length <= 1) {
          if (!ultimo.temMes) return null;
          return { v: alavancasDe(ultimo.mes), rot: ultimo.rotulo, receitaRef: totais(ultimo.mes.grupos).receita };
        }
        const ult3 = comMes.slice(-3);
        const soma = {};
        ult3.forEach((m) => Object.entries(alavancasDe(m.mes)).forEach(([k, x]) => { soma[k] = (soma[k] || 0) + x / ult3.length; }));
        return { v: soma, rot: `média de ${ult3.map((m) => m.rotulo).join(', ')}`, receitaRef: ult3.reduce((a, m) => a + totais(m.mes.grupos).receita, 0) / ult3.length };
      }
      function simulador() {
        if (!simRaiz) return;
        $('[data-sim-base]', simRaiz).value = sim.base;
        const b = baseSim();
        const aviso = $('[data-sim-aviso]', simRaiz);
        const comMes = dp.meses.filter((m) => m.temMes).length;
        const msg = !b ? `Sem o FGI0 do mês anterior não dá para separar ${ultimo.rotulo}: use o acumulado no ano.`
          : sim.base === 'media3' && comMes < 2 ? 'Só há um mês com valor separado: a média usa esse mês.' : '';
        aviso.textContent = msg;
        aviso.hidden = !msg;
        const lista = $('[data-sim-alavancas]', simRaiz);
        if (!lista.childElementCount) {
          lista.innerHTML = ALAVANCAS.map((a) => `<div class="dp-sim-alavanca">
              <label for="sim-${a.id}"><span>${a.rot}</span><output data-sim-out="${a.id}">0%</output></label>
              <input type="range" id="sim-${a.id}" min="-30" max="30" step="1" value="0" data-sim-ajuste="${a.id}">
              <small data-sim-efeito="${a.id}">${esc(a.ajuda)}</small>
            </div>`).join('');
        }
        const res = $('[data-sim-resultado]', simRaiz);
        if (!b) { res.innerHTML = ''; return; }
        const base = b.v;
        const lucroBase = Object.values(base).reduce((a, x) => a + x, 0);
        const fator = (id) => 1 + sim.ajustes[id] / 100;
        const sim_ = { ...base };
        ALAVANCAS.forEach((a) => { sim_[a.id] = base[a.id] * fator(a.id); });
        const lucroSim = Object.values(sim_).reduce((a, x) => a + x, 0);
        const rlSim = b.receitaRef * fator('receita');
        const margemBase = b.receitaRef ? lucroBase / b.receitaRef : null;
        const margemSim = rlSim ? lucroSim / rlSim : null;
        ALAVANCAS.forEach((a) => {
          const aj = sim.ajustes[a.id];
          $(`[data-sim-ajuste="${a.id}"]`, simRaiz).value = aj;
          $(`[data-sim-out="${a.id}"]`, simRaiz).textContent = `${aj > 0 ? '+' : ''}${aj}%`;
          const efeito = sim_[a.id] - base[a.id];
          $(`[data-sim-efeito="${a.id}"]`, simRaiz).innerHTML = aj ? `<b class="${efeito < 0 ? 'neg' : 'pos'}">${sinal(efeito)}</b> no lucro` : `${esc(a.ajuda || '')}${a.ajuda ? ' · ' : ''}base ${curto(base[a.id])}`;
        });
        const dif = lucroSim - lucroBase;
        res.innerHTML = `<p class="dp-sim-base">Base: ${esc(b.rot)}</p>
          <div class="dp-sim-num"><span>Lucro na base</span><strong class="${lucroBase < 0 ? 'neg' : ''}">${money(lucroBase)}</strong><small>Margem ${margemBase == null ? '—' : pct(margemBase)}</small></div>
          <div class="dp-sim-num destaque"><span>Lucro simulado</span><strong class="${lucroSim < 0 ? 'neg' : 'pos'}">${money(lucroSim)}</strong><small>Margem ${margemSim == null ? '—' : pct(margemSim)}</small></div>
          <div class="dp-sim-num"><span>Diferença</span><strong class="${zeroV(dif) ? '' : dif < 0 ? 'neg' : 'pos'}">${zeroV(dif) ? money(0) : sinal(dif)}</strong><small>${margemBase != null && margemSim != null ? `${((margemSim - margemBase) * 100 >= 0 ? '+' : '')}${((margemSim - margemBase) * 100).toFixed(1).replace('.', ',')} p.p. de margem` : ''}</small></div>
          <p class="note">Cada 1% a mais em salários muda o lucro em ${money(base.salarios / 100)}; cada 1% a mais de receita, em ${money(base.receita / 100)}.</p>`;
      }
      if (simRaiz) {
        simRaiz.addEventListener('input', (e) => { const r = e.target.closest('[data-sim-ajuste]'); if (r) { sim.ajustes[r.dataset.simAjuste] = Number(r.value); simulador(); } });
        simRaiz.addEventListener('change', (e) => { if (e.target.matches('[data-sim-base]')) { sim.base = e.target.value; simulador(); } });
        $('[data-sim-zerar]', simRaiz).addEventListener('click', () => { Object.keys(sim.ajustes).forEach((k) => { sim.ajustes[k] = 0; }); simulador(); });
      }

      /** Redesenha todos os gráficos do painel (primeira carga e troca de tema) */
      function desenharGraficos() {
        iniciado = true;
        desenharGrafico();
        ponte();
        pareto();
        if (bst.escolhida) desenharConta();
      }

      atualizar();
      simulador();
      // Vindo da busca rápida da Visão Geral (/modulos/dre#conta=5321600000): abre a conta no card "Buscar conta"
      const doHash = decodeURIComponent((location.hash.match(/^#conta=(.+)$/) || [])[1] || '');
      if (doHash && buscaRaiz) {
        buscarConta(doHash, true);
        setTimeout(() => buscaRaiz.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' }), 150);
      }
      return { desenharGrafico: desenharGraficos, aoAtualizar: pareto };
    }
    const painelDre = data.dre ? criarPainelDre(data.dre) : null;

    /* ---- BP e Capital Empregado: painel patrimonial (services/painelPatrimonial.js) ----
       Destaques do capital de giro → filtram a composição; composição por seção (ativos por padrão) com variação e contas;
       ponte entre competências (BP: caixa; CE: capital empregado); evolução dos saldos; prazos médios com a DRE do mês. */
    function criarPainelPatrimonial(pp) {
      const raiz = $('#pp-destaques');
      if (!raiz || !pp.periodos.length) return null;
      const code = data.currency || 'BRL';
      const money = (v) => moneyFmt(code).format(v);
      const curto = (v) => moneyFmt(code, true).format(v);
      const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const zeroV = (v) => Math.abs(v || 0) < 0.005;
      const ehBp = pp.slug === 'bp';
      const recurso = ehBp ? 'caixa' : 'capital';
      const perDe = (p) => pp.periodos.find((x) => x.periodo === p);
      const antDe = (p) => { const i = pp.periodos.findIndex((x) => x.periodo === p); return i > 0 ? pp.periodos[i - 1] : null; };
      const mostra = (d, v) => (d.tipo === 'passivo' ? Math.abs(v || 0) : (v || 0));
      const secaoLabel = (key) => pp.secoes.find((s) => s.key === key)?.label || key;
      const st = { periodo: pp.periodo, secao: pp.secaoPadrao, ordem: 'valor', foco: null, aberto: null };
      const graf = {};
      const novoGrafico = (id, cfg) => {
        try { if (graf[id]) graf[id].destroy(); } catch { /* já destruído na troca de tema */ }
        const el = document.getElementById(id);
        graf[id] = el ? new Chart(el, cfg) : null;
        return graf[id];
      };

      function tiles() {
        const p = perDe(st.periodo);
        const a = antDe(st.periodo);
        $('[data-pp-titulo]', raiz).textContent = `· ${p.rotulo}`;
        $('[data-pp-mes]', raiz).value = st.periodo;
        $('[data-pp-tiles]', raiz).innerHTML = pp.destaques.map((d) => {
          const v = mostra(d, p.destaques[d.chave]);
          const va = a ? mostra(d, a.destaques[d.chave]) : null;
          const dv = va == null ? null : v - va;
          const consome = dv == null || zeroV(dv) ? null : (d.tipo === 'ativo') === (dv > 0);
          const variacao = dv == null ? '' : zeroV(dv) ? `<span class="dp-tile-var">= vs ${esc(a.rotulo)}</span>`
            : d.neutro ? `<span class="dp-tile-var">${dv > 0 ? '▲' : '▼'} ${curto(Math.abs(dv))} vs ${esc(a.rotulo)}</span>`
            : `<span class="dp-tile-var ${consome ? 'down' : 'up'}">${dv > 0 ? '▲' : '▼'} ${curto(Math.abs(dv))} vs ${esc(a.rotulo)} · ${consome ? 'consumiu' : 'liberou'} ${recurso}</span>`;
          const ativo = st.foco === d.chave;
          return `<button type="button" class="dp-tile ${ativo ? 'ativo' : ''}" data-pp-destaque="${d.chave}" aria-pressed="${ativo}">
            <span class="dp-tile-label">${esc(d.rotulo)}</span>
            <strong class="dp-tile-valor" title="${esc(money(v))}">${curto(v)}</strong>
            <span class="dp-tile-meta">${d.tipo === 'ativo' ? 'Ativo' : 'Passivo'} · ${esc(money(v))}</span>${variacao}</button>`;
        }).join('');
      }

      function composicao() {
        const p = perDe(st.periodo);
        const a = antDe(st.periodo);
        const foco = st.foco ? pp.destaques.find((d) => d.chave === st.foco) : null;
        const secoesComDados = pp.secoes.filter((s) => Object.keys(p.linhas).some((k) => k.startsWith(`${s.key}|`)));
        if (foco) { const s = foco.linhas[0]?.split('|')[0]; if (s) st.secao = s; }
        if (!secoesComDados.some((s) => s.key === st.secao) && secoesComDados.length) st.secao = secoesComDados[0].key;
        const box = $('#pp-composicao');
        $('[data-pp-secoes]', box).innerHTML = secoesComDados.map((s) => `<button type="button" class="chip ${s.key === st.secao ? 'active' : ''}" data-pp-secao="${esc(s.key)}" aria-pressed="${s.key === st.secao}">${esc(s.label)}</button>`).join('');
        const focoBox = $('[data-pp-foco]', box);
        focoBox.hidden = !foco;
        focoBox.innerHTML = foco ? `Mostrando só <strong>${esc(foco.rotulo)}</strong> <button type="button" class="btn btn-ghost" data-pp-foco-limpar>Ver todas as linhas</button>` : '';
        $$('[data-pp-ordem]', box).forEach((b) => { const at = b.dataset.ppOrdem === st.ordem; b.classList.toggle('ativo', at); b.setAttribute('aria-pressed', String(at)); });
        const chaves = new Set([...Object.keys(p.linhas), ...(a ? Object.keys(a.linhas) : [])]);
        let itens = [...chaves].filter((k) => k.startsWith(`${st.secao}|`) && (!foco || foco.linhas.includes(k)))
          .map((k) => { const [, g, l] = k.split('|'); const v = p.linhas[k] || 0; const va = a ? (a.linhas[k] || 0) : null; return { k, g, l, v, va, dv: va == null ? null : v - va }; })
          .filter((x) => !zeroV(x.v) || (x.dv != null && !zeroV(x.dv)));
        itens.sort(st.ordem === 'variacao' && a ? (x, y) => Math.abs(y.dv) - Math.abs(x.dv) : (x, y) => Math.abs(y.v) - Math.abs(x.v));
        const total = itens.reduce((s, x) => s + x.v, 0);
        const totalAbs = itens.reduce((s, x) => s + Math.abs(x.v), 0);
        const max = Math.max(...itens.map((x) => Math.abs(x.v)), 1);
        $('[data-pp-comp-titulo]', box).textContent = `· ${secaoLabel(st.secao)} · ${p.rotulo}`;
        $('[data-pp-comp-total]', box).textContent = itens.length ? `Total ${money(total)}${a ? ` · variação vs ${a.rotulo}: ${money(total - itens.reduce((s, x) => s + (x.va || 0), 0))}` : ''}` : '';
        const lista = $('[data-pp-barras]', box);
        if (!itens.length) { lista.innerHTML = '<li class="note">Sem saldos nesta seleção.</li>'; return; }
        const contas = st.periodo === pp.periodo ? pp.contas : null;
        lista.innerHTML = itens.map((x, i) => {
          const aberto = st.aberto === x.k;
          let det = '';
          if (aberto) {
            const cs = contas && contas[x.k];
            det = cs ? `<table class="pop-table pp-contas"><thead><tr><th>Conta</th><th class="num">${esc(p.rotulo)}</th>${pp.anterior ? `<th class="num">${esc(perDe(pp.anterior).rotulo)}</th><th class="num">Variação</th>` : ''}</tr></thead><tbody>${cs.map(([c, v, va]) => { const sep = c.indexOf(' - '); return `<tr><td><span class="pop-cod">${esc(sep > 0 ? c.slice(0, sep) : c)}</span>${esc(sep > 0 ? c.slice(sep + 3) : '')}</td><td class="num ${v < 0 ? 'neg' : ''}">${money(v)}</td>${pp.anterior ? `<td class="num ${va < 0 ? 'neg' : ''}">${money(va)}</td><td class="num">${zeroV(v - va) ? '—' : money(v - va)}</td>` : ''}</tr>`; }).join('')}</tbody></table>`
              : `<p class="note dp-contas-nota">${contas ? 'Esta linha não tem contas detalhadas.' : `O detalhe por conta está disponível na competência escolhida no topo (${esc(perDe(pp.periodo).rotulo)}).`}</p>`;
          }
          const varTxt = x.dv == null ? '' : zeroV(x.dv) ? '<span class="pp-var">=</span>' : `<span class="pp-var ${x.dv > 0 ? 'mais' : 'menos'}">${x.dv > 0 ? '▲' : '▼'} ${curto(Math.abs(x.dv))}</span>`;
          return `<li class="dp-barra ${aberto ? 'aberta' : ''}">
            <button type="button" class="dp-barra-btn" data-pp-linha="${esc(x.k)}" aria-expanded="${aberto}">
              <span class="dp-barra-nome">${esc(x.l)}<small>${esc(x.g)}</small></span>
              <span class="dp-barra-valor">${curto(x.v)}<small>${totalAbs ? pct(Math.abs(x.v) / totalAbs) : ''}</small>${varTxt}</span>
              <span class="dp-barra-trilho" aria-hidden="true"><span class="dp-barra-fill ${x.v < 0 ? 'negativo' : ''}" data-w="${(Math.abs(x.v) / max * 100).toFixed(1)}" data-d="${Math.min(i, 20) * 30}"></span></span>
            </button>${det}</li>`;
        }).join('');
        $$('.dp-barra-fill', lista).forEach((b) => { b.style.setProperty('--w', `${b.dataset.w}%`); b.style.setProperty('--d', `${b.dataset.d}ms`); });
      }

      /* Ponte: BP = caixa do período "de" → efeito no caixa de cada linha → caixa do período "para";
         CE = capital empregado "de" → variação de cada grupo → capital empregado "para" */
      const ponteRaiz = $('#pp-ponte');
      const pst = { de: (antDe(pp.periodo) || perDe(pp.periodo)).periodo, para: pp.periodo, passos: [] };
      if (ponteRaiz) { $('[data-pp-ponte-de]', ponteRaiz).value = pst.de; $('[data-pp-ponte-para]', ponteRaiz).value = pst.para; }
      function ponte() {
        if (!ponteRaiz) return;
        const de = perDe(pst.de);
        const para = perDe(pst.para);
        const aviso = $('[data-pp-ponte-aviso]', ponteRaiz);
        aviso.textContent = pst.de === pst.para ? 'Escolha duas competências diferentes.' : '';
        aviso.hidden = pst.de !== pst.para;
        const chaves = [...new Set([...Object.keys(de.linhas), ...Object.keys(para.linhas)])];
        const dif = (k) => (para.linhas[k] || 0) - (de.linhas[k] || 0);
        let inicio; let fim; let passos;
        if (ehBp) {
          const ehCaixa = (k) => (pp.ponte.caixa || []).includes(k);
          const soma = (l) => Object.entries(l).filter(([k]) => ehCaixa(k)).reduce((s, [, v]) => s + v, 0);
          inicio = soma(de.linhas); fim = soma(para.linhas);
          passos = chaves.filter((k) => !ehCaixa(k)).map((k) => { const [s, g, l] = k.split('|'); return { k, secao: s, rot: l, sub: g, v: (s === 'Passivo e PL' ? 1 : -1) * dif(k) }; });
        } else {
          inicio = Object.values(de.linhas).reduce((s, v) => s + v, 0); fim = Object.values(para.linhas).reduce((s, v) => s + v, 0);
          const porGrupo = new Map();
          chaves.forEach((k) => { const [s, g] = k.split('|'); const id = `${s}|${g}`; const o = porGrupo.get(id) || porGrupo.set(id, { k: id, secao: s, rot: g, sub: s, v: 0 }).get(id); o.v += dif(k); });
          passos = [...porGrupo.values()];
        }
        passos = passos.filter((x) => !zeroV(x.v)).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
        const resto = passos.slice(8);
        passos = passos.slice(0, 8);
        if (resto.length) passos.push({ k: null, rot: `Demais ${resto.length} itens`, v: resto.reduce((s, x) => s + x.v, 0) });
        const fecha = fim - inicio - passos.reduce((s, x) => s + x.v, 0);
        if (Math.abs(fecha) >= 1) passos.push({ k: null, rot: ehBp ? 'Diferença de fechamento' : 'Outros', v: fecha, nota: ehBp ? 'Contas desconsideradas (6 e 9) e, com filtro de obra, lançamentos em outros centros de lucro' : '' });
        pst.passos = passos;
        let acc = inicio;
        const barras = [[0, inicio]];
        passos.forEach((x) => { barras.push([acc, acc + x.v]); acc += x.v; });
        barras.push([0, fim]);
        const nomeTotal = ehBp ? 'Caixa' : 'Capital';
        const rotulos = [`${nomeTotal} ${de.rotulo}`, ...passos.map((x) => (x.rot.length > 22 ? `${x.rot.slice(0, 21)}…` : x.rot)), `${nomeTotal} ${para.rotulo}`];
        const bom = (v) => (ehBp ? v >= 0 : v <= 0); // BP: caixa subir é bom; CE: capital empregado cair é bom
        const cores = barras.map((_, i) => (i === 0 || i === barras.length - 1 ? PALETTE[0] : bom(passos[i - 1].v) ? (cssVar('--ok') || '#009360') : NEG));
        novoGrafico('chart-pp-ponte', {
          type: 'bar',
          data: { labels: rotulos, datasets: [{ data: barras, backgroundColor: cores.map((c) => rgba(c, 0.85)), hoverBackgroundColor: cores, borderRadius: 6, borderSkipped: false, maxBarThickness: 48 }] },
          options: {
            animation: entrada(60),
            onHover: (ev, els) => { ev.native.target.style.cursor = els.length && passos[els[0].index - 1]?.k ? 'pointer' : 'default'; },
            onClick: (_ev, els) => {
              const x = els.length ? passos[els[0].index - 1] : null;
              if (!x || !x.k) return;
              st.periodo = pst.para; st.foco = null; st.secao = x.secao; st.ordem = 'variacao';
              st.aberto = ehBp ? x.k : null;
              atualizar();
              $('#pp-composicao')?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => { const i = items[0].dataIndex; return i === 0 || i === barras.length - 1 ? rotulos[i] : `${passos[i - 1].rot}${passos[i - 1].sub ? ` · ${passos[i - 1].sub}` : ''}`; },
                  label: (c) => { const i = c.dataIndex; if (i === 0 || i === barras.length - 1) return ` ${money(barras[i][1])}`; const v = passos[i - 1].v; return ` ${v > 0 ? '+' : ''}${money(v)} no ${ehBp ? 'caixa' : 'capital empregado'}`; },
                  footer: (items) => { const i = items[0].dataIndex; return passos[i - 1]?.nota || ''; },
                },
              },
            },
            scales: { x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 40 } }, y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } } },
          },
        });
      }

      function evolucao() {
        const realce = (cor) => (ctx) => (pp.periodos[ctx.dataIndex]?.periodo === st.periodo ? 6 : 3);
        novoGrafico('chart-pp-evolucao', {
          type: 'line',
          data: {
            labels: pp.periodos.map((p) => p.rotulo),
            datasets: pp.destaques.map((d, i) => {
              const cor = PALETTE[i % PALETTE.length];
              return { label: d.rotulo, data: pp.periodos.map((p) => mostra(d, p.destaques[d.chave])), borderColor: cor, backgroundColor: cor, borderWidth: 2.2, tension: 0.3, pointRadius: realce(cor), pointHoverRadius: 7, borderDash: d.tipo === 'passivo' ? [6, 4] : [] };
            }),
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: reduzMovimento ? false : { duration: 900, easing: 'easeOutQuart' },
            onClick: (_ev, els) => { const p = els.length ? pp.periodos[els[0].index] : null; if (p) { st.periodo = p.periodo; st.aberto = null; atualizar(); } },
            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } },
            scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid, border: { display: false }, ticks: { callback: (v) => curto(v) } } },
          },
        });
      }

      function prazos() {
        const box = $('#pp-prazos');
        if (!box) return;
        const p = perDe(pp.periodo);
        $('[data-pp-prazos-mes]', box).textContent = p.rotulo;
        const grid = $('[data-pp-prazos]', box);
        if (!pp.dre) { $('[data-pp-prazos-base]', box).textContent = ''; grid.innerHTML = '<p class="note">Sem DRE desta competência para calcular os prazos.</p>'; return; }
        $('[data-pp-prazos-base]', box).textContent = `Saldos de ${p.rotulo} × DRE (${pp.dre.base}) · 30 dias`;
        const d = p.destaques;
        const dias = (saldo, fluxo) => (fluxo > 0 && saldo != null ? (saldo / fluxo) * 30 : null);
        const pmr = dias(d.receber, pp.dre.receita);
        const pmp = dias(Math.abs(d.fornecedores || 0), Math.abs(pp.dre.custos));
        const pme = dias(d.estoque, Math.abs(pp.dre.materiais));
        const ciclo = pmr != null && pmp != null ? pmr + (pme || 0) - pmp : null;
        const fmtD = (v) => (v == null ? '—' : `${Math.round(v).toLocaleString('pt-BR')} dias`);
        const card = (rot, v, formula, extra = '') => `<div class="pp-prazo"><span>${rot}</span><strong>${fmtD(v)}</strong><small>${formula}</small>${extra}</div>`;
        grid.innerHTML = card('Prazo de recebimento', pmr, 'A receber ÷ receita líquida do mês × 30')
          + card('Prazo de pagamento', pmp, 'Fornecedores a pagar ÷ custos do mês × 30')
          + card('Giro do estoque', pme, 'Estoque ÷ materiais aplicados do mês × 30')
          + card('Ciclo financeiro', ciclo, 'Recebimento + estoque − pagamento', ciclo == null ? '' : `<em class="${ciclo > 0 ? 'neg' : 'pos'}">${ciclo > 0 ? `A obra financia ${Math.round(ciclo)} dias da operação` : 'Fornecedores financiam a operação'}</em>`);
      }

      function atualizar() {
        tiles();
        composicao();
        if (graf['chart-pp-evolucao']) graf['chart-pp-evolucao'].update('none');
      }

      raiz.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pp-destaque]');
        if (!b) return;
        st.foco = st.foco === b.dataset.ppDestaque ? null : b.dataset.ppDestaque;
        st.aberto = null;
        atualizar();
        if (st.foco) $('#pp-composicao')?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'nearest' });
      });
      $('[data-pp-mes]', raiz).addEventListener('change', (e) => { st.periodo = e.target.value; st.aberto = null; atualizar(); });
      $('#pp-composicao')?.addEventListener('click', (e) => {
        const sec = e.target.closest('[data-pp-secao]');
        if (sec) { st.secao = sec.dataset.ppSecao; st.foco = null; st.aberto = null; atualizar(); return; }
        if (e.target.closest('[data-pp-foco-limpar]')) { st.foco = null; atualizar(); return; }
        const ord = e.target.closest('[data-pp-ordem]');
        if (ord) { st.ordem = ord.dataset.ppOrdem; composicao(); return; }
        const lin = e.target.closest('[data-pp-linha]');
        if (lin) { st.aberto = st.aberto === lin.dataset.ppLinha ? null : lin.dataset.ppLinha; composicao(); }
      });
      if (ponteRaiz) {
        ponteRaiz.addEventListener('change', (e) => {
          if (e.target.matches('[data-pp-ponte-de]')) pst.de = e.target.value;
          if (e.target.matches('[data-pp-ponte-para]')) pst.para = e.target.value;
          ponte();
        });
      }

      tiles();
      composicao();
      prazos();
      return { desenharGrafico: () => { ponte(); evolucao(); } };
    }
    const painelPatrimonial = data.patrimonial ? criarPainelPatrimonial(data.patrimonial) : null;

    /* ---- Temas do balanço (services/temasBalanco.js) ----
       BP (contábil): notas explicativas por tema, com contas, comparativo, variação e análise vertical.
       CE (obra): "posição de liquidação da obra" (simulador) e "obrigações da obra" (pessoal, fornecedores, tributos). */
    function criarTemas(tb) {
      const code = data.currency || 'BRL';
      const money = (v) => moneyFmt(code).format(v);
      const curto = (v) => moneyFmt(code, true).format(v);
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const zeroV = (v) => Math.abs(v || 0) < 0.005;
      const pctFmt = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
      // Padrão contábil: negativos entre parênteses, sem símbolo de moeda na tabela
      const numCont = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const cont = (v) => (v == null ? '—' : zeroV(v) ? '–' : v < 0 ? `(${numCont.format(-v)})` : numCont.format(v));
      const nomeConta = (c) => { const sep = c.indexOf(' - '); return `<span class="pop-cod">${esc(sep > 0 ? c.slice(0, sep) : c)}</span>${esc(sep > 0 ? c.slice(sep + 3) : '')}`; };

      /* ---------- BP: notas explicativas ---------- */
      const notas = $('#tb-notas');
      if (notas) {
        const nst = { tema: tb.temas[0]?.id, abertos: new Set(), tudo: false };
        const temAnt = !!tb.anterior;
        const desenharNota = () => {
          $('[data-tb-abas]', notas).innerHTML = tb.temas.map((t, i) => `<button type="button" class="chip ${t.id === nst.tema ? 'active' : ''}" role="tab" aria-selected="${t.id === nst.tema}" data-tb-tema="${t.id}">Nota ${i + 1} · ${esc(t.rotulo)}</button>`).join('');
          const t = tb.temas.find((x) => x.id === nst.tema);
          const tabela = $('[data-tb-tabela]', notas);
          if (!t) { tabela.innerHTML = '<tbody><tr><td>Sem saldos nos temas desta seleção.</td></tr></tbody>'; return; }
          const totAbs = t.subtemas.reduce((s, x) => s + Math.abs(x.v), 0);
          // Análise vertical do total: 100% quando todos os subtemas têm o mesmo sinal; com redutores (ex.: a recuperar), não se aplica
          const mesmoSinal = t.subtemas.every((x) => x.v >= 0) || t.subtemas.every((x) => x.v <= 0);
          const linha = (rot, v, va, cls, total = false) => {
            const d = va == null ? null : v - va;
            const dp = va == null || zeroV(va) ? null : d / Math.abs(va);
            const av = total ? (mesmoSinal ? '100,0%' : '—') : totAbs ? pctFmt(Math.abs(v) / totAbs) : '—';
            return `<tr class="${cls}"><td>${rot}</td><td class="num">${cont(v)}</td>${temAnt ? `<td class="num">${cont(va)}</td><td class="num">${cont(d)}</td><td class="num">${pctFmt(dp)}</td>` : ''}<td class="num">${av}</td></tr>`;
          };
          const cab = `<thead><tr><th>${esc(t.rotulo)}</th><th class="num">${esc(tb.rotulo)}</th>${temAnt ? `<th class="num">${esc(tb.rotuloAnterior)}</th><th class="num">Variação</th><th class="num">Var. %</th>` : ''}<th class="num">AV %</th></tr></thead>`;
          let corpo = '';
          t.subtemas.forEach((s, i) => {
            const aberto = nst.tudo || nst.abertos.has(s.nome);
            corpo += linha(`<button type="button" class="tb-sub" data-tb-sub="${esc(s.nome)}" aria-expanded="${aberto}"><span class="caret">▾</span>${String.fromCharCode(97 + i)}) ${esc(s.nome)}</button>`, s.v, s.va, `tb-subtema ${aberto ? '' : 'collapsed'}`);
            if (aberto) s.contas.forEach(([c, v, va]) => { corpo += linha(nomeConta(c), v, va, 'tb-conta'); });
          });
          corpo += linha(t.id === 'tributos' ? 'Obrigação tributária líquida' : 'Total da nota', t.total, t.totalAnt, 'highlight', true);
          tabela.innerHTML = `${cab}<tbody>${corpo}</tbody>`;
          const rod = {
            folha: 'Subtemas pela descrição da conta. O IRRF retido dos empregados aparece na nota de Tributos.',
            tributos: 'A recuperar entra com sinal negativo (reduz a obrigação). Diferidos não têm efeito de caixa no curto prazo.',
            fornecedores: 'Recepção e conferência: material ou serviço recebido ainda sem nota fiscal ou medição. Retenções: valores retidos dos fornecedores como garantia contratual.',
          }[t.id];
          $('[data-tb-rodape]', notas).textContent = rod || '';
          $('[data-tb-expandir]', notas).textContent = nst.tudo ? 'Recolher contas' : 'Expandir contas';
        };
        notas.addEventListener('click', (e) => {
          const ab = e.target.closest('[data-tb-tema]');
          if (ab) { nst.tema = ab.dataset.tbTema; desenharNota(); return; }
          const sb = e.target.closest('[data-tb-sub]');
          if (sb) { const n = sb.dataset.tbSub; if (nst.abertos.has(n)) nst.abertos.delete(n); else nst.abertos.add(n); nst.tudo = false; desenharNota(); return; }
          if (e.target.closest('[data-tb-expandir]')) { nst.tudo = !nst.tudo; nst.abertos.clear(); desenharNota(); }
        });
        desenharNota();
      }

      /* ---------- CE: obrigações da obra ---------- */
      const deve = $('#tb-deve');
      if (deve) {
        const dst = { aberto: null };
        const folha = tb.liquidacao?.folhaMensal || Math.abs(tb.dre?.salarios || 0);
        const custosMes = Math.abs(tb.dre?.custos || 0);
        const desenharDeve = () => {
          const ordemObra = ['folha', 'fornecedores', 'tributos']; // linguagem de obra: pessoal, fornecedores, impostos
          $('[data-deve]', deve).innerHTML = tb.temas.slice().sort((a, b) => ordemObra.indexOf(a.id) - ordemObra.indexOf(b.id)).map((t) => {
            const d = t.totalAnt == null ? null : t.total - t.totalAnt;
            let destaque = '';
            if (t.id === 'folha' && folha) destaque = `Equivale a <strong>${(t.total / folha).toFixed(1).replace('.', ',')} meses</strong> de folha (folha do mês: ${curto(folha)})`;
            if (t.id === 'fornecedores') {
              const rc = t.subtemas.find((s) => /recep/i.test(s.nome));
              destaque = rc && !zeroV(rc.v) ? `<strong>${curto(rc.v)}</strong> recebidos sem nota ou medição: cobrar notas e medições dos fornecedores` : '';
              if (custosMes) destaque += `${destaque ? '<br>' : ''}Equivale a <strong>${Math.round((t.total / custosMes) * 30)} dias</strong> de custo da obra`;
            }
            if (t.id === 'tributos') {
              const ret = t.subtemas.find((s) => /retid/i.test(s.nome));
              destaque = ret && !zeroV(ret.v) ? `<strong>${curto(ret.v)}</strong> retidos de terceiros e empregados: repassar ao fisco no vencimento` : '';
            }
            const itens = t.subtemas.map((s) => {
              const k = `${t.id}|${s.nome}`;
              const aberto = dst.aberto === k;
              const ds = s.va == null ? null : s.v - s.va;
              return `<li class="${aberto ? 'aberto' : ''}"><button type="button" class="tb-deve-item" data-deve-item="${esc(k)}" aria-expanded="${aberto}">
                  <span>${esc(s.obra)}</span><span class="num">${curto(s.v)}${ds == null || zeroV(ds) ? '' : `<small class="${ds > 0 ? 'neg' : 'pos'}">${ds > 0 ? '▲' : '▼'} ${curto(Math.abs(ds))}</small>`}</span></button>
                  ${aberto ? `<ul class="dp-contas">${s.contas.map(([c, v]) => `<li><span class="dp-conta-nome">${nomeConta(c)}</span><span class="num">${money(v)}</span></li>`).join('')}</ul>` : ''}</li>`;
            }).join('');
            return `<section class="tb-deve-bloco">
                <header><span class="dp-tile-label">${esc(t.obra)}</span><strong>${curto(t.total)}</strong>
                ${d == null || zeroV(d) ? '' : `<span class="dp-tile-var ${d > 0 ? 'down' : 'up'}">${d > 0 ? '▲ subiu' : '▼ caiu'} ${curto(Math.abs(d))} vs ${esc(tb.rotuloAnterior)}</span>`}</header>
                ${destaque ? `<p class="tb-deve-destaque">${destaque}</p>` : ''}
                <ul class="tb-deve-lista">${itens}</ul></section>`;
          }).join('') || '<p class="note">Sem obrigações de pessoal, fornecedores ou impostos nesta seleção.</p>';
        };
        deve.addEventListener('click', (e) => { const b = e.target.closest('[data-deve-item]'); if (b) { dst.aberto = dst.aberto === b.dataset.deveItem ? null : b.dataset.deveItem; desenharDeve(); } });
        desenharDeve();
      }

      /* ---------- CE: posição de liquidação da obra ---------- */
      const enc = $('#tb-encerrar');
      if (enc && tb.liquidacao) {
        const L = tb.liquidacao;
        const padrao = () => Object.fromEntries(L.recursos.map((r) => [r.id, r.realizacao]));
        const est = { real: padrao(), rescisao: 0 };
        const ajustes = $('[data-enc-ajustes]', enc);
        ajustes.innerHTML = `<h3 class="tb-enc-tit">Premissas de realização</h3>${L.recursos.map((r) => `<div class="dp-sim-alavanca${r.fixo ? ' fixo' : ''}">
            <label for="enc-${r.id}"><span>${esc(r.nome)} <small>${curto(r.valor)}</small></span><output data-enc-out="${r.id}">${r.realizacao}%</output></label>
            ${r.fixo ? '<small>Despesa antecipada: sem realização financeira</small>' : `<input type="range" id="enc-${r.id}" min="0" max="100" step="5" value="${r.realizacao}" data-enc-real="${r.id}">`}
          </div>`).join('')}
          ${L.folhaMensal ? `<h3 class="tb-enc-tit">Custos adicionais de desmobilização</h3><div class="dp-sim-alavanca">
            <label for="enc-resc"><span>Verbas rescisórias adicionais <small>além das provisionadas</small></span><output data-enc-resc-out>0 mês</output></label>
            <input type="range" id="enc-resc" min="0" max="3" step="0.5" value="0" data-enc-resc>
            <small>Em meses de folha (folha do mês: ${curto(L.folhaMensal)}), por exemplo aviso prévio indenizado</small></div>` : ''}`;
        const calcular = () => {
          const recursos = L.recursos.map((r) => ({ ...r, considerado: r.valor * (r.fixo ? 0 : est.real[r.id] / 100) }));
          const extra = L.folhaMensal ? L.folhaMensal * est.rescisao : 0;
          const obrigacoes = L.obrigacoes.concat(extra ? [{ id: 'rescisao', nome: 'Verbas rescisórias adicionais (simulação)', valor: extra }] : []);
          const totR = recursos.reduce((s, r) => s + r.considerado, 0);
          const totO = obrigacoes.reduce((s, o) => s + o.valor, 0);
          const pos = totR - totO;
          const max = Math.max(totR, totO, 1);
          const barra = (itens, campo, cls) => `<div class="tb-enc-barra ${cls}">${itens.filter((x) => x[campo] > 0).map((x, i) => `<span class="tb-enc-seg s${i % 6}" data-w="${(x[campo] / max * 100).toFixed(2)}" title="${esc(x.nome)}: ${esc(money(x[campo]))}"></span>`).join('')}</div>`;
          const lista = (itens, campo) => `<ul class="tb-enc-lista">${itens.filter((x) => x[campo] > 0).map((x, i) => `<li><i class="s${i % 6}"></i><span>${esc(x.nome)}</span><b>${curto(x[campo])}</b></li>`).join('')}</ul>`;
          $('[data-enc-resultado]', enc).innerHTML = `
            <div class="tb-enc-posicao ${pos >= 0 ? 'sobra' : 'falta'}">
              <span>${pos >= 0 ? 'Superávit de liquidação' : 'Déficit de liquidação'}</span><strong>${money(Math.abs(pos))}</strong>
              <small>${pos >= 0 ? 'Os recursos realizáveis cobrem as obrigações exigíveis' : 'Necessidade de aporte para liquidação das obrigações'}</small>
            </div>
            <div class="tb-enc-comp">
              <div><h4>Obrigações exigíveis <b>${money(totO)}</b></h4>${barra(obrigacoes, 'valor', 'obr')}${lista(obrigacoes, 'valor')}</div>
              <div><h4>Recursos realizáveis <b>${money(totR)}</b></h4>${barra(recursos, 'considerado', 'rec')}${lista(recursos, 'considerado')}</div>
            </div>
            ${L.trocas.length ? `<p class="note">Reclassificadas pelo sinal do saldo: ${L.trocas.map((x) => `${esc(x.linha)} (${money(x.valor)})`).join(', ')}.</p>` : ''}`;
          $$('.tb-enc-seg', enc).forEach((s) => s.style.setProperty('--w', `${s.dataset.w}%`));
          L.recursos.forEach((r) => { const o = $(`[data-enc-out="${r.id}"]`, enc); if (o) o.textContent = r.fixo ? '0%' : `${est.real[r.id]}%`; });
          const ro = $('[data-enc-resc-out]', enc);
          if (ro) ro.textContent = `${String(est.rescisao).replace('.', ',')} ${est.rescisao === 1 ? 'mês' : 'meses'}`;
        };
        enc.addEventListener('input', (e) => {
          const r = e.target.closest('[data-enc-real]');
          if (r) { est.real[r.dataset.encReal] = Number(r.value); calcular(); return; }
          if (e.target.matches('[data-enc-resc]')) { est.rescisao = Number(e.target.value); calcular(); }
        });
        $('[data-enc-zerar]', enc).addEventListener('click', () => {
          est.real = padrao(); est.rescisao = 0;
          $$('[data-enc-real]', enc).forEach((i) => { i.value = est.real[i.dataset.encReal]; });
          const rs = $('[data-enc-resc]', enc); if (rs) rs.value = 0;
          calcular();
        });
        calcular();
      }
    }
    if (data.temas) criarTemas(data.temas);

    function drawCharts() {
    applyChartTheme();
    // Tela de módulo
    (data.charts || []).forEach((c) => render(`chart-${c.id}`, c));
    if (painelDre) painelDre.desenharGrafico();
    if (painelPatrimonial) painelPatrimonial.desenharGrafico();

    // Dashboard
    if (data.trend) {
      const el = $('#chart-trend');
      if (el && data.trend.labels.length) {
        // Receita em área com degradê; lucro em linha por cima (pontos verdes/vermelhos conforme o sinal)
        const poucos = data.trend.labels.length < 3;
        new Chart(el, {
          type: 'line',
          data: {
            labels: data.trend.labels,
            datasets: [
              {
                type: poucos ? 'bar' : 'line', label: 'Receita líquida', data: data.trend.receita, order: 2,
                fill: true, tension: 0.4, borderColor: PALETTE[0], borderWidth: 2.5,
                backgroundColor: poucos ? degrade(PALETTE[0]) : area(PALETTE[0]), borderRadius: 8, maxBarThickness: 56,
                pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: cssVar('--surface') || '#fff', pointBorderColor: PALETTE[0], pointBorderWidth: 2,
              },
              {
                type: 'line', label: 'Lucro líquido', data: data.trend.lucro, order: 1, tension: 0.4,
                borderColor: PALETTE[1], borderWidth: 2.5, borderDash: [6, 4],
                pointRadius: 5, pointHoverRadius: 7,
                pointBackgroundColor: data.trend.lucro.map((v) => (v < 0 ? NEG : (cssVar('--ok') || '#009360'))), pointBorderColor: cssVar('--surface') || '#fff', pointBorderWidth: 2,
              },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: reduzMovimento ? false : { duration: 1100, easing: 'easeOutQuart' },
            // Legenda na ordem dos datasets (Receita | Lucro), não pela ordem de desenho
            plugins: { legend: { position: 'bottom', labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex } }, tooltip: tooltipMoneyIn(data.currency) },
            scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid, border: { display: false }, ticks: { callback: (v) => moneyFmt(data.currency, true).format(v) } } },
          },
        });
      } else if (el) el.parentElement.innerHTML = '<p class="note">Sem dados de DRE carregados.</p>';
      render('chart-bp', data.bp);
      render('chart-ar', data.agingReceber);
      render('chart-ap', data.agingPagar);
    }
    }

    drawCharts();
    document.addEventListener('themechange', () => {
      Object.values(Chart.instances).forEach((ch) => ch.destroy());
      drawCharts();
    });
  }

  /* ---------- Sobre: se a foto do GitHub não carregar, ficam as iniciais ---------- */
  $$('img[data-foto]').forEach((img) => {
    const falhou = () => img.remove();
    if (img.complete && !img.naturalWidth) falhou(); else img.addEventListener('error', falhou);
  });

  /* ---------- Seguros: linha do tempo horizontal do fluxo de apropriação ---------- */
  document.querySelectorAll('.fm-barra[data-h]').forEach((b) => b.style.setProperty('--h', `${b.dataset.h}%`));
  const trilha = document.querySelector('.fluxo-trilha');
  const atualMes = trilha && trilha.querySelector('.fluxo-mes.atual');
  // Abre a trilha já com a competência no meio (depois que a página termina de montar)
  const centrarCompetencia = () => {
    if (trilha && atualMes) trilha.scrollTo({ left: Math.max(0, atualMes.offsetLeft - trilha.clientWidth / 2 + atualMes.offsetWidth / 2), behavior: 'instant' });
  };
  if (document.readyState === 'complete') setTimeout(centrarCompetencia, 0); else window.addEventListener('load', centrarCompetencia);

  /* ---------- Indicadores: ponteiro do velocímetro gira até o valor ---------- */
  document.querySelectorAll('.g-ponteiro[data-ang]').forEach((p) => p.style.setProperty('--ang', `${p.dataset.ang}deg`));

  /* ---------- Vincular conta "a classificar" (administradores): popup com conta de referência ----------
     Clique numa conta pendente (lista do olho ou linha "a classificar" do BP) → escolha uma conta parecida
     já classificada; o sistema copia a classificação dela (Plano de Contas e Mapeamento) para a conta nova. */
  const prefsV = (() => { try { return JSON.parse(document.getElementById('user-prefs')?.textContent || '{}'); } catch { return {}; } })();
  async function vincularConta(conta) {
    if (!prefsV.admin) { aviso({ titulo: 'Somente administradores', texto: 'Peça a um administrador para vincular esta conta no Plano de Contas.' }); return; }
    // Contas de resultado (4 e 5) podem ter uma classificação por categoria da DRE; a área funcional do FGI0 escolhe qual vale
    const resultado = /^[45]/.test(conta);
    const d = document.createElement('dialog');
    d.className = 'modal popup vinc-dialog';
    d.innerHTML = `<h2>Vincular conta <span class="vinc-conta"></span></h2>
      <p data-texto></p>
      <div class="vinc-regra" data-regra hidden><strong>Custo ou despesa?</strong> Na importação do FGI0, a área funcional de cada lançamento decide: <b>Z001</b> e <b>Z002</b> → Despesas Gerais e Administrativas; <b>Z003</b>, <b>Z004</b>, <b>Z005</b> ou vazia → Custos. Por isso, escolha uma referência de cada categoria em que a conta pode aparecer.</div>
      <div class="vinc-ja" data-ja hidden></div>
      <div class="field"><label for="vinc-desc">Descrição da conta (opcional)</label><input class="input" id="vinc-desc" maxlength="120" autocomplete="off"></div>
      <div class="field"><label for="vinc-busca" data-rotulo></label><input class="input" id="vinc-busca" type="search" placeholder="Buscar por código ou descrição…" autocomplete="off"></div>
      <ul class="vinc-lista" role="listbox" aria-label="Contas de referência"></ul>
      <ul class="vinc-escolhas" aria-live="polite" hidden></ul>
      <p class="field-error" data-erro hidden></p>
      <div class="modal-actions popup-acoes"><button type="button" class="btn btn-ghost" data-cancelar>Cancelar</button><button type="button" class="btn btn-primary" data-vincular disabled>Vincular</button></div>`;
    d.querySelector('.vinc-conta').textContent = conta;
    d.querySelector('[data-texto]').textContent = resultado
      ? 'Conta de resultado: pode repetir no Plano de Contas, uma vez para cada categoria da DRE. Escolha uma conta parecida já classificada em cada categoria (por exemplo, uma de Custos e outra de Despesas Gerais e Administrativas).'
      : 'Conta de balanço: escolha uma conta parecida já classificada no Mapeamento de Contas. A conta nova recebe a mesma conta do grupo (que define a linha do BP) e a mesma linha do Capital Empregado.';
    d.querySelector('[data-regra]').hidden = !resultado;
    d.querySelector('[data-rotulo]').textContent = resultado ? 'Contas de referência (uma por categoria)' : 'Conta de referência';
    if (resultado) d.querySelector('.vinc-lista').setAttribute('aria-multiselectable', 'true');
    document.body.append(d);
    const busca = d.querySelector('#vinc-busca');
    const lista = d.querySelector('.vinc-lista');
    const escolhas = d.querySelector('.vinc-escolhas');
    const erro = d.querySelector('[data-erro]');
    const btn = d.querySelector('[data-vincular]');
    const refs = new Map(); // linha de referência escolhida (conta + posição) → linha da tabela
    const chave = (row) => `${row.conta}#${row._i ?? ''}`;
    let t;
    const fechar = () => { d.close(); d.remove(); };
    const classeDe = (row) => String(row.classe || '').trim().toLowerCase();
    const pintar = () => {
      lista.querySelectorAll('.vinc-op').forEach((x) => { const on = refs.has(x.dataset.chave); x.classList.toggle('ativo', on); x.setAttribute('aria-selected', on); });
      escolhas.replaceChildren();
      refs.forEach((row) => {
        const li = document.createElement('li');
        const txt = document.createElement('span');
        txt.textContent = resultado ? `${row.classe || 'Sem classe'} · ${row.n4 || row.n3 || ''} (como ${row.conta}, conta do grupo ${row.contaGrupo})` : `Vai receber: conta do grupo ${row.contaGrupo} · Capital Empregado: ${row.descGerencial || '—'} (como ${row.conta})`;
        li.append(txt);
        if (resultado) {
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'vinc-tirar'; x.textContent = '×'; x.title = 'Remover esta classificação'; x.setAttribute('aria-label', `Remover ${row.classe || row.conta}`);
          x.addEventListener('click', () => { refs.delete(chave(row)); pintar(); });
          li.append(x);
        }
        escolhas.append(li);
      });
      escolhas.hidden = !refs.size;
      btn.disabled = !refs.size;
      btn.textContent = refs.size > 1 ? `Vincular ${refs.size} classificações` : 'Vincular';
    };
    const escolher = (row) => {
      if (!resultado) { refs.clear(); refs.set(chave(row), row); pintar(); return; }
      if (refs.has(chave(row))) { refs.delete(chave(row)); pintar(); return; }
      // uma referência por categoria da DRE: outra da mesma classe substitui a anterior
      [...refs.values()].filter((r) => classeDe(r) === classeDe(row)).forEach((r) => refs.delete(chave(r)));
      refs.set(chave(row), row);
      pintar();
    };
    const procurar = async () => {
      const q = busca.value.trim();
      lista.innerHTML = '<li class="vinc-vazio">Buscando…</li>';
      try {
        const r = await fetch(`/api/parametros/${resultado ? 'plano-contas' : 'mapeamento-contas'}/linhas?size=8&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
        const dados = await r.json();
        lista.innerHTML = '';
        const rows = (dados.rows || []).filter((row) => row.conta !== conta);
        if (!rows.length) { lista.innerHTML = '<li class="vinc-vazio">Nenhuma conta encontrada.</li>'; return; }
        rows.forEach((row) => {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'vinc-op';
          b.dataset.chave = chave(row);
          b.setAttribute('role', 'option');
          const t1 = document.createElement('strong'); t1.textContent = `${row.conta} · ${row.descricao || ''}`;
          const t2 = document.createElement('span'); t2.textContent = resultado ? [row.n4, row.classe].filter(Boolean).join(' · ') : `Conta do grupo ${row.contaGrupo || '—'} · ${row.descGerencial || 'sem linha gerencial'}`;
          b.append(t1, t2);
          b.addEventListener('click', () => escolher(row));
          li.append(b);
          lista.append(li);
        });
        pintar();
      } catch { lista.innerHTML = '<li class="vinc-vazio">Não foi possível buscar agora.</li>'; }
    };
    busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(procurar, 250); });
    d.querySelector('[data-cancelar]').addEventListener('click', fechar);
    d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
    btn.addEventListener('click', async () => {
      if (!refs.size) return;
      btn.disabled = true; erro.hidden = true;
      try {
        const r = await fetch('/api/vincular-conta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': prefsV.csrf || '' },
          body: JSON.stringify({ conta, referencias: [...refs.values()].map((r) => ({ conta: r.conta, i: r._i })), descricao: d.querySelector('#vinc-desc').value }),
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || 'Não foi possível vincular.');
        const n = refs.size;
        fechar();
        aviso({ titulo: 'Conta vinculada', texto: `A conta ${conta} foi incluída no ${res.tabela === 'mapeamento-contas' ? 'Mapeamento de Contas' : 'Plano de Contas'}${n > 1 ? ` com ${n} classificações (a área funcional do FGI0 escolhe qual vale em cada lançamento)` : ''}. Para aparecer classificada nos relatórios, reimporte o FGI0 da competência.` });
      } catch (e2) { erro.textContent = e2.message; erro.hidden = false; btn.disabled = false; }
    });
    d.showModal();
    // a conta já está cadastrada? Então ela só aparece "a classificar" porque o FGI0 foi importado antes do cadastro
    fetch(`/api/parametros/${resultado ? 'plano-contas' : 'mapeamento-contas'}/linhas?size=20&q=${encodeURIComponent(conta)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((dados) => {
        const cad = (dados.rows || []).filter((row) => String(row.conta).toUpperCase() === conta.toUpperCase());
        if (!cad.length || !d.isConnected) return;
        const ja = d.querySelector('[data-ja]');
        const classes = [...new Set(cad.map((row) => (resultado ? row.classe : row.descGerencial || row.contaGrupo)).filter(Boolean))];
        const forte = document.createElement('strong');
        forte.textContent = `Esta conta já está classificada: ${classes.join(' / ') || 'cadastrada'}.`;
        ja.append(forte, ` Ela aparece como "a classificar" porque o FGI0 desta competência foi importado antes desse cadastro. Para corrigir, reimporte o FGI0.${resultado ? ' Só vincule de novo se a conta também puder aparecer em outra categoria da DRE.' : ''}`);
        ja.hidden = false;
        if (!resultado) { busca.disabled = true; lista.hidden = true; }
      })
      .catch(() => {});
    // começa sugerindo contas com o mesmo início do código
    busca.value = conta.replace(/[^0-9]/g, '').slice(0, 5);
    procurar();
    busca.focus();
  }
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest && e.target.closest('[data-classificar]');
    if (!alvo) return;
    e.preventDefault();
    e.stopPropagation();
    vincularConta(alvo.dataset.classificar);
  });

  /* ---------- Busca simples em tabelas da página (ex.: pedidos da conta 2115100000) ---------- */
  $$('[data-filtro-tabela]').forEach((inp) => {
    const tabela = document.querySelector(inp.dataset.filtroTabela);
    if (!tabela) return;
    const linhas = $$('tbody tr', tabela);
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      linhas.forEach((tr) => tr.classList.toggle('hidden', !!q && !tr.textContent.toLowerCase().includes(q)));
    });
  });

  /* ---------- Seguros e Garantias: linha do tempo de apropriação por contrato ---------- */
  const tlCard = $('#timeline-seguro');
  const tlSelect = $('#tl-contrato');
  if (tlCard && tlSelect) {
    const moeda = tlCard.dataset.moeda || 'BRL';
    const money = (v) => moneyFmt(moeda).format(v);
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const rotulo = (k) => { const [y, m] = k.split('-'); return `${MES[+m - 1]}/${y.slice(2)}`; };
    const resumo = $('[data-tl-resumo]', tlCard);
    const barra = $('[data-tl-barra]', tlCard);
    const corpo = $('[data-tl-linhas]', tlCard);
    let grafico = null;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    const desenhar = (tl) => {
      // Resumo do contrato
      resumo.replaceChildren(
        ...[
          ['Contrato', `${tl.contrato} · ${tl.denominacao}`],
          ['Seguradora', tl.seguradora],
          ['Vigência', `${fmtDate(tl.inicio)} a ${fmtDate(tl.fim)}`],
          ['Prêmio total', money(tl.premio)],
          [`Apropriado até ${rotulo(tl.competencia)}`, `${money(tl.acumuladoAteCompetencia)} (${String(tl.pctAteCompetencia).replace('.', ',')}%)`],
          ['A apropriar', money(tl.premio - tl.acumuladoAteCompetencia)],
        ].map(([k, v]) => { const d = el('div', 'tl-item'); d.append(el('span', null, k), el('strong', null, v)); return d; }),
      );
      // Barra de progresso do contrato, com a competência marcada
      const pct = Math.max(0, Math.min(100, tl.pctAteCompetencia));
      const trilho = el('div', 'tl-trilho');
      const feito = el('div', 'tl-feito');
      feito.style.setProperty('--tl-pct', `${pct}%`);
      const marca = el('div', 'tl-marca', `${String(pct).replace('.', ',')}% em ${rotulo(tl.competencia)}`);
      marca.style.setProperty('--tl-pct', `${pct}%`);
      trilho.append(feito, marca);
      const pontas = el('div', 'tl-pontas');
      pontas.append(el('span', null, rotulo(tl.meses[0].mes)), el('span', null, rotulo(tl.meses[tl.meses.length - 1].mes)));
      barra.replaceChildren(trilho, pontas);
      // Tabela mês a mês (a competência destacada)
      corpo.replaceChildren(...tl.meses.map((x) => {
        const tr = el('tr', `tl-${x.fase}`);
        tr.append(el('td', null, rotulo(x.mes) + (x.fase === 'atual' ? ' · competência' : '')), el('td', 'num', money(x.apropriado)), el('td', 'num', money(x.acumulado)), el('td', 'num', money(x.saldo)), el('td', 'num', `${String(x.pct).replace('.', ',')}%`));
        return tr;
      }));
      corpo.querySelector('.tl-atual')?.scrollIntoView({ block: 'nearest' });
      // Gráfico: barras do mês (realizado mais forte, futuro mais claro) + linha do acumulado em %
      if (!window.Chart) return;
      grafico?.destroy();
      const azul = '#3074F6';
      grafico = new Chart($('#chart-tl'), {
        data: {
          labels: tl.meses.map((x) => rotulo(x.mes)),
          datasets: [
            {
              type: 'bar', label: 'Apropriado no mês', data: tl.meses.map((x) => x.apropriado), yAxisID: 'y', order: 2,
              backgroundColor: tl.meses.map((x) => (x.fase === 'futuro' ? 'rgba(48, 116, 246, .28)' : x.fase === 'atual' ? '#06172B' : 'rgba(48, 116, 246, .85)')),
              borderRadius: 6, maxBarThickness: 28,
            },
            {
              type: 'line', label: '% apropriado (acumulado)', data: tl.meses.map((x) => x.pct), yAxisID: 'pct', order: 1,
              borderColor: '#00A1D4', borderWidth: 2.5, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, fill: false,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (c) => (c.dataset.yAxisID === 'pct' ? ` ${c.dataset.label}: ${String(c.parsed.y).replace('.', ',')}%` : ` ${c.dataset.label}: ${money(c.parsed.y)}`) } },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } },
            y: { border: { display: false }, ticks: { callback: (v) => moneyFmt(moeda, true).format(v) } },
            pct: { position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { callback: (v) => `${v}%` } },
          },
        },
      });
    };

    const carregar = async () => {
      const [empresa, contrato] = tlSelect.value.split('|');
      tlCard.classList.add('carregando');
      try {
        const r = await fetch(`/api/seguros/linha-do-tempo?empresa=${encodeURIComponent(empresa)}&contrato=${encodeURIComponent(contrato)}`, { headers: { Accept: 'application/json' } });
        if (r.status === 401) { window.location.href = '/login'; return; }
        const tl = await r.json();
        if (!r.ok) throw new Error(tl.error || 'Erro ao carregar');
        desenhar(tl);
      } catch (e) {
        resumo.replaceChildren(el('p', 'note', e.message));
      } finally {
        tlCard.classList.remove('carregando');
      }
    };
    tlSelect.addEventListener('change', carregar);
    carregar();
  }

  /* ---------- Demonstração em árvore: recolher/expandir grupos ---------- */
  const treeTable = $('#tree-table');
  if (treeTable) {
    // Grupo (ex.: "Ativo Circulante") → linhas
    const setGroup = (row, open) => {
      row.classList.toggle('collapsed', !open);
      row.setAttribute('aria-expanded', String(open));
      $$(`tr[data-parent="${row.dataset.group}"]`, treeTable).forEach((r) => r.classList.toggle('hidden', !open));
    };
    $$('tr[data-group]', treeTable).forEach((row) => {
      const fn = () => setGroup(row, row.classList.contains('collapsed'));
      row.addEventListener('click', fn);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    });

    /* Olho ao lado do valor: ao passar o mouse (ou focar) o olho abre e um popup mostra as contas contábeis
       que formam o valor; ao sair, o popup some e o olho fecha. O popup fica aberto enquanto o mouse estiver nele. */
    const pop = document.createElement('div');
    pop.className = 'eye-pop';
    pop.setAttribute('role', 'dialog');
    pop.hidden = true;
    document.body.append(pop);
    let atual = null;
    let timer = null;
    const posicionar = (btn) => {
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      let left = r.right - w;
      if (left < 12) left = 12;
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8); // sem espaço embaixo: abre para cima
      pop.style.setProperty('--pop-left', `${left}px`);
      pop.style.setProperty('--pop-top', `${top}px`);
    };
    const abrir = (btn) => {
      clearTimeout(timer);
      if (atual && atual !== btn) atual.classList.remove('aberto');
      atual = btn;
      btn.classList.add('aberto');
      pop.replaceChildren(btn.nextElementSibling.content.cloneNode(true));
      pop.hidden = false;
      posicionar(btn);
      void pop.offsetWidth; // aplica o estado inicial antes da transição de entrada
      pop.classList.add('show');
    };
    const fechar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pop.classList.remove('show');
        atual?.classList.remove('aberto');
        atual = null;
        setTimeout(() => { if (!atual) pop.hidden = true; }, 180);
      }, 160);
    };
    $$('[data-eye]', treeTable).forEach((btn) => {
      btn.addEventListener('mouseenter', () => abrir(btn));
      btn.addEventListener('mouseleave', fechar);
      btn.addEventListener('focus', () => abrir(btn));
      btn.addEventListener('blur', fechar);
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (atual === btn && pop.classList.contains('show')) fechar(); else abrir(btn); });
    });
    pop.addEventListener('mouseenter', () => clearTimeout(timer));
    pop.addEventListener('mouseleave', fechar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && atual) fechar(); });
    window.addEventListener('scroll', () => { if (atual) posicionar(atual); }, { passive: true });
    // Botão acompanha o estado: tudo aberto → "Recolher tudo"; algum grupo fechado → "Expandir tudo"
    const btn = $('[data-tree-toggle]');
    const syncBtn = () => {
      if (!btn) return;
      const aberto = $$('tr[data-group]', treeTable).every((r) => !r.classList.contains('collapsed'));
      btn.dataset.state = aberto ? 'open' : 'closed';
      btn.textContent = aberto ? 'Recolher tudo' : 'Expandir tudo';
      btn.setAttribute('aria-expanded', String(aberto));
    };
    if (btn) {
      btn.addEventListener('click', () => {
        const abrir = btn.dataset.state === 'closed';
        $$('tr[data-group]', treeTable).forEach((r) => setGroup(r, abrir));
        syncBtn();
      });
      $$('tr[data-group]', treeTable).forEach((r) => { r.addEventListener('click', syncBtn); r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') setTimeout(syncBtn); }); });
      syncBtn();
    }
  }

  /* ---------- Tabela paginada (server-side) ---------- */
  const tableCard = $('#data-table');
  if (tableCard) {
    const columns = JSON.parse(tableCard.dataset.columns);
    const endpoint = tableCard.dataset.endpoint;
    const tbody = $('tbody', tableCard);
    const info = $('.pager .info', tableCard);
    const prev = $('[data-page="prev"]', tableCard);
    const next = $('[data-page="next"]', tableCard);
    const first = $('[data-page="first"]', tableCard);
    const last = $('[data-page="last"]', tableCard);
    const pagesBox = $('[data-pages]', tableCard);
    const sizeSel = $('[data-page-size]', tableCard);
    const state = { page: 1, size: 25, q: '', sort: '', dir: 'asc', pages: 1 };
    // Linhas "fantasma" com brilho enquanto a página chega
    const shimmer = (n) => Array.from({ length: n }, () => `<tr class="sk-tr" aria-hidden="true">${columns.map(() => '<td><span class="sk sk-line"></span></td>').join('')}</tr>`).join('');
    // Botões de página: primeira, vizinhas da atual e última (com reticências)
    const paginas = (atual, total) => {
      const set = new Set([1, total, atual - 2, atual - 1, atual, atual + 1, atual + 2].filter((p) => p >= 1 && p <= total));
      const lista = [...set].sort((a, b) => a - b);
      const out = [];
      lista.forEach((p, i) => { if (i && p - lista[i - 1] > 1) out.push('…'); out.push(p); });
      return out;
    };
    const desenharPaginas = () => {
      if (!pagesBox) return;
      pagesBox.innerHTML = paginas(state.page, state.pages).map((p) => (p === '…'
        ? '<span class="pager-gap">…</span>'
        : `<button class="btn btn-ghost pager-num${p === state.page ? ' atual' : ''}" type="button" data-go="${p}"${p === state.page ? ' aria-current="page"' : ''}>${num.format(p)}</button>`)).join('');
    };
    pagesBox?.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { state.page = Number(b.dataset.go); load(); } });
    let ctrl;

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cell = (c, v) => {
      if (v == null || v === '') return '<td></td>';
      if (c.type === 'number') {
        const txt = c.format === 'currency' ? moneyFmt(tableCard.dataset.currency || 'BRL').format(v) : num.format(v);
        return `<td class="num${v < 0 ? ' neg' : ''}">${txt}</td>`;
      }
      if (c.type === 'date') return `<td>${fmtDate(v)}</td>`;
      if (c.type === 'badge') return `<td><span class="badge badge-giro" data-giro="${esc(v)}">${esc(v)}</span></td>`;
      return `<td>${esc(v)}</td>`;
    };

    /* Parâmetros: editar, excluir e incluir registros (tabela marcada com data-editavel) */
    const editavel = tableCard.dataset.editavel === '1';
    const chaveCol = tableCard.dataset.chave || columns[0]?.key;
    const csrfTok = (() => { try { return JSON.parse(document.getElementById('user-prefs')?.textContent || '{}').csrf || ''; } catch { return ''; } })();
    let linhasAtuais = [];
    const acoes = (n) => `<td class="param-acoes"><button class="icon-btn" type="button" data-editar="${n}" title="Editar" aria-label="Editar registro"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg></button><button class="icon-btn icon-btn-danger" type="button" data-excluir="${n}" title="Excluir" aria-label="Excluir registro"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg></button></td>`;
    const chamar = async (metodo, url, corpo) => {
      const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': csrfTok }, body: JSON.stringify(corpo || {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Não foi possível salvar.');
      return d;
    };
    const avisar = (msg, erro) => {
      const a = document.createElement('div');
      a.className = `alert ${erro ? 'alert-err' : 'alert-ok'} param-aviso`;
      a.setAttribute('role', 'status');
      a.textContent = msg;
      tableCard.prepend(a);
      setTimeout(() => a.remove(), 4000);
    };
    // Formulário (diálogo) para incluir/editar
    const dlg = editavel ? document.createElement('dialog') : null;
    if (dlg) {
      dlg.className = 'modal param-dialog';
      dlg.innerHTML = `<form method="dialog" class="param-form"><h2 data-titulo></h2><div class="param-campos"></div><p class="field-error" data-erro hidden></p><div class="modal-actions"><button class="btn btn-ghost" value="cancelar" type="submit" formnovalidate>Cancelar</button><button class="btn btn-primary" value="salvar" type="submit" data-salvar>Salvar</button></div></form>`;
      document.body.append(dlg);
    }
    const abrirForm = (linha) => new Promise((resolve) => {
      const campos = dlg.querySelector('.param-campos');
      dlg.querySelector('[data-titulo]').textContent = linha ? 'Editar registro' : 'Novo registro';
      campos.innerHTML = '';
      columns.forEach((c) => {
        const id = `pf-${c.key}`;
        const wrap = document.createElement('div');
        wrap.className = 'field';
        const lbl = document.createElement('label');
        lbl.htmlFor = id; lbl.textContent = c.label;
        const inp = document.createElement('input');
        inp.className = 'input'; inp.id = id; inp.name = c.key; inp.autocomplete = 'off';
        inp.value = linha && linha[c.key] != null ? String(linha[c.key]) : '';
        if (c.type === 'number') inp.inputMode = 'decimal';
        wrap.append(lbl, inp);
        campos.append(wrap);
      });
      const erro = dlg.querySelector('[data-erro]');
      erro.hidden = true;
      dlg.onclose = () => resolve(dlg.returnValue === 'salvar' ? Object.fromEntries(columns.map((c) => [c.key, dlg.querySelector(`[name="${c.key}"]`).value])) : null);
      dlg.returnValue = '';
      dlg.showModal();
      campos.querySelector('input')?.focus();
    });
    if (editavel) {
      tbody.addEventListener('click', async (e) => {
        const bE = e.target.closest('[data-editar]');
        const bX = e.target.closest('[data-excluir]');
        if (!bE && !bX) return;
        const linha = linhasAtuais[Number((bE || bX).dataset.editar ?? (bE || bX).dataset.excluir)];
        if (!linha) return;
        const url = `${endpoint}/${linha._i}`;
        try {
          if (bX) {
            if (!(await confirmar({ titulo: 'Excluir registro', texto: `Excluir o registro ${linha[chaveCol] ?? ''}? Esta ação não pode ser desfeita.`, ok: 'Excluir', perigo: true }))) return;
            await chamar('DELETE', url, { chave: linha[chaveCol] });
            avisar('Registro excluído.');
          } else {
            const valores = await abrirForm(linha);
            if (!valores) return;
            await chamar('PUT', url, { chave: linha[chaveCol], valores });
            avisar('Registro atualizado.');
          }
          load();
        } catch (err) { avisar(err.message, true); }
      });
      $('[data-novo-registro]')?.addEventListener('click', async () => {
        try {
          const valores = await abrirForm(null);
          if (!valores) return;
          await chamar('POST', endpoint, { valores });
          avisar('Registro incluído no fim da tabela.');
          load();
        } catch (err) { avisar(err.message, true); }
      });
    }

    async function load() {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const params = new URLSearchParams(tableCard.dataset.extra || '');
      Object.entries({ page: state.page, size: state.size, q: state.q, sort: state.sort, dir: state.dir }).forEach(([k, v]) => params.set(k, v));
      tbody.innerHTML = shimmer(Math.min(state.size, 10));
      try {
        const res = await fetch(`${endpoint}?${params}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Erro ao carregar');
        state.pages = d.pages; state.page = d.page;
        linhasAtuais = d.rows;
        tbody.innerHTML = d.rows.length
          ? d.rows.map((r, n) => `<tr>${columns.map((c) => cell(c, r[c.key])).join('')}${editavel ? acoes(n) : ''}</tr>`).join('')
          : `<tr><td colspan="${columns.length + (editavel ? 1 : 0)}">Nenhum registro encontrado.</td></tr>`;
        const from = d.total ? (d.page - 1) * d.size + 1 : 0;
        info.textContent = `${num.format(from)}–${num.format(Math.min(d.page * d.size, d.total))} de ${num.format(d.total)} · página ${d.page} de ${d.pages}`;
        prev.disabled = d.page <= 1;
        next.disabled = d.page >= d.pages;
        if (first) first.disabled = d.page <= 1;
        if (last) last.disabled = d.page >= d.pages;
        desenharPaginas();
      } catch (e) {
        if (e.name !== 'AbortError') tbody.innerHTML = `<tr><td colspan="${columns.length}">${esc(e.message)}</td></tr>`;
      }
    }

    prev.addEventListener('click', () => { state.page--; load(); });
    next.addEventListener('click', () => { state.page++; load(); });
    first?.addEventListener('click', () => { state.page = 1; load(); });
    last?.addEventListener('click', () => { state.page = state.pages; load(); });
    sizeSel?.addEventListener('change', () => { state.size = Number(sizeSel.value) || 25; state.page = 1; load(); });
    let t;
    $('#table-search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 250);
    });
    $$('th[data-sort]', tableCard).forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.dir = state.sort === key && state.dir === 'asc' ? 'desc' : 'asc';
      state.sort = key; state.page = 1;
      $$('th .arrow', tableCard).forEach((a) => { a.textContent = ''; });
      $('.arrow', th).textContent = state.dir === 'asc' ? '▲' : '▼';
      load();
    }));
    // Só busca as linhas quando a tabela chega perto da área visível (a página abre mais rápido)
    if (typeof window.IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entradas) => {
        if (entradas.some((x) => x.isIntersecting)) { io.disconnect(); load(); }
      }, { rootMargin: '300px 0px' });
      io.observe(tableCard);
    } else load();
  }

  /* ---------- Cadastro de usuário: perfil e seletor de centros de lucro ---------- */
  const userForm = $('#user-form');
  if (userForm) {
    const catalog = JSON.parse($('#centros-data').textContent);
    const byCode = new Map(catalog.centros.map((c) => [c.c, c]));
    const hidden = $('#f-centros');
    const selected = new Set(hidden.value.split(',').filter(Boolean));
    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    // Perfil: administrador não usa lista de centros
    const syncRole = () => {
      const admin = $('input[name="role"]:checked', userForm)?.value === 'admin';
      $('#access-body').hidden = admin;
      $('#admin-note').hidden = !admin;
      if ($('#telas-body')) { $('#telas-body').hidden = admin; $('#telas-admin-note').hidden = !admin; }
    };
    $$('input[name="role"]', userForm).forEach((r) => r.addEventListener('change', syncRole));
    const todos = $('#f-todos');
    todos.addEventListener('change', () => { $('#picker-wrap').hidden = todos.checked; });
    // Telas liberadas: "Todas as telas" esconde a lista; atalhos para marcar/desmarcar
    const todasTelas = $('#f-todas-telas');
    if (todasTelas) {
      todasTelas.addEventListener('change', () => { $('#telas-wrap').hidden = todasTelas.checked; });
      $$('[data-telas]', userForm).forEach((b) => b.addEventListener('click', () => {
        $$('input[name="telas"]', userForm).forEach((c) => { c.checked = b.dataset.telas === 'todas'; });
      }));
    }

    const render = () => {
      hidden.value = [...selected].sort().join(',');
      $('#sel-count').textContent = `${selected.size} centro(s) de lucro selecionado(s)`;
      const chips = $('#sel-chips');
      chips.innerHTML = [...selected].sort().slice(0, 300).map((c) => {
        const info = byCode.get(c);
        return `<span class="chip chip-sel" title="${esc(info ? `${info.s} · ${info.e}` : '')}">${esc(c)}<button type="button" data-remove="${esc(c)}" aria-label="Remover ${esc(c)}">×</button></span>`;
      }).join('') + (selected.size > 300 ? `<span class="note">… e mais ${selected.size - 300}</span>` : '');
      const emp = new Set();
      selected.forEach((c) => (byCode.get(c)?.emp || []).forEach((e) => emp.add(e)));
      $('#sel-companies').textContent = emp.size
        ? `${emp.size} empresa(s): ${[...emp].sort().map((e) => (catalog.empresas[e] && catalog.empresas[e] !== e ? `${e} · ${catalog.empresas[e]}` : e)).join(', ')}`
        : 'Nenhuma empresa com movimento para os centros selecionados.';
      search();
    };
    $('#sel-chips').addEventListener('click', (e) => {
      const c = e.target.dataset?.remove;
      if (c) { selected.delete(c); render(); }
    });
    $('#sel-clear').addEventListener('click', () => { selected.clear(); render(); });

    // Atalhos: adiciona todos os centros de uma estrutura, sigla ou empresa
    $$('[data-add]', userForm).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.add;
      const val = { estrutura: $('#q-estr'), sigla: $('#q-sigla'), empresa: $('#q-emp') }[kind].value;
      if (!val) return;
      catalog.centros.forEach((c) => {
        if ((kind === 'estrutura' && c.e === val) || (kind === 'sigla' && c.s === val) || (kind === 'empresa' && c.emp.includes(val))) selected.add(c.c);
      });
      render();
    }));

    // Busca livre
    const input = $('#q-busca');
    const results = $('#picker-results');
    function search() {
      const term = input.value.trim().toLowerCase();
      if (!term) { results.innerHTML = ''; return; }
      const found = catalog.centros.filter((c) => `${c.c} ${c.s} ${c.e}`.toLowerCase().includes(term)).slice(0, 40);
      results.innerHTML = found.length
        ? found.map((c) => `<li><button type="button" data-toggle="${esc(c.c)}" class="${selected.has(c.c) ? 'is-on' : ''}" aria-pressed="${selected.has(c.c)}">
            <span class="pick-check">${selected.has(c.c) ? '✓' : '+'}</span><strong>${esc(c.c)}</strong>
            <span>${esc(c.s)}${c.e ? ' · ' + esc(c.e) : ''}</span>
            <small>${c.emp.length ? esc(c.emp.slice(0, 3).join(', ')) + (c.emp.length > 3 ? '…' : '') : 'sem movimento'}</small></button></li>`).join('')
        : '<li class="note">Nenhum centro de lucro encontrado.</li>';
    }
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 120); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    results.addEventListener('click', (e) => {
      const b = e.target.closest('[data-toggle]');
      if (!b) return;
      const c = b.dataset.toggle;
      if (selected.has(c)) selected.delete(c); else selected.add(c);
      render();
    });
    render();
  }

  /* ---------- Competência pelo nome do arquivo (todos os uploads) ----------
     Mesmas regras do servidor (src/utils/competencia.js): 31.10.2026 · 10.2026 · 2026-10 · 102026 */
  const periodFromName = (name) => {
    const base = String(name || '').replace(/\.[^.]+$/, '');
    const ok = (y, m) => (Number(y) >= 2000 && Number(y) <= 2100 && Number(m) >= 1 && Number(m) <= 12 ? `${y}-${String(Number(m)).padStart(2, '0')}` : null);
    let m = base.match(/(?:^|\D)(\d{2})[.\-_/](\d{2})[.\-_/](\d{4})(?:\D|$)/); if (m && ok(m[3], m[2])) return ok(m[3], m[2]);
    m = base.match(/(?:^|\D)(\d{1,2})[.\-_/](\d{4})(?:\D|$)/); if (m && ok(m[2], m[1])) return ok(m[2], m[1]);
    m = base.match(/(?:^|\D)(\d{4})[.\-_/](\d{2})(?:\D|$)/); if (m && ok(m[1], m[2])) return ok(m[1], m[2]);
    m = base.match(/(?:^|[_\s-])(\d{2})(\d{4})(?:\D|$)/); if (m && ok(m[2], m[1])) return ok(m[2], m[1]);
    return null;
  };
  const dialog = $('#competencia-dialog');
  $$('form[data-competencia-form]').forEach((form) => {
    const fileInput = $('input[type="file"]', form);
    const periodInput = $('[data-competencia]', form);
    const help = periodInput && $(`#${periodInput.id}-help`);
    if (!fileInput || !periodInput) return;
    const defaultHelp = help ? help.textContent : '';
    let fromFile = false;

    const warn = (name) => {
      const focusField = () => {
        periodInput.classList.add('needs-attention');
        periodInput.focus();
        if (periodInput.showPicker) { try { periodInput.showPicker(); } catch { /* alguns navegadores só abrem com clique */ } }
      };
      if (dialog && dialog.showModal) {
        $('[data-cd-file]', dialog).textContent = name;
        dialog.addEventListener('close', focusField, { once: true });
        dialog.showModal();
      } else {
        aviso({ titulo: 'Competência não encontrada', texto: `O nome do arquivo "${name}" precisa ter a competência (ex.: _10.2026). Informe a competência no campo.` }).then(focusField);
      }
    };

    const onFile = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const p = periodFromName(f.name);
      if (p) {
        periodInput.value = p;
        fromFile = true;
        periodInput.classList.remove('needs-attention');
        if (help) help.textContent = `Competência ${p.slice(5, 7)}/${p.slice(0, 4)} lida do nome do arquivo.`;
      } else {
        if (fromFile) periodInput.value = ''; // valor anterior veio de outro arquivo
        fromFile = false;
        if (help) help.textContent = defaultHelp;
        if (!periodInput.value) warn(f.name);
      }
    };
    fileInput.addEventListener('change', onFile);
    periodInput.addEventListener('input', () => { periodInput.classList.remove('needs-attention'); });

    // Bloqueia o envio sem competência (nome do arquivo ou campo)
    form.addEventListener('submit', (e) => {
      const f = fileInput.files[0];
      if (f && !periodFromName(f.name) && !periodInput.value) {
        e.preventDefault();
        e.stopImmediatePropagation(); // não ativa o "Importando…"
        warn(f.name);
      }
    }, true);
  });

  /* ---------- Área de arrastar e soltar (páginas de importação fora do upload principal) ---------- */
  $$('.dropzone').forEach((zone) => {
    if (zone.closest('#upload-form')) return; // o formulário principal tem tratamento próprio abaixo
    const input = $('input[type="file"]', zone);
    const nameEl = $('.file-name', zone);
    const showName = () => { if (nameEl) nameEl.textContent = input.files[0] ? `${input.files[0].name} · ${(input.files[0].size / 1024).toFixed(0)} KB` : ''; };
    input.addEventListener('change', showName);
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; showName(); } });
  });

  /* ---------- Upload ---------- */
  const form = $('#upload-form');
  if (form) {
    const company = $('#u-company');
    const newFields = [$('#new-company-code'), $('#new-company-name')];
    const syncCompany = () => {
      const isNew = company.value === '__new__';
      newFields.forEach((f) => f.classList.toggle('hidden', !isNew));
      $$('input', newFields[0].parentElement).filter((i) => i.name.startsWith('newCompany')).forEach((i) => { i.required = isNew; });
    };
    company.addEventListener('change', syncCompany); syncCompany();

    const moduleSel = $('#u-module');
    const syncLayout = () => {
      const mod = moduleSel.value;
      // Relatórios que trazem a empresa no próprio arquivo (não pedem empresa na tela)
      const isAuto = moduleSel.selectedOptions[0]?.dataset.auto === '1';
      $$('[data-layout]').forEach((el) => el.classList.toggle('hidden', el.dataset.layout !== mod));
      // Mostra só os campos do tipo escolhido; campos ocultos ficam desabilitados (não são enviados)
      $$('[data-show-for]').forEach((el) => {
        const tags = el.dataset.showFor.split(/\s+/);
        const show = tags.includes(mod) || (tags.includes('manual') && !isAuto);
        el.classList.toggle('hidden', !show);
        $$('input, select', el).forEach((i) => { i.disabled = !show; });
      });
      company.required = !isAuto;
      if (isAuto) newFields.forEach((f) => f.classList.add('hidden')); else syncCompany();
    };
    moduleSel.addEventListener('change', syncLayout); syncLayout();

    const zone = $('#dropzone');
    const input = $('#u-file');
    const nameEl = $('#file-name');
    const showName = () => { nameEl.textContent = input.files[0] ? `${input.files[0].name} · ${(input.files[0].size / 1024).toFixed(0)} KB` : ''; };
    input.addEventListener('change', showName);
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; showName(); } });

    form.addEventListener('submit', () => {
      const btn = $('#upload-btn');
      btn.disabled = true;
      btn.lastChild.textContent = 'Importando…';
    });
  }
})();
