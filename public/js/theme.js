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

  // Acompanha a troca de tema do sistema enquanto o usuário não escolher manualmente
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (!saved()) { apply(system()); document.dispatchEvent(new CustomEvent('themechange')); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  window.agchTheme = {
    get: function () { return root.getAttribute('data-theme'); },
    toggle: function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* navegação privada: vale só nesta página */ }
      document.dispatchEvent(new CustomEvent('themechange'));
      return next;
    },
  };
}());
