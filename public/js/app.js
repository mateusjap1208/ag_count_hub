/* AG Cont Hub — scripts de interface (sem inline scripts, compatível com CSP) */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
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
  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

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
        const bell = $('.notif-bell');
        if (bell) { bell.classList.remove('has-new'); bell.querySelector('.notif-dot')?.remove(); bell.title = 'Novidades do sistema'; }
      } catch { notifForm.submit(); }
    });
  }

  /* ---------- Painel de filtros: abre ao passar o mouse (CSS); o clique fixa/solta, Esc e clique fora fecham ---------- */
  const fWrap = document.getElementById('filters-wrap');
  const fBtn = document.getElementById('filters-toggle');
  if (fWrap && fBtn) {
    const sync = () => fBtn.setAttribute('aria-expanded', String(fWrap.matches(':hover, :focus-within, .open')));
    const close = () => { fWrap.classList.remove('open'); if (fWrap.contains(document.activeElement)) document.activeElement.blur(); sync(); };
    fBtn.addEventListener('click', () => {
      if (fWrap.classList.contains('open')) close(); else { fWrap.classList.add('open'); sync(); }
    });
    ['mouseenter', 'mouseleave', 'focusin', 'focusout'].forEach((ev) => fWrap.addEventListener(ev, () => setTimeout(sync)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fWrap.matches(':focus-within, .open')) close(); });
    document.addEventListener('click', (e) => { if (!fWrap.contains(e.target)) close(); });
  }

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

  /* ---------- Confirmações ---------- */
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (!window.confirm(f.dataset.confirm)) e.preventDefault();
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
      NEG = isDark() ? '#FF6B70' : '#D2232A';
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

    function drawCharts() {
    applyChartTheme();
    // Tela de módulo
    (data.charts || []).forEach((c) => render(`chart-${c.id}`, c));

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
                pointBackgroundColor: data.trend.lucro.map((v) => (v < 0 ? NEG : '#009360')), pointBorderColor: cssVar('--surface') || '#fff', pointBorderWidth: 2,
              },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            animation: reduzMovimento ? false : { duration: 1100, easing: 'easeOutQuart' },
            plugins: { legend: { position: 'bottom' }, tooltip: tooltipMoneyIn(data.currency) },
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
  $('img[data-foto]').forEach((img) => {
    const falhou = () => img.remove();
    if (img.complete && !img.naturalWidth) falhou(); else img.addEventListener('error', falhou);
  });

  /* ---------- Busca simples em tabelas da página (ex.: pedidos da conta 2115100000) ---------- */
  $('[data-filtro-tabela]').forEach((inp) => {
    const tabela = document.querySelector(inp.dataset.filtroTabela);
    if (!tabela) return;
    const linhas = $('tbody tr', tabela);
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
    const state = { page: 1, size: 25, q: '', sort: '', dir: 'asc', pages: 1 };
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

    async function load() {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const params = new URLSearchParams(tableCard.dataset.extra || '');
      Object.entries({ page: state.page, size: state.size, q: state.q, sort: state.sort, dir: state.dir }).forEach(([k, v]) => params.set(k, v));
      tbody.style.opacity = '.5';
      try {
        const res = await fetch(`${endpoint}?${params}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Erro ao carregar');
        state.pages = d.pages; state.page = d.page;
        tbody.innerHTML = d.rows.length
          ? d.rows.map((r) => `<tr>${columns.map((c) => cell(c, r[c.key])).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}">Nenhum registro encontrado.</td></tr>`;
        const from = d.total ? (d.page - 1) * d.size + 1 : 0;
        info.textContent = `${num.format(from)}–${num.format(Math.min(d.page * d.size, d.total))} de ${num.format(d.total)} · página ${d.page} de ${d.pages}`;
        prev.disabled = d.page <= 1;
        next.disabled = d.page >= d.pages;
      } catch (e) {
        if (e.name !== 'AbortError') tbody.innerHTML = `<tr><td colspan="${columns.length}">${esc(e.message)}</td></tr>`;
      } finally { tbody.style.opacity = ''; }
    }

    prev.addEventListener('click', () => { state.page--; load(); });
    next.addEventListener('click', () => { state.page++; load(); });
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
    load();
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
    };
    $$('input[name="role"]', userForm).forEach((r) => r.addEventListener('change', syncRole));
    const todos = $('#f-todos');
    todos.addEventListener('change', () => { $('#picker-wrap').hidden = todos.checked; });

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
        window.alert(`O nome do arquivo "${name}" precisa ter a competência (ex.: _10.2026). Informe a competência no campo.`);
        focusField();
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
