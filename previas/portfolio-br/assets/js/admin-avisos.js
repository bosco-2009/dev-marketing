/*
 * admin-avisos.js — avisos do painel: contador no título e no favicon e notificações do navegador.
 *
 *   PBRAvisos.definir(fonte, n)   // 'conversas' (mensagens não lidas), 'pedidos' (pagos não vistos), 'briefings' (novos não vistos)
 *   PBRAvisos.tituloBase()        // "(3) Painel — Portfólio BR" ou o título original
 *   PBRAvisos.notificar({ titulo, corpo, aba, tag })  // só se o dono ativou e a aba não está em foco
 *   PBRAvisos.contarNovos(aba, itens, fnData)          // pedidos/briefings chegados depois do último "visto"
 *   PBRAvisos.acompanharAba(aba, recontar)              // reconta ao abrir a aba ou voltar para a janela
 *   PBRAvisos.limpar()            // ao sair
 *
 * O som continua em admin.js (botão próprio). As notificações não mostram o texto das mensagens
 * (podem aparecer na tela bloqueada): só o tipo de aviso e o nome/código.
 */
(function () {
  'use strict';

  var CHAVE_NOTIF = 'pbr_admin_notificacoes';
  var CHAVE_VISTO = 'pbr_admin_visto_';
  var TITULO_ORIGINAL = document.title;
  var ICONE = new URL('../assets/img/logo-icone.svg', document.baseURI).href;

  var fontes = { conversas: 0, pedidos: 0, briefings: 0 };
  var piscando = false;

  function ler(chave) { try { return window.localStorage.getItem(chave); } catch (e) { return null; } }
  function gravar(chave, valor) { try { window.localStorage.setItem(chave, valor); } catch (e) { /* ignora */ } }

  function total() { return fontes.conversas + fontes.pedidos + fontes.briefings; }
  function tituloBase() {
    var n = total();
    return n ? '(' + (n > 99 ? '99+' : n) + ') ' + TITULO_ORIGINAL : TITULO_ORIGINAL;
  }

  function definir(fonte, n) {
    n = Math.max(0, Number(n) || 0);
    if (fontes[fonte] === n) return;
    fontes[fonte] = n;
    atualizar();
  }

  function atualizar() {
    if (!piscando) document.title = tituloBase();
    desenharFavicon(total());
  }

  // ------------------------------------------------------------------ favicon com selo
  var linksIcone = Array.prototype.slice.call(document.querySelectorAll('link[rel~="icon"]'));
  linksIcone.forEach(function (l) { l.setAttribute('data-href-original', l.getAttribute('href')); });
  var imagemBase = null;
  var ultimoFavicon = 0;

  function carregarBase() {
    if (imagemBase) return imagemBase;
    imagemBase = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = new URL('../assets/img/favicon.svg', document.baseURI).href;
    });
    return imagemBase;
  }

  function cor(nome, reserva) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || reserva;
  }

  function desenharFavicon(n) {
    if (n === ultimoFavicon) return;
    ultimoFavicon = n;
    if (!n) {
      linksIcone.forEach(function (l) { l.setAttribute('href', l.getAttribute('data-href-original')); });
      document.documentElement.removeAttribute('data-favicon-selo');
      return;
    }
    carregarBase().then(function (img) {
      if (ultimoFavicon !== n) return; // mudou enquanto carregava
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (img) ctx.drawImage(img, 0, 0, 64, 64);
      var texto = n > 9 ? '9+' : String(n);
      ctx.beginPath();
      ctx.arc(44, 20, 20, 0, Math.PI * 2);
      ctx.fillStyle = cor('--cor-erro', '#B42318');
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 ' + (texto.length > 1 ? 22 : 28) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, 44, 22);
      var url;
      try { url = canvas.toDataURL('image/png'); } catch (e) { return; }
      linksIcone.forEach(function (l) { l.setAttribute('href', url); });
      document.documentElement.setAttribute('data-favicon-selo', texto);
    });
  }

  // ------------------------------------------------------------------ "visto" de pedidos e briefings
  // Na primeira vez, tudo o que já existe conta como visto (o contador só mostra o que chegar depois).
  function vistoEm(aba) {
    var v = ler(CHAVE_VISTO + aba);
    if (!v) { v = new Date().toISOString(); gravar(CHAVE_VISTO + aba, v); }
    return v;
  }
  function marcarVisto(aba) { gravar(CHAVE_VISTO + aba, new Date().toISOString()); }

  function vendoAba(aba) {
    var atual = location.hash ? location.hash.slice(1).split('/')[0] : 'conversas'; // #pedidos/PBR-… é a aba pedidos
    return atual === aba && atento();
  }

  // Conta os itens com data posterior ao último "visto" da aba e atualiza o contador.
  // Se o dono está olhando a aba agora, tudo conta como visto.
  function contarNovos(aba, itens, data) {
    if (vendoAba(aba)) marcarVisto(aba);
    var visto = Date.parse(vistoEm(aba));
    var n = (itens || []).filter(function (i) { var t = Date.parse(data(i)); return t > visto; }).length;
    definir(aba, n);
    return n;
  }

  // Reconta quando o dono abre a aba ou volta para a janela.
  var recontagens = {};
  function acompanharAba(aba, recontar) { recontagens[aba] = recontar; }
  function recontarTudo() {
    Object.keys(recontagens).forEach(function (aba) { if (recontagens[aba]) recontagens[aba](); });
  }
  window.addEventListener('hashchange', recontarTudo);
  window.addEventListener('focus', recontarTudo);
  document.addEventListener('visibilitychange', recontarTudo);

  // ------------------------------------------------------------------ notificações do navegador
  var suportado = 'Notification' in window && window.isSecureContext !== false;
  var botao = document.querySelector('[data-botao-notificacoes]');
  var dica = document.querySelector('[data-notificacoes-dica]');

  function permissao() { return suportado ? window.Notification.permission : 'denied'; }
  function ativas() { return suportado && permissao() === 'granted' && ler(CHAVE_NOTIF) !== 'off'; }

  function atualizarBotao(mensagem) {
    if (!botao) return;
    botao.hidden = !suportado;
    if (!suportado) return;
    var p = permissao();
    var ligado = ativas();
    botao.setAttribute('aria-pressed', String(ligado));
    botao.setAttribute('data-estado', p === 'denied' ? 'bloqueado' : ligado ? 'ligado' : 'desligado');
    botao.querySelector('use').setAttribute('href', ligado ? '#i-sino' : '#i-sino-mudo');
    botao.title = p === 'denied'
      ? 'Notificações bloqueadas no navegador (libere nas configurações do site)'
      : ligado ? 'Notificações ligadas' : 'Ativar notificações do navegador';
    if (dica && mensagem) {
      dica.textContent = '';
      // pequena espera para o leitor de tela anunciar a troca
      setTimeout(function () { dica.textContent = mensagem; }, 50);
    }
  }

  if (botao) {
    atualizarBotao();
    botao.addEventListener('click', function () {
      if (!suportado) return;
      var p = permissao();
      if (p === 'denied') {
        atualizarBotao('As notificações estão bloqueadas neste navegador. Libere nas configurações do site e tente de novo.');
        return;
      }
      if (p === 'granted') {
        var ligar = !ativas();
        gravar(CHAVE_NOTIF, ligar ? 'on' : 'off');
        atualizarBotao(ligar ? 'Notificações ligadas.' : 'Notificações desligadas.');
        return;
      }
      var pedido = window.Notification.requestPermission(function () { /* API antiga usa callback */ });
      Promise.resolve(pedido).then(function () {
        if (permissao() === 'granted') gravar(CHAVE_NOTIF, 'on');
        atualizarBotao(permissao() === 'granted'
          ? 'Notificações ligadas. Você será avisado de conversas, pagamentos e briefings novos.'
          : 'Notificações não foram permitidas.');
      });
    });
  }

  function atento() { return !document.hidden && document.hasFocus(); }

  function notificar(opcoes) {
    if (!ativas() || atento()) return null;
    try {
      var n = new window.Notification(opcoes.titulo, {
        body: opcoes.corpo || '',
        tag: opcoes.tag || undefined,
        icon: ICONE,
        lang: 'pt-BR'
      });
      n.onclick = function () {
        window.focus();
        if (opcoes.aba) location.hash = '#' + opcoes.aba;
        n.close();
      };
      return n;
    } catch (e) {
      return null; // ex.: Android exige service worker para Notification()
    }
  }

  function limpar() {
    recontagens = {};
    fontes = { conversas: 0, pedidos: 0, briefings: 0 };
    atualizar();
  }

  window.PBRAvisos = {
    definir: definir,
    total: total,
    tituloBase: tituloBase,
    notificar: notificar,
    vistoEm: vistoEm,
    marcarVisto: marcarVisto,
    contarNovos: contarNovos,
    acompanharAba: acompanharAba,
    limpar: limpar,
    piscando: function (sim) { piscando = !!sim; if (!piscando) document.title = tituloBase(); }
  };
})();
