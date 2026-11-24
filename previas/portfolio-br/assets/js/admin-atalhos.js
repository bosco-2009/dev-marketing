/*
 * admin-atalhos.js — atalhos de teclado do painel (melhoria 41).
 *
 *   g c / g p / g b / g r  → abas Conversas, Pedidos, Briefings e Resumo (uma tecla depois da outra, até 1,5 s)
 *   /                      → foca a busca da aba (Pedidos tem a própria; nas outras, a busca geral do topo)
 *   j / k                  → próximo / anterior da lista da aba aberta (Enter abre, como num clique)
 *   ?                      → abre o <dialog> com a lista de atalhos
 *
 * Os atalhos ficam desligados enquanto o foco está num campo de texto, com Ctrl/Alt/Meta apertados, com
 * algum <dialog> aberto ou fora do painel (login). WCAG 2.1.4: os atalhos de uma tecla podem ser desligados
 * no próprio diálogo (preferência só neste navegador, localStorage do admin). Com eles desligados, o botão
 * do teclado no topo continua abrindo a lista.
 */
(function () {
  'use strict';

  var CHAVE = 'pbr_admin_atalhos';
  var ESPERA_G = 1500;
  var ABAS = { c: '#conversas', p: '#pedidos', b: '#briefings', r: '#resumo' };

  var dialogo = document.querySelector('[data-atalhos-dialogo]');
  var abrir = document.querySelector('[data-atalhos-abrir]');
  if (!dialogo) return;
  var caixa = dialogo.querySelector('[data-atalhos-ligados]');
  var status = dialogo.querySelector('[data-atalhos-status]');
  var esperandoG = 0;
  var origemFoco = null;

  function ligados() {
    try { return localStorage.getItem(CHAVE) !== 'desligados'; } catch (e) { return true; }
  }
  function salvar(ligar) {
    try {
      if (ligar) localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, 'desligados');
    } catch (e) { /* sem armazenamento: vale só nesta visita */ }
  }
  var ativo = ligados();
  caixa.checked = ativo;

  function painelVisivel() {
    var p = document.querySelector('[data-tela="painel"]');
    return !!p && !p.hidden;
  }
  function digitando(alvo) {
    if (!alvo || alvo === document.body) return false;
    if (alvo.isContentEditable) return true;
    var tag = alvo.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      var t = (alvo.type || 'text').toLowerCase();
      return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].indexOf(t) === -1;
    }
    return false;
  }
  function algumDialogoAberto() { return !!document.querySelector('dialog[open]'); }
  function visivel(e) { return !!e && e.getClientRects().length > 0; }
  // Pelo endereço, e não pela seção visível: o "hashchange" que troca a seção chega depois da tecla.
  function abaAtual() {
    return ({ '#pedidos': 'pedidos', '#briefings': 'briefings', '#resumo': 'resumo' })[location.hash.split('/')[0]] || 'conversas';
  }

  function abrirLista() {
    if (dialogo.open) return;
    var f = document.activeElement;
    // Guarda também o data-id: a lista pode ser redesenhada (Realtime) com o diálogo aberto.
    origemFoco = f && f !== document.body ? { el: f, id: f.getAttribute('data-id') } : null;
    status.textContent = '';
    dialogo.showModal();
  }
  dialogo.addEventListener('close', function () {
    var o = origemFoco;
    origemFoco = null;
    if (!o) return;
    var alvo = o.el;
    if (!document.contains(alvo) && o.id && window.CSS && CSS.escape) {
      alvo = document.querySelector('.admin-item[data-id="' + CSS.escape(o.id) + '"]');
    }
    if (visivel(alvo)) alvo.focus();
  });
  dialogo.querySelector('[data-atalhos-fechar]').addEventListener('click', function () { dialogo.close(); });
  // Clique no fundo escurecido fecha (o clique no próprio <dialog> só acontece fora da caixa interna).
  dialogo.addEventListener('click', function (e) { if (e.target === dialogo) dialogo.close(); });
  if (abrir) abrir.addEventListener('click', abrirLista);

  caixa.addEventListener('change', function () {
    ativo = caixa.checked;
    salvar(ativo);
    esperandoG = 0;
    status.textContent = ativo ? 'Atalhos de uma tecla ligados.' : 'Atalhos de uma tecla desligados. O botão do teclado no topo continua mostrando esta lista.';
  });

  function focarBusca() {
    var secao = document.querySelector('[data-aba="' + abaAtual() + '"]');
    // Aba recém-trocada por "g p": a seção só aparece no "hashchange" que ainda vai chegar. Espera por ele.
    if (secao && secao.hidden) {
      var feito = false;
      var depois = function () {
        if (feito) return;
        feito = true;
        window.removeEventListener('hashchange', depois);
        setTimeout(focarCampo, 0);
      };
      window.addEventListener('hashchange', depois);
      setTimeout(depois, 300);
      return true;
    }
    return focarCampo();
  }
  function focarCampo() {
    var campo = abaAtual() === 'pedidos'
      ? document.querySelector('[data-busca-pedidos]')
      : document.querySelector('[data-busca-global-campo]');
    if (!visivel(campo)) campo = document.querySelector('[data-busca-global-campo]');
    if (!visivel(campo)) return false;
    campo.focus();
    if (campo.select) campo.select();
    return true;
  }

  // Itens da lista da aba aberta que estão na tela (no celular, com uma conversa aberta, a lista some).
  function itensDaLista() {
    var secao = document.querySelector('[data-aba="' + abaAtual() + '"]');
    if (!secao) return [];
    return Array.prototype.filter.call(secao.querySelectorAll('.admin-lista__itens > li > .admin-item'), visivel);
  }
  function andar(passo) {
    var itens = itensDaLista();
    if (!itens.length) return false;
    var i = itens.indexOf(document.activeElement);
    if (i === -1) {
      // Sem foco na lista: começa pelo item aberto (aria-current) ou pela ponta conforme a direção.
      var atual = itens.filter(function (b) { return b.getAttribute('aria-current') === 'true'; })[0];
      i = atual ? itens.indexOf(atual) : (passo > 0 ? -1 : itens.length);
      if (atual) passo = 0;
    }
    var alvo = itens[Math.max(0, Math.min(itens.length - 1, i + passo))];
    alvo.focus();
    alvo.scrollIntoView({ block: 'nearest' });
    return true;
  }

  // As listas são redesenhadas pelo Realtime e pelo relógio dos pedidos; o botão focado some e o foco cairia
  // no <body>, perdendo o lugar de quem anda com j/k ou Tab. Guarda o item focado e devolve o foco ao item
  // de mesmo data-id depois do redesenho (só se o foco não foi para outro lugar).
  var itemFocado = null;
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    itemFocado = t.matches && t.matches('.admin-lista__itens .admin-item') ? { id: t.getAttribute('data-id') } : null;
  });
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    var marcado = itemFocado;
    if (!marcado) return;
    // Saiu do item por vontade (clique fora): o item continua na página. Só o redesenho o desconecta.
    // Se o foco foi para outro item (j/k, Tab), o "focusin" já trocou itemFocado e nada é apagado.
    setTimeout(function () { if (itemFocado === marcado && t.isConnected && document.activeElement !== t) itemFocado = null; }, 0);
  });
  var observador = new MutationObserver(function () {
    if (!itemFocado || !itemFocado.id) return;
    var a = document.activeElement;
    if (a && a !== document.body) return;
    var novo = document.querySelector('.admin-lista__itens .admin-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(itemFocado.id) : itemFocado.id) + '"]');
    if (visivel(novo)) novo.focus({ preventScroll: true });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.admin-lista__itens'), function (l) {
    observador.observe(l, { childList: true });
  });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!painelVisivel() || algumDialogoAberto() || digitando(e.target)) { esperandoG = 0; return; }
    var tecla = e.key;

    // Desligados: nenhuma tecla isolada faz nada ("?" também é de uma tecla; resta o botão do topo).
    if (!ativo) return;

    if (esperandoG && Date.now() - esperandoG < ESPERA_G) {
      esperandoG = 0;
      var destino = ABAS[tecla && tecla.toLowerCase()];
      if (destino) {
        e.preventDefault();
        // "g p" com um pedido aberto (#pedidos/PBR-…) não fecha o pedido: já está na aba.
        if (location.hash.split('/')[0] !== destino) location.hash = destino;
        return;
      }
    }
    esperandoG = 0;

    switch (tecla) {
      case 'g': case 'G':
        esperandoG = Date.now();
        e.preventDefault();
        return;
      case '/':
        if (focarBusca()) e.preventDefault();
        return;
      case 'j': case 'J':
        if (andar(1)) e.preventDefault();
        return;
      case 'k': case 'K':
        if (andar(-1)) e.preventDefault();
        return;
      case '?':
        e.preventDefault();
        abrirLista();
        return;
    }
  });
})();
