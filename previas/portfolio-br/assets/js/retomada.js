/*
 * retomada.js — home: aviso "Continue de onde parou" (melhoria 90).
 * O inicio.js já decidiu, antes da 1ª pintura, se o aviso aparece (classe com-retomada no <html>): há neste
 * aparelho a última tentativa de contratação (pbr_checkout_rascunho_v1, gravada pelo planos.js ao ir para o
 * Mercado Pago e apagada pelo obrigado.js quando o pagamento é aprovado). Aqui só:
 *   - escreve o NOME do plano (nenhum dado pessoal aparece na home);
 *   - aponta o link para planos.html?plano=<id>&retomar=1 (lá o formulário vem preenchido, melhoria 60);
 *   - "Dispensar" esconde o aviso por 7 dias (pbr_retomada_dispensada_v1; uma tentativa nova volta a mostrar).
 */
(function () {
  'use strict';
  var html = document.documentElement;
  var config = window.PBR_CONFIG;
  var caixa = document.querySelector('[data-retomada-caixa]');
  if (!config || !caixa || !html.classList.contains('com-retomada')) return;

  var r = null;
  try { r = JSON.parse(localStorage.getItem('pbr_checkout_rascunho_v1')); } catch (e) { r = null; }
  var plano = r && (config.planos || []).filter(function (p) { return p.id === r.plano_id; })[0];
  if (!plano) { html.classList.remove('com-retomada'); return; }

  caixa.querySelector('[data-retomada-plano]').textContent = plano.nome;
  caixa.querySelector('[data-retomada-link]').setAttribute('href',
    'planos.html?plano=' + encodeURIComponent(plano.id) + '&retomar=1');

  caixa.querySelector('[data-retomada-dispensar]').addEventListener('click', function () {
    try {
      localStorage.setItem('pbr_retomada_dispensada_v1', JSON.stringify({ em: Date.now(), rascunho: r.salvo_em }));
    } catch (e) { /* sem armazenamento: some só nesta visita */ }
    html.classList.remove('com-retomada');
    var aviso = document.querySelector('[data-retomada-aviso]');
    if (aviso) aviso.textContent = 'Aviso dispensado. Ele volta se você começar outra contratação.';
    // o foco não se perde: vai para o título da seção seguinte, sem rolar a página
    var seguinte = document.getElementById('servicos-titulo');
    if (seguinte) {
      if (!seguinte.hasAttribute('tabindex')) seguinte.setAttribute('tabindex', '-1');
      seguinte.focus({ preventScroll: true });
    }
  });
})();
