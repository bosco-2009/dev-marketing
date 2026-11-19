/*
 * revelar.js — animações de rolagem estilo site premium (sem bibliotecas).
 *   - Seções e cards aparecem com fade + subida ao entrar na tela (IntersectionObserver); cards em cascata.
 *   - O sublinhado amarelo dos títulos se desenha quando a seção aparece (CSS em movimento.css).
 *   - O celular do hero amplia e gira levemente em 3D conforme a rolagem (requestAnimationFrame,
 *     só transform; o cálculo pausa quando o hero sai da tela).
 * Sem JavaScript ou com prefers-reduced-motion: nada é escondido nem animado.
 */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window) || !window.requestAnimationFrame) return;
  var movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (movimentoReduzido.matches) return;

  var html = document.documentElement;

  // [seletor, cascata?] — os itens de listas recebem atraso crescente dentro do mesmo pai
  var ALVOS = [
    ['.secao__cabecalho', false],
    ['.grade-cards > li', true],
    ['.segmentos', false],
    ['.passos > li', true],
    ['.planos > li', true],
    ['.grade-portfolio > li', true],
    ['.grade-depoimentos > li', true],
    ['.garantias > li', true],
    ['.faq__item', true],
    ['.cta-final__caixa', false]
  ];

  var elementos = [];
  ALVOS.forEach(function (alvo) {
    document.querySelectorAll(alvo[0]).forEach(function (el) {
      if (el.hasAttribute('data-revelar') || el.closest('[hidden]')) return;
      el.setAttribute('data-revelar', alvo[1] ? 'cascata' : 'bloco');
      elementos.push(el);
    });
  });

  // O que já está visível na carga aparece sem animação (nada "some" diante do visitante).
  var alturaTela = window.innerHeight;
  elementos.forEach(function (el) {
    if (el.getBoundingClientRect().top < alturaTela * 0.92) el.classList.add('revelado', 'revelado-imediato');
  });
  html.classList.add('revelar-ativo');

  // Cascata: os itens que entram juntos na tela (ex.: uma fileira de cards) recebem atrasos 0, 90, 180 ms…
  var observador = new IntersectionObserver(function (entradas) {
    var chegando = entradas.filter(function (en) { return en.isIntersecting; }).map(function (en) { return en.target; });
    chegando.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    var n = 0;
    chegando.forEach(function (el) {
      if (el.getAttribute('data-revelar') === 'cascata') el.style.setProperty('--atraso', Math.min(n++, 5) * 90 + 'ms');
      el.classList.add('revelado');
      observador.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  elementos.forEach(function (el) { if (!el.classList.contains('revelado')) observador.observe(el); });

  // ----------------------------------------------------------------- celular do hero em 3D
  var hero = document.querySelector('.hero');
  var celular = document.querySelector('.hero__visual .celular');
  if (!hero || !celular) return;

  var pedido = false;
  var visivel = true;
  function limitar(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function desenhar() {
    pedido = false;
    // t = 0 no topo da página; 1 quando o hero inteiro já passou
    var t = limitar(window.scrollY / Math.max(hero.offsetHeight, 1));
    var suave = t * t * (3 - 2 * t); // smoothstep
    // neutro no topo (sem "salto" quando o script assume) → inclinado e ampliado ao rolar
    var rx = suave * 14;              // até 14° (topo vai para trás)
    var ry = suave * -18;             // até -18° (gira para a esquerda)
    var escala = 1 + suave * 0.14;    // amplia até 14%
    var y = suave * -1.5;             // sobe um pouco (rem)
    celular.style.transform = 'translate3d(0,' + y.toFixed(3) + 'rem,0) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' +
      ry.toFixed(2) + 'deg) scale(' + escala.toFixed(4) + ')';
  }
  function pedir() {
    if (pedido || !visivel) return;
    pedido = true;
    window.requestAnimationFrame(desenhar);
  }
  new IntersectionObserver(function (en) {
    visivel = en[0].isIntersecting;
    if (visivel) pedir();
  }).observe(hero);
  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir, { passive: true });
  desenhar();

  // Se o visitante ativar "reduzir movimento" com a página aberta, volta tudo ao normal.
  if (movimentoReduzido.addEventListener) {
    movimentoReduzido.addEventListener('change', function (e) {
      if (!e.matches) return;
      celular.style.transform = '';
      window.removeEventListener('scroll', pedir);
      elementos.forEach(function (el) { el.classList.add('revelado', 'revelado-imediato'); });
    });
  }
})();
