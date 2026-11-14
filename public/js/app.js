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
    const lbl = themeBtn && $('[data-theme-label]', themeBtn);
    if (lbl) lbl.textContent = isDark() ? 'Tema claro' : 'Tema escuro';
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(isDark()));
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

    function render(id, c) {
      const el = document.getElementById(id);
      if (!el || !c || !c.labels || !c.labels.length) {
        if (el) el.parentElement.innerHTML = '<p class="note">Sem dados para exibir.</p>';
        return;
      }
      const isCount = !!c.isCount;
      const code = c.currency || data.currency || 'BRL';
      const money = (v) => moneyFmt(code).format(v);
      const valueAxis = { grid, ticks: { callback: (v) => (isCount ? num.format(v) : moneyFmt(code, true).format(v)) } };
      const tooltip = isCount ? tooltipCount : tooltipMoneyIn(code);

      if (c.type === 'doughnut') {
        return new Chart(el, {
          type: 'doughnut',
          data: { labels: c.labels, datasets: [{ data: c.values.map(Math.abs), backgroundColor: PALETTE, borderWidth: 2, borderColor: cssVar('--surface') || '#fff' }] },
          options: {
            cutout: '62%',
            plugins: {
              legend: { position: 'right' },
              tooltip: { callbacks: { label: (x) => ` ${x.label}: ${isCount ? num.format(x.parsed) : money(x.parsed)}` } },
            },
          },
        });
      }
      if (c.type === 'line') {
        return new Chart(el, {
          type: 'bar',
          data: {
            labels: c.labels.map(fmtDate),
            datasets: [{ label: 'Movimento', data: c.values, backgroundColor: c.values.map((v) => (v < 0 ? NEG : PALETTE[0])), borderRadius: 3 }],
          },
          options: { plugins: { legend: { display: false }, tooltip }, scales: { x: { grid: { display: false } }, y: valueAxis } },
        });
      }
      const horizontal = c.type === 'hbar';
      return new Chart(el, {
        type: 'bar',
        data: {
          labels: c.labels,
          datasets: [{ data: c.values, backgroundColor: c.values.map((v, i) => (v < 0 ? NEG : (horizontal ? PALETTE[0] : PALETTE[i % PALETTE.length]))), borderRadius: 5, maxBarThickness: 46 }],
        },
        options: {
          indexAxis: horizontal ? 'y' : 'x',
          plugins: { legend: { display: false }, tooltip },
          scales: horizontal
            ? { x: valueAxis, y: { grid: { display: false }, ticks: { callback(v) { const l = this.getLabelForValue(v); return l.length > 28 ? l.slice(0, 27) + '…' : l; } } } }
            : { x: { grid: { display: false } }, y: valueAxis },
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
        new Chart(el, {
          type: 'bar',
          data: {
            labels: data.trend.labels,
            datasets: [
              { type: 'bar', label: 'Receita líquida', data: data.trend.receita, backgroundColor: PALETTE[0], borderRadius: 5, maxBarThickness: 40, order: 2 },
              { type: 'line', label: 'Lucro líquido', data: data.trend.lucro, borderColor: PALETTE[1], backgroundColor: PALETTE[1], tension: .35, pointRadius: 4, order: 1 },
            ],
          },
          options: {
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' }, tooltip: tooltipMoneyIn(data.currency) },
            scales: { x: { grid: { display: false } }, y: { grid, ticks: { callback: (v) => moneyFmt(data.currency, true).format(v) } } },
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

  /* ---------- Demonstração em árvore: recolher/expandir grupos ---------- */
  const treeTable = $('#tree-table');
  if (treeTable) {
    // Linha (ex.: "Contas a receber de clientes") → contas contábeis; abre/fecha ao clicar
    const itemAberto = (id) => treeTable.querySelector(`tr[data-item="${id}"]`)?.classList.contains('collapsed') === false;
    const setItem = (row, open) => {
      row.classList.toggle('collapsed', !open);
      row.setAttribute('aria-expanded', String(open));
      $$(`tr[data-conta-of="${row.dataset.item}"]`, treeTable).forEach((r) => r.classList.toggle('hidden', !open));
    };
    // Grupo (ex.: "Ativo Circulante") → linhas; as contas só reaparecem se a linha delas estiver aberta
    const setGroup = (row, open) => {
      row.classList.toggle('collapsed', !open);
      row.setAttribute('aria-expanded', String(open));
      $$(`tr[data-parent="${row.dataset.group}"]`, treeTable).forEach((r) => {
        const conta = r.dataset.contaOf;
        r.classList.toggle('hidden', !open || (conta != null && !itemAberto(conta)));
      });
    };
    const clicavel = (row, fn) => {
      row.addEventListener('click', fn);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    };
    $$('tr[data-group]', treeTable).forEach((row) => clicavel(row, () => setGroup(row, row.classList.contains('collapsed'))));
    $$('tr[data-item]', treeTable).forEach((row) => clicavel(row, () => setItem(row, row.classList.contains('collapsed'))));
    const btn = $('[data-tree-toggle]');
    if (btn) {
      btn.addEventListener('click', () => {
        const open = btn.dataset.state === 'closed';
        $$('tr[data-group]', treeTable).forEach((r) => setGroup(r, open));
        btn.dataset.state = open ? 'open' : 'closed';
        btn.textContent = open ? 'Recolher tudo' : 'Expandir tudo';
      });
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
