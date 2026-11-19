/*
 * inicio.js — roda ANTES da primeira pintura (carregado sem defer no <head>, logo depois do config.js).
 * Só marca o <html> com classes usadas pelo CSS, para nada "pular" na tela quando os outros scripts rodarem:
 *   - tira "sem-js" (o menu móvel passa a ser o botão);
 *   - põe "modo-rascunho" quando config.rascunho é true (mostra a faixa de rascunho).
 * Não faz nada além disso: mantenha este arquivo mínimo.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  html.classList.remove('sem-js');
  if (window.PBR_CONFIG && window.PBR_CONFIG.rascunho) html.classList.add('modo-rascunho');
})();
