/*
 * origem.js — de onde vem o visitante (melhoria 10).
 * Na chegada, guarda no localStorage os parâmetros utm_* da URL e o DOMÍNIO do site de referência (nunca o
 * endereço completo, que pode ter dados pessoais), mais a página de entrada. Vale por 30 dias.
 * Uma chegada nova com utm_* ou vinda de outro site substitui a anterior; navegar dentro do site não muda nada.
 * O chat (pagina_origem) e o pedido (criar-pagamento → pedidos.origem) enviam window.PBROrigem.resumo().
 * Melhoria 65: um clique num link com data-origem-cta (ex.: "Ver o plano" no fim de um artigo ou página de
 * segmento) guarda qual conteúdo levou aos planos ("blog/site-ou-instagram"), também por 30 dias; o resumo
 * ganha "cta: blog/site-ou-instagram" (vale mesmo para quem chegou direto, sem utm nem referência).
 * Melhoria 110: também marcam a origem os planos da home ("home/planos"), o resultado do simulador ("home/simulador")
 * e os planos da 404 ("erro/404"). Todo link com ?plano= leva data-origem-cta (testes/funcoes/links-planos.test.mjs).
 * Sem cookies, sem ferramentas de terceiros. Descrito na política de privacidade.
 */
(function () {
  'use strict';
  var CHAVE = 'pbr_origem_v1';
  var CHAVE_CTA = 'pbr_origem_cta_v1';
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

  function lerCta() {
    try {
      var c = JSON.parse(localStorage.getItem(CHAVE_CTA));
      if (c && typeof c.de === 'string' && typeof c.em === 'number' && Date.now() - c.em < VALIDADE) return limpo(c.de);
    } catch (e) { /* sem localStorage ou JSON inválido */ }
    return '';
  }

  function marcarCta(evento) {
    var alvo = evento.target && evento.target.closest ? evento.target.closest('a[data-origem-cta]') : null;
    if (!alvo) return;
    var de = limpo(alvo.getAttribute('data-origem-cta') || '');
    if (!/^(blog|segmento|exemplo|home|erro)\/[a-z0-9-]+$/.test(de)) return;
    try { localStorage.setItem(CHAVE_CTA, JSON.stringify({ de: de, em: Date.now() })); } catch (e) { /* armazenamento bloqueado */ }
  }

  // "utm: instagram / social / lancamento · ref: l.instagram.com · entrada: /blog/ · cta: blog/site-ou-instagram"
  function resumo() {
    var o = ler();
    var cta = lerCta();
    if (!o) return cta ? 'cta: ' + cta : '';
    var partes = [];
    var u = o.utm || {};
    var campos = ['source', 'medium', 'campaign'].map(function (k) { return limpo(u[k] || ''); }).filter(Boolean);
    if (campos.length) partes.push('utm: ' + campos.join(' / '));
    if (u.term) partes.push('termo: ' + limpo(u.term));
    if (u.content) partes.push('conteúdo: ' + limpo(u.content));
    if (o.ref) partes.push('ref: ' + limpo(o.ref));
    if (partes.length && o.entrada) partes.push('entrada: ' + limpo(o.entrada));
    if (cta) partes.push('cta: ' + cta);
    return partes.join(' · ').slice(0, 250);
  }

  chegada();
  // click (botão principal) e auxclick (botão do meio / nova aba); só registra, nunca impede a navegação
  document.addEventListener('click', marcarCta, true);
  document.addEventListener('auxclick', marcarCta, true);
  window.PBROrigem = { resumo: resumo };
})();
