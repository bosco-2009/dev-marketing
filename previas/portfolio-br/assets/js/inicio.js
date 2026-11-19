/*
 * inicio.js — roda ANTES da primeira pintura (carregado sem defer no <head>, logo depois do config.js).
 * Só marca o <html> com classes usadas pelo CSS, para nada "pular" na tela quando os outros scripts rodarem:
 *   - tira "sem-js" (o menu móvel passa a ser o botão);
 *   - põe "modo-rascunho" quando config.rascunho é true (mostra a faixa de rascunho);
 *   - põe "com-abertura" na home (<html data-abertura>) na primeira visita da sessão, se o visitante não pediu
 *     movimento reduzido. A animação da abertura é toda em CSS (movimento.css) e termina sozinha;
 *     abertura.js só permite pular e limpa no final.
 * Não faz nada além disso: mantenha este arquivo mínimo.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  html.classList.remove('sem-js');
  if (window.PBR_CONFIG && window.PBR_CONFIG.rascunho) html.classList.add('modo-rascunho');

  if (html.hasAttribute('data-abertura')) {
    var reduzido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var jaViu = true; // sem sessionStorage (modo privado/bloqueado): sem abertura, para não repetir a cada página
    try {
      jaViu = window.sessionStorage.getItem('pbr_abertura_vista') === '1';
      window.sessionStorage.setItem('pbr_abertura_vista', '1');
    } catch (e) { /* mantém jaViu = true */ }
    if (!reduzido && !jaViu) html.classList.add('com-abertura');
  }
})();
