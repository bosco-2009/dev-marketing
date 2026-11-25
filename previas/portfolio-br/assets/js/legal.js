/*
 * legal.js — preenche termos.html e privacidade.html com os dados do config.js.
 *   [data-cfg="caminho.no.config"]  → texto (vazio = "[PROVISÓRIO: rótulo]", visível de propósito)
 *   [data-cfg-email]                 → link mailto do contato.email
 *   [data-cfg-whatsapp]              → número formatado do contato.whatsapp
 *   [data-cfg-planos]                → lista dos planos (nome, preço, prazo, itens)
 * Sem JavaScript, os marcadores [PROVISÓRIO: ...] continuam visíveis.
 * Melhoria 125: o HTML já vem gravado com esses mesmos dados (testes/legal/gravar.mjs --gravar); aqui só se troca o
 * que estiver diferente do config.js, para nada mudar na carga (CLS 0) quando o HTML está em dia.
 */
(function () {
  'use strict';
  var config = window.PBR_CONFIG;
  if (!config) return;

  function valor(caminho) {
    return caminho.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, config);
  }
  function provisorio(el, rotulo) {
    var texto = '[PROVISÓRIO: ' + rotulo + ']';
    if (el.textContent !== texto || el.children.length) el.textContent = texto;
    el.classList.add('legal__provisorio');
  }
  /** Link de contato: refeito só se o que está no HTML for diferente. */
  function link(el, href, texto, externo) {
    var atual = el.children.length === 1 && el.firstElementChild;
    el.classList.remove('legal__provisorio');
    if (atual && atual.tagName === 'A' && atual.getAttribute('href') === href && el.textContent === texto) return;
    var a = document.createElement('a');
    a.href = href;
    if (externo) { a.target = '_blank'; a.rel = 'noopener'; }
    a.textContent = texto;
    el.textContent = '';
    el.appendChild(a);
  }

  document.querySelectorAll('[data-cfg]').forEach(function (el) {
    var v = valor(el.getAttribute('data-cfg'));
    if (v === undefined || v === null || v === '') provisorio(el, el.getAttribute('data-cfg-rotulo') || 'a preencher');
    else {
      if (el.textContent !== String(v) || el.children.length) el.textContent = String(v);
      el.classList.remove('legal__provisorio');
    }
  });

  var email = config.contato && config.contato.email;
  document.querySelectorAll('[data-cfg-email]').forEach(function (el) {
    if (!email) { provisorio(el, 'e-mail'); return; }
    link(el, 'mailto:' + email, email, false);
  });

  var zap = config.contato && config.contato.whatsapp;
  var m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(zap || '');
  document.querySelectorAll('[data-cfg-whatsapp]').forEach(function (el) {
    if (!zap) { provisorio(el, 'WhatsApp'); return; }
    link(el, 'https://wa.me/' + zap, m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : zap, true);
  });

  var formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  document.querySelectorAll('[data-cfg-planos]').forEach(function (alvo) {
    var ul = document.createElement('ul');
    ul.className = 'legal__lista-planos';
    (config.planos || []).forEach(function (p) {
      var li = document.createElement('li');
      var b = document.createElement('strong');
      b.textContent = 'Plano ' + p.nome + ' — ' + formato.format(p.precoCentavos / 100) + ': ';
      li.appendChild(b);
      li.appendChild(document.createTextNode(p.itens.join('; ') + '. ' + p.prazo + '.'));
      ul.appendChild(li);
    });
    alvo.appendChild(ul);
  });
})();
