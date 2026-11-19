/*
 * origem.js — de onde vem o visitante (melhoria 10).
 * Na chegada, guarda no localStorage os parâmetros utm_* da URL e o DOMÍNIO do site de referência (nunca o
 * endereço completo, que pode ter dados pessoais), mais a página de entrada. Vale por 30 dias.
 * Uma chegada nova com utm_* ou vinda de outro site substitui a anterior; navegar dentro do site não muda nada.
 * O chat (pagina_origem) e o pedido (criar-pagamento → pedidos.origem) enviam window.PBROrigem.resumo().
 * Sem cookies, sem ferramentas de terceiros. Descrito na política de privacidade.
 */
(function () {
  'use strict';
  var CHAVE = 'pbr_origem_v1';
  var VALIDADE = 30 * 24 * 60 * 60 * 1000;
  var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  // Só letras, números e pontuação simples; no máximo 60 caracteres por campo.
  function limpo(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[^\p{L}\p{N} ._\-+/:@]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function ler() {
    try {
      var o = JSON.parse(localStorage.getItem(CHAVE));
      if (o && typeof o === 'object' && typeof o.em === 'number' && Date.now() - o.em < VALIDADE) return o;
    } catch (e) { /* sem localStorage ou JSON inválido */ }
    return null;
  }

  function chegada() {
    var nova = { utm: {}, ref: '', entrada: limpo(location.pathname.replace(/^\/empresa-jp/, '')) || '/', em: Date.now() };
    var temUtm = false;
    try {
      var q = new URLSearchParams(location.search);
      UTMS.forEach(function (k) {
        var v = limpo(q.get(k) || '');
        if (v) { nova.utm[k.slice(4)] = v; temUtm = true; }
      });
    } catch (e) { /* URL sem parâmetros */ }
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        if (r.host !== location.host && /^https?:$/.test(r.protocol)) nova.ref = limpo(r.hostname.replace(/^www\./, ''));
      }
    } catch (e) { /* referrer inválido */ }
    if (!temUtm && !nova.ref) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(nova)); } catch (e) { /* armazenamento bloqueado */ }
  }

  // "utm: instagram / social / lancamento · ref: l.instagram.com · entrada: /blog/"
  function resumo() {
    var o = ler();
    if (!o) return '';
    var partes = [];
    var u = o.utm || {};
    var campos = ['source', 'medium', 'campaign'].map(function (k) { return limpo(u[k] || ''); }).filter(Boolean);
    if (campos.length) partes.push('utm: ' + campos.join(' / '));
    if (u.term) partes.push('termo: ' + limpo(u.term));
    if (u.content) partes.push('conteúdo: ' + limpo(u.content));
    if (o.ref) partes.push('ref: ' + limpo(o.ref));
    if (partes.length && o.entrada) partes.push('entrada: ' + limpo(o.entrada));
    return partes.join(' · ').slice(0, 250);
  }

  chegada();
  window.PBROrigem = { resumo: resumo };
})();
