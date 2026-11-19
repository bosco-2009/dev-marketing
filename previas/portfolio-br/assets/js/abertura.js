/*
 * abertura.js — complemento da abertura de marca (a animação em si é CSS, em movimento.css).
 * Só age se inicio.js marcou o <html> com "com-abertura" (home, 1ª vez na sessão, sem movimento reduzido):
 *   - toque, clique, rolagem ou qualquer tecla pulam a abertura (saída curta);
 *   - no fim, tira as classes e esconde a camada para ela não pesar mais nada.
 * A camada é aria-hidden e o conteúdo real fica sempre no DOM: leitores de tela nunca são bloqueados.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('com-abertura')) return;
  var tela = document.querySelector('[data-abertura-tela]');
  if (!tela) { html.classList.remove('com-abertura'); return; }

  var EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  var terminou = false;

  function pular() {
    if (terminou || html.classList.contains('abertura-pulando')) return;
    html.classList.add('abertura-pulando');
  }

  function encerrar() {
    if (terminou) return;
    terminou = true;
    EVENTOS.forEach(function (ev) { window.removeEventListener(ev, pular, true); });
    html.classList.remove('com-abertura', 'abertura-pulando');
    tela.hidden = true;
  }

  EVENTOS.forEach(function (ev) { window.addEventListener(ev, pular, { capture: true, passive: true }); });

  // Fim da saída (animação "abertura-revelar" da própria camada), normal ou pulada.
  tela.addEventListener('animationend', function (e) {
    if (e.target === tela && /^abertura-revelar/.test(e.animationName)) encerrar();
  });
  // Garantia: mesmo se o evento não vier (aba em segundo plano), libera a página.
  setTimeout(encerrar, 4000);
})();
