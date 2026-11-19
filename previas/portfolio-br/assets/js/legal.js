/*
 * legal.js — preenche termos.html e privacidade.html com os dados do config.js.
 *   [data-cfg="caminho.no.config"]  → texto (vazio = "[PROVISÓRIO: rótulo]", visível de propósito)
 *   [data-cfg-email]                 → link mailto do contato.email
 *   [data-cfg-whatsapp]              → número formatado do contato.whatsapp
 *   [data-cfg-planos]                → lista dos planos (nome, preço, prazo, itens)
 * Sem JavaScript, os marcadores [PROVISÓRIO: ...] continuam visíveis.
 */
(function () {
  'use strict';
  var config = window.PBR_CONFIG;
  if (!config) return;

  function valor(caminho) {
    return caminho.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, config);
  }
  function provisorio(el, rotulo) {
    el.textContent = '[PROVISÓRIO: ' + rotulo + ']';
    el.classList.add('legal__provisorio');
  }

  document.querySelectorAll('[data-cfg]').forEach(function (el) {
    var v = valor(el.getAttribute('data-cfg'));
    if (v === undefined || v === null || v === '') provisorio(el, el.getAttribute('data-cfg-rotulo') || 'a preencher');
    else { el.textContent = String(v); el.classList.remove('legal__provisorio'); }
  });

  var email = config.contato && config.contato.email;
  document.querySelectorAll('[data-cfg-email]').forEach(function (el) {
    if (!email) { provisorio(el, 'e-mail'); return; }
    var a = document.createElement('a');
    a.href = 'mailto:' + email;
    a.textContent = email;
    el.classList.remove('legal__provisorio');
    el.textContent = '';
    el.appendChild(a);
  });

  var zap = config.contato && config.contato.whatsapp;
  var m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(zap || '');
  document.querySelectorAll('[data-cfg-whatsapp]').forEach(function (el) {
    if (!zap) { provisorio(el, 'WhatsApp'); return; }
    var a = document.createElement('a');
    a.href = 'https://wa.me/' + zap;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : zap;
    el.classList.remove('legal__provisorio');
    el.textContent = '';
    el.appendChild(a);
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
