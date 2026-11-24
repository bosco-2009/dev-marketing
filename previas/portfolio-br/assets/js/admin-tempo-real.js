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
  var SUMIR_MS = 6000;    // "Tempo real de volta" fica na tela alguns segundos

  var canais = {};        // nome -> { recarregar: fn, ok: bool }
  var timerMostrar = null;
  var timerSumir = null;
  var visivel = false;
  var atualizando = false;

  function $(s) { return document.querySelector(s); }
  function caixa() { return $('[data-tempo-real]'); }
  function texto() { return $('[data-tempo-real-texto]'); }
  function botao() { return $('[data-tempo-real-atualizar]'); }

  function nomes() { return Object.keys(canais); }
  function algumCaido() { return nomes().some(function (n) { return !canais[n].ok; }); }

  var fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function escrever(mensagem, comBotao, estadoVisual) {
    var c = caixa(), t = texto(), b = botao();
    if (!c || !t) return;
    clearTimeout(timerSumir);
    if (!mensagem) {
      c.removeAttribute('data-ativo');
      c.removeAttribute('data-estado');
      t.textContent = '';
      if (b) b.hidden = true;
      visivel = false;
      return;
    }
    c.setAttribute('data-ativo', '');
    c.setAttribute('data-estado', estadoVisual);
    t.textContent = mensagem;
    if (b) b.hidden = !comBotao;
    visivel = true;
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
      timerSumir = setTimeout(function () { escrever(''); }, SUMIR_MS);
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
