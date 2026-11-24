/*
 * inicio.js — roda ANTES da primeira pintura (carregado sem defer no <head>, logo depois do config.js).
 * Só marca o <html> com classes usadas pelo CSS, para nada "pular" na tela quando os outros scripts rodarem:
 *   - tira "sem-js" (o menu móvel passa a ser o botão);
 *   - põe "modo-rascunho" quando config.rascunho é true (mostra a faixa de rascunho);
 *   - aplica o tema escolhido no botão (data-tema="claro"|"escuro", localStorage pbr_tema), sem piscar; sem escolha,
 *     o CSS segue o sistema (prefers-color-scheme). Páginas com data-tema-fixo ficam sempre claras;
 *   - põe "com-abertura" na home (<html data-abertura>) na primeira visita da sessão, se o visitante não pediu
 *     movimento reduzido. A animação da abertura é toda em CSS (movimento.css) e termina sozinha;
 *     abertura.js só permite pular e limpa no final;
 *   - põe "com-retomada" na home (<html data-retomada>) quando este aparelho guarda a última tentativa de
 *     contratação (pbr_checkout_rascunho_v1, melhoria 60) de um plano que existe, não dispensada há menos de 7 dias
 *     (melhoria 90). O aviso "Continue de onde parou" já nasce no lugar, sem deslocar a página; retomada.js preenche.
 * Não faz nada além disso: mantenha este arquivo mínimo.
 */
(function () {
  'use strict';
  var html = document.documentElement;
  html.classList.remove('sem-js');
  if (window.PBR_CONFIG && window.PBR_CONFIG.rascunho) html.classList.add('modo-rascunho');

  if (!html.hasAttribute('data-tema-fixo')) {
    try {
      var tema = window.localStorage.getItem('pbr_tema');
      if (tema === 'claro' || tema === 'escuro') html.setAttribute('data-tema', tema);
    } catch (e) { /* sem localStorage: segue o sistema */ }
  }

  if (html.hasAttribute('data-abertura')) {
    var reduzido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var jaViu = true; // sem sessionStorage (modo privado/bloqueado): sem abertura, para não repetir a cada página
    try {
      jaViu = window.sessionStorage.getItem('pbr_abertura_vista') === '1';
      window.sessionStorage.setItem('pbr_abertura_vista', '1');
    } catch (e) { /* mantém jaViu = true */ }
    if (!reduzido && !jaViu) html.classList.add('com-abertura');
  }

  if (html.hasAttribute('data-retomada')) {
    try {
      var r = JSON.parse(window.localStorage.getItem('pbr_checkout_rascunho_v1'));
      var d = JSON.parse(window.localStorage.getItem('pbr_retomada_dispensada_v1'));
      var agora = Date.now();
      var salvo = r && typeof r.salvo_em === 'string' ? Date.parse(r.salvo_em) : NaN;
      var planos = (window.PBR_CONFIG && window.PBR_CONFIG.planos) || [];
      var existe = !!r && planos.some(function (p) { return p.id === r.plano_id; });
      var dispensou = !!d && typeof d.em === 'number' && agora - d.em >= 0 && agora - d.em < 7 * 864e5 && d.rascunho === r.salvo_em;
      if (existe && salvo && agora - salvo <= 30 * 864e5 && !dispensou) html.classList.add('com-retomada');
    } catch (e) { /* sem localStorage ou JSON inválido: sem aviso */ }
  }
})();
