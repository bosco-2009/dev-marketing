/*
 * tema.js — botão do modo escuro no cabeçalho (melhoria 11).
 * Sem escolha, o site segue o sistema (prefers-color-scheme, só CSS). O botão alterna claro/escuro e guarda a
 * escolha em localStorage (pbr_tema); o inicio.js a aplica antes da 1ª pintura nas próximas páginas.
 * Escolher o mesmo tema do sistema apaga a escolha (volta a seguir o sistema).
 * Páginas com data-tema-fixo (sites de exemplo, painel) ficam sempre claras e sem botão.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  var botao = document.querySelector('[data-tema-botao]');
  if (!botao) return;
  if (html.hasAttribute('data-tema-fixo')) { botao.hidden = true; return; }

  var sistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var meta = document.querySelector('meta[name="theme-color"]');
  var corClara = meta ? meta.getAttribute('content') : '';

  function escuro() {
    var t = html.getAttribute('data-tema');
    return t ? t === 'escuro' : !!sistema.matches;
  }
  function sincronizar() {
    var e = escuro();
    botao.setAttribute('aria-pressed', String(e));
    botao.title = e ? 'Usar modo claro' : 'Usar modo escuro';
    if (meta) meta.setAttribute('content', e ? '#08101F' : corClara);
  }

  botao.addEventListener('click', function () {
    var novo = escuro() ? 'claro' : 'escuro';
    var doSistema = sistema.matches ? 'escuro' : 'claro';
    try {
      if (novo === doSistema) window.localStorage.removeItem('pbr_tema');
      else window.localStorage.setItem('pbr_tema', novo);
    } catch (e) { /* vale só para esta página */ }
    if (novo === doSistema) html.removeAttribute('data-tema'); else html.setAttribute('data-tema', novo);
    sincronizar();
  });
  if (sistema.addEventListener) sistema.addEventListener('change', sincronizar);
  sincronizar();
})();
