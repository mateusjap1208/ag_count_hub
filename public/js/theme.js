/* Tema claro/escuro: aplicado antes da renderização para não "piscar".
   Preferência salva neste navegador; sem escolha, segue o tema do sistema operacional. */
(function () {
  'use strict';
  var KEY = 'agch-theme';
  var root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function system() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function apply(theme) { root.setAttribute('data-theme', theme); }

  apply(saved() || system());

  // Menu fixado aberto (preferência deste navegador)
  try { if (localStorage.getItem('agch-menu-fixo') === '1') root.setAttribute('data-menu', 'fixo'); } catch (e) { /* sem armazenamento: menu normal */ }

  // Acompanha a troca de tema do sistema enquanto o usuário não escolher manualmente
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (!saved()) { fadeCores(); apply(system()); document.dispatchEvent(new CustomEvent('themechange')); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  // Fade suave enquanto as cores mudam (tema ou paleta): a classe liga as transições só por um instante
  var fadeTimer;
  function fadeCores() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('troca-cores');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { root.classList.remove('troca-cores'); }, 500);
  }

  window.agchTheme = {
    fade: fadeCores,
    get: function () { return root.getAttribute('data-theme'); },
    toggle: function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      fadeCores();
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* navegação privada: vale só nesta página */ }
      document.dispatchEvent(new CustomEvent('themechange'));
      return next;
    },
  };
}());
