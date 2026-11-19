/*
 * mockup.js — o celular do hero alterna entre 3 sites de EXEMPLO (loja de roupas, restaurante, salão).
 * As telas são HTML/CSS em index.html; aqui só trocamos as classes (transição com transform/opacity).
 *
 * Pausa automaticamente quando o hero sai da tela, quando a aba fica em segundo plano ou durante a abertura.
 * Como o movimento passa de 5 s, há um botão "Pausar exemplos" (WCAG 2.2.2).
 * Sem JavaScript ou com prefers-reduced-motion: fica parada na primeira tela e o botão não aparece.
 */
(function () {
  'use strict';
  var INTERVALO = 3800;
  var area = document.querySelector('[data-mockup]');
  if (!area) return;
  var telas = Array.prototype.slice.call(area.querySelectorAll('[data-mock-tela]'));
  var botao = area.querySelector('[data-mockup-pausa]');
  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (telas.length < 2 || reduzido.matches) return;

  var atual = 0;
  var pausadoPeloVisitante = false;
  var heroVisivel = true;
  var timer = null;

  function avancar() {
    var html = document.documentElement;
    if (html.classList.contains('com-abertura')) return; // espera a abertura terminar
    var saindo = telas[atual];
    atual = (atual + 1) % telas.length;
    var entrando = telas[atual];
    telas.forEach(function (t) { t.classList.remove('mock-tela--saindo'); });
    saindo.classList.remove('mock-tela--ativa');
    saindo.classList.add('mock-tela--saindo');
    entrando.classList.add('mock-tela--ativa');
    area.setAttribute('data-mockup-atual', String(atual));
  }

  function atualizar() {
    var deveRodar = !pausadoPeloVisitante && heroVisivel && !document.hidden && !reduzido.matches;
    if (deveRodar && !timer) timer = setInterval(avancar, INTERVALO);
    if (!deveRodar && timer) { clearInterval(timer); timer = null; }
  }

  if (botao) {
    var texto = botao.querySelector('[data-mockup-pausa-texto]');
    var uso = botao.querySelector('use');
    botao.hidden = false;
    botao.addEventListener('click', function () {
      pausadoPeloVisitante = !pausadoPeloVisitante;
      botao.setAttribute('aria-pressed', String(pausadoPeloVisitante));
      texto.textContent = pausadoPeloVisitante ? 'Continuar exemplos' : 'Pausar exemplos';
      uso.setAttribute('href', pausadoPeloVisitante ? '#i-play' : '#i-pausa');
      atualizar();
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { heroVisivel = en[0].isIntersecting; atualizar(); }).observe(area);
  }
  document.addEventListener('visibilitychange', atualizar);
  if (reduzido.addEventListener) {
    reduzido.addEventListener('change', function () {
      if (reduzido.matches && botao) botao.hidden = true;
      atualizar();
    });
  }
  area.setAttribute('data-mockup-atual', '0');
  atualizar();
})();
