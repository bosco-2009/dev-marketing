/*
 * admin-tempo-real.js — aviso de dados desatualizados no painel (melhoria 79).
 *
 * Cada aba com canal Realtime (conversas, pedidos, briefings) se registra aqui com a função que recarrega a sua lista
 * e informa o status do canal a cada mudança (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). Se algum canal cair
 * (aba em segundo plano, rede instável) e não voltar em alguns segundos, aparece o aviso
 * "Atualizações em tempo real pausadas" com o botão "Atualizar", que recarrega todas as listas.
 * Quando todos os canais voltam, as próprias abas recarregam as listas (já faziam isso no SUBSCRIBED) e o aviso
 * diz que voltou e some. Ao voltar para a aba ou à rede com o aviso aberto, as listas são recarregadas na hora.
 *
 * As listas são sempre substituídas pela resposta do banco (e as mensagens deduplicadas pelo id), então recarregar
 * várias vezes nunca duplica itens.
 *
 *   PBRTempoReal.registrar('pedidos', carregar)   // ao iniciar a aba
 *   PBRTempoReal.informar('pedidos', status)      // no callback do .subscribe()
 *   PBRTempoReal.esquecer('pedidos')              // ao encerrar (logout): status atrasados são ignorados
 */
(function () {
  'use strict';

  var ESPERA_MS = 2500;   // queda curta (reconexão rápida) não chega a mostrar o aviso
  var SUMIR_MS = 6000;    // "Tempo real de volta" fica na tela alguns segundos (≥ 5 s, melhoria 112)
  var RECHECAR_MS = 1000; // com o foco ou o ponteiro sobre o aviso, ele espera sair antes de sumir (WCAG 2.2.1)

  var canais = {};        // nome -> { recarregar: fn, ok: bool }
  var timerMostrar = null;
  var timerSumir = null;
  var visivel = false;
  var atualizando = false;

  function $(s) { return document.querySelector(s); }
  function caixa() { return $('[data-tempo-real]'); }
  function texto() { return $('[data-tempo-real-texto]'); }
  function botao() { return $('[data-tempo-real-atualizar]'); }
  function fechar() { return $('[data-tempo-real-fechar]'); }

  function nomes() { return Object.keys(canais); }
  function algumCaido() { return nomes().some(function (n) { return !canais[n].ok; }); }

  var fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function escrever(mensagem, comBotao, estadoVisual) {
    var c = caixa(), t = texto(), b = botao(), f = fechar();
    if (!c || !t) return;
    clearTimeout(timerSumir); timerSumir = null;
    if (!mensagem) {
      // O foco nunca fica num botão que vai sumir: volta para o conteúdo principal
      var focoDentro = c.contains(document.activeElement);
      c.removeAttribute('data-ativo');
      c.removeAttribute('data-estado');
      t.textContent = '';
      if (b) b.hidden = true;
      if (f) f.hidden = true;
      visivel = false;
      if (focoDentro) focarConteudo();
      return;
    }
    c.setAttribute('data-ativo', '');
    c.setAttribute('data-estado', estadoVisual);
    t.textContent = mensagem;
    if (b) b.hidden = !comBotao;
    if (f) f.hidden = estadoVisual !== 'ok';
    visivel = true;
  }

  function focarConteudo() {
    var m = document.getElementById('conteudo');
    if (!m) return;
    if (!m.hasAttribute('tabindex')) {
      m.setAttribute('tabindex', '-1');
      m.addEventListener('blur', function () { m.removeAttribute('tabindex'); }, { once: true });
    }
    m.focus({ preventScroll: true });
  }

  // Some depois de SUMIR_MS, mas nunca com o foco ou o ponteiro sobre o aviso (espera sair e confere de novo)
  function sumirDepois(ms) {
    clearTimeout(timerSumir);
    timerSumir = setTimeout(function () {
      timerSumir = null;
      var c = caixa();
      if (!c || c.getAttribute('data-estado') !== 'ok') return;
      if (c.contains(document.activeElement) || c.matches(':hover')) { sumirDepois(RECHECAR_MS); return; }
      escrever('');
    }, ms);
  }

  function mostrarPausado(extra) {
    escrever('Atualizações em tempo real pausadas.' + (extra ? ' ' + extra : ' As listas podem estar desatualizadas.'), true, 'pausado');
  }

  function avaliar() {
    if (algumCaido()) {
      if (visivel || timerMostrar) return;
      timerMostrar = setTimeout(function () {
        timerMostrar = null;
        if (algumCaido()) mostrarPausado();
      }, ESPERA_MS);
      return;
    }
    clearTimeout(timerMostrar); timerMostrar = null;
    if (visivel && caixa() && caixa().getAttribute('data-estado') === 'pausado') {
      // As abas recarregam sozinhas ao receber SUBSCRIBED; aqui só avisamos e saímos de cena.
      escrever('Tempo real de volta. Listas atualizadas.', false, 'ok');
      sumirDepois(SUMIR_MS);
    }
  }

  function recarregarTudo() {
    if (atualizando) return Promise.resolve();
    atualizando = true;
    var b = botao();
    if (b) { b.setAttribute('data-carregando', ''); b.setAttribute('aria-disabled', 'true'); }
    var promessas = nomes().map(function (n) {
      try { return Promise.resolve(canais[n].recarregar()).then(function (v) { return v === false ? 'erro' : v; }, function () { return 'erro'; }); }
      catch (e) { return Promise.resolve('erro'); }
    });
    return Promise.all(promessas).then(function (r) {
      atualizando = false;
      if (b) { b.removeAttribute('data-carregando'); b.removeAttribute('aria-disabled'); }
      var falhou = r.indexOf('erro') !== -1;
      if (!algumCaido()) { avaliar(); return; }
      mostrarPausado(falhou
        ? 'Não foi possível atualizar agora. Confira a internet e tente de novo.'
        : 'Listas atualizadas às ' + fHora.format(new Date()) + '.');
    });
  }

  function registrar(nome, recarregar) {
    canais[nome] = { recarregar: recarregar, ok: true };
  }

  function informar(nome, status) {
    var c = canais[nome];
    if (!c) return; // aba encerrada (logout): o CLOSED atrasado do removeChannel não conta
    c.ok = status === 'SUBSCRIBED';
    avaliar();
  }

  function esquecer(nome) {
    delete canais[nome];
    if (!nomes().length) { clearTimeout(timerMostrar); timerMostrar = null; escrever(''); }
    else avaliar();
  }

  function aoVoltar() {
    if (document.hidden || !algumCaido()) return;
    recarregarTudo();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var b = botao();
    if (b) b.addEventListener('click', function () {
      if (b.getAttribute('aria-disabled') === 'true') return;
      recarregarTudo();
    });
    // Dispensar pelo teclado (melhoria 112): botão "Fechar aviso" no estado "de volta" e Esc com o foco no aviso
    var f = fechar();
    if (f) f.addEventListener('click', function () { escrever(''); });
    var c = caixa();
    if (c) c.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && c.getAttribute('data-estado') === 'ok') { e.preventDefault(); escrever(''); }
    });
  });
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('online', aoVoltar);

  window.PBRTempoReal = {
    registrar: registrar,
    informar: informar,
    esquecer: esquecer,
    recarregarTudo: recarregarTudo
  };
})();
