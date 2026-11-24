/*
 * admin-busca.js — busca global do painel (melhoria 37).
 * Um campo no topo procura por código do pedido, nome, e-mail, WhatsApp ou trecho de mensagem nas abas
 * Conversas, Pedidos e Briefings. Usa só os dados que as abas já carregaram (evento "pbr:admin-dados"):
 * nenhuma consulta nova ao banco. Nas conversas, o painel carrega só a última mensagem de cada uma, então é
 * ela que entra na busca.
 *
 * Teclado: seta para baixo (ou Enter) no campo vai para os resultados; setas, Home e End andam entre eles;
 * Esc fecha e volta ao campo. Os resultados são botões comuns, agrupados por aba com títulos.
 * Tudo que vem do banco entra com textContent (o destaque do trecho é um <mark> criado por código).
 */
(function () {
  'use strict';

  var MINIMO = 2;
  var POR_GRUPO = 5;
  var GRUPOS = [
    { tipo: 'conversas', titulo: 'Conversas', hash: '#conversas' },
    { tipo: 'pedidos', titulo: 'Pedidos', hash: '#pedidos' },
    { tipo: 'briefings', titulo: 'Briefings', hash: '#briefings' }
  ];
  var STATUS_PEDIDO = { aprovado: 'aprovado', pendente: 'pendente', recusado: 'recusado', cancelado: 'cancelado', reembolsado: 'reembolsado' };
  var STATUS_BRIEFING = { novo: 'novo', em_producao: 'em produção', em_revisao: 'em revisão', entregue: 'entregue' };

  var dados = { conversas: null, pedidos: null, briefings: null };
  var raiz, campo, painel, status, timer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // ------------------------------------------------------------------ busca (funções puras)
  // Minúsculas e sem acento. Cada caractere vira um só (NFD + remoção das marcas), então as posições
  // achadas no texto normalizado valem para o texto original — o que permite destacar o trecho certo.
  function normalizar(t) {
    return String(t == null ? '' : t).normalize('NFC').split('').map(function (c) {
      return c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c;
    }).join('');
  }
  function digitos(t) { return String(t == null ? '' : t).replace(/\D/g, ''); }

  // Procura o termo nos campos (na ordem dada) e devolve o primeiro que casar.
  function casar(campos, termo, termoDigitos) {
    for (var i = 0; i < campos.length; i++) {
      var c = campos[i];
      if (!c.valor) continue;
      if (c.telefone) {
        if (termoDigitos.length >= 4 && digitos(c.valor).indexOf(termoDigitos) !== -1) return { campo: c, pos: -1 };
        continue;
      }
      var pos = normalizar(c.valor).indexOf(termo);
      if (pos !== -1) return { campo: c, pos: pos };
    }
    return null;
  }

  function nomeConversa(c) { return c.nome || 'Visitante ' + String(c.id || '').slice(0, 4).toUpperCase(); }

  function procurar(texto) {
    var termo = normalizar(texto.trim());
    var termoDigitos = digitos(texto);
    var saida = { conversas: [], pedidos: [], briefings: [] };
    if (termo.length < MINIMO) return saida;

    (dados.conversas || []).forEach(function (c) {
      var ultima = (c.mensagens && c.mensagens[0]) || {};
      var m = casar([
        { rotulo: 'Nome', valor: c.nome },
        { rotulo: 'WhatsApp', valor: c.whatsapp, telefone: true },
        { rotulo: 'Mensagem', valor: ultima.texto, trecho: true },
        { rotulo: 'Origem', valor: c.pagina_origem }
      ], termo, termoDigitos);
      if (m) saida.conversas.push({ id: c.id, titulo: nomeConversa(c), extra: c.status === 'fechada' ? 'fechada' : '', achado: m, termo: termo });
    });

    (dados.pedidos || []).forEach(function (p) {
      var m = casar([
        { rotulo: 'Código', valor: p.codigo },
        { rotulo: 'Nome', valor: p.nome },
        { rotulo: 'E-mail', valor: p.email },
        { rotulo: 'WhatsApp', valor: p.whatsapp, telefone: true },
        { rotulo: 'Plano', valor: p.plano_nome }
      ], termo, termoDigitos);
      if (m) saida.pedidos.push({ id: p.id, titulo: (p.codigo || '') + ' · ' + (p.nome || ''), extra: STATUS_PEDIDO[p.status] || p.status || '', achado: m, termo: termo });
    });

    (dados.briefings || []).forEach(function (b) {
      var p = b.pedidos || {};
      var m = casar([
        { rotulo: 'Negócio', valor: b.nome_negocio },
        { rotulo: 'Código', valor: p.codigo },
        { rotulo: 'Nome', valor: p.nome },
        { rotulo: 'E-mail', valor: p.email },
        { rotulo: 'WhatsApp', valor: p.whatsapp, telefone: true }
      ], termo, termoDigitos);
      if (m) saida.briefings.push({ id: b.id, titulo: b.nome_negocio || ('Pedido ' + (p.codigo || '')), extra: STATUS_BRIEFING[b.status] || b.status || '', achado: m, termo: termo });
    });
    return saida;
  }

  // ------------------------------------------------------------------ interface
  // "Rótulo: texto" com o trecho encontrado num <mark>. Mensagens longas viram um recorte em volta do achado.
  function linhaAchado(r) {
    var p = el('span', 'admin-busca-global__achado');
    var c = r.achado.campo;
    p.appendChild(el('span', 'admin-busca-global__campo', c.rotulo + ': '));
    var valor = String(c.valor);
    if (r.achado.pos < 0) { p.appendChild(document.createTextNode(valor)); return p; }
    var ini = r.achado.pos, fim = ini + r.termo.length;
    var de = 0, ate = valor.length;
    if (c.trecho) {
      de = Math.max(0, ini - 30);
      ate = Math.min(valor.length, fim + 50);
    }
    p.appendChild(document.createTextNode((de > 0 ? '…' : '') + valor.slice(de, ini)));
    p.appendChild(el('mark', 'admin-busca-global__marca', valor.slice(ini, fim)));
    p.appendChild(document.createTextNode(valor.slice(fim, ate) + (ate < valor.length ? '…' : '')));
    return p;
  }

  function botoes() { return Array.prototype.slice.call(painel.querySelectorAll('[data-busca-resultado]')); }

  function abrirPainel(aberto) { painel.hidden = !aberto; }

  var voltando = false; // foco devolvido ao campo pelo Esc: não reabrir os resultados
  function fechar(voltarAoCampo) {
    abrirPainel(false);
    if (voltarAoCampo) { voltando = true; campo.focus(); voltando = false; }
  }

  function renderizar() {
    var texto = campo.value.trim();
    painel.textContent = '';
    if (normalizar(texto).length < MINIMO) { abrirPainel(false); status.textContent = ''; return; }

    var achados = procurar(texto);
    var total = 0;
    var partes = [];
    var carregando = GRUPOS.some(function (g) { return dados[g.tipo] === null; });

    GRUPOS.forEach(function (g) {
      var lista = achados[g.tipo];
      if (!lista.length) return;
      total += lista.length;
      partes.push(lista.length + ' em ' + g.titulo.toLowerCase());
      var idTitulo = 'busca-global-grupo-' + g.tipo;
      var grupo = el('section', 'admin-busca-global__grupo', null, { 'aria-labelledby': idTitulo });
      var titulo = el('h2', 'admin-busca-global__titulo', null, { id: idTitulo });
      titulo.appendChild(document.createTextNode(g.titulo + ' '));
      titulo.appendChild(el('span', 'admin-busca-global__conta', '(' + lista.length + ')'));
      grupo.appendChild(titulo);
      var ul = el('ul', 'admin-busca-global__itens', null, { role: 'list' });
      lista.slice(0, POR_GRUPO).forEach(function (r) {
        var li = el('li');
        var b = el('button', 'admin-busca-global__item', null, { type: 'button', 'data-busca-resultado': g.tipo, 'data-id': r.id });
        var l1 = el('span', 'admin-busca-global__linha');
        l1.appendChild(el('span', 'admin-busca-global__nome', r.titulo));
        if (r.extra) l1.appendChild(el('span', 'admin-busca-global__extra', r.extra));
        b.appendChild(l1);
        b.appendChild(linhaAchado(r));
        b.addEventListener('click', function () { irPara(g, r.id); });
        li.appendChild(b);
        ul.appendChild(li);
      });
      grupo.appendChild(ul);
      if (lista.length > POR_GRUPO) {
        var resto = lista.length - POR_GRUPO;
        grupo.appendChild(el('p', 'admin-busca-global__mais', 'E mais ' + resto + (resto === 1 ? ' resultado' : ' resultados') + ' em ' + g.titulo.toLowerCase() + '. Refine a busca para ver.'));
      }
      painel.appendChild(grupo);
    });

    if (!total) {
      painel.appendChild(el('p', 'admin-busca-global__vazio', 'Nada encontrado para “' + texto + '”.'));
    }
    if (carregando) {
      painel.appendChild(el('p', 'admin-busca-global__nota', 'Algumas abas ainda estão carregando; os resultados podem mudar.'));
    }
    abrirPainel(true);

    // Anúncio curto para leitor de tela, depois de uma pausa na digitação.
    clearTimeout(timer);
    timer = setTimeout(function () {
      status.textContent = total
        ? (total === 1 ? '1 resultado' : total + ' resultados') + ': ' + partes.join(', ') + '.'
        : 'Nenhum resultado.';
    }, 400);
  }

  // Vai para a aba e abre o item. A troca de aba acontece no "hashchange" do admin.js; o item só é aberto
  // depois disso, para o foco ir para o título do detalhe já visível.
  function irPara(g, id) {
    fechar(false);
    var abrir = function () {
      if (g.tipo === 'conversas' && window.PBRAdminChat) window.PBRAdminChat.abrirPorId(id);
      else if (g.tipo === 'pedidos' && window.PBRAdminPedidos) window.PBRAdminPedidos.abrirPorId(id, true);
      else if (g.tipo === 'briefings' && window.PBRAdminBriefings) window.PBRAdminBriefings.abrirPorId(id);
    };
    var atual = (location.hash || '#conversas').split('/')[0]; // #pedidos/PBR-… já é a aba Pedidos
    if (atual === g.hash) { abrir(); return; }
    window.addEventListener('hashchange', function uma() {
      window.removeEventListener('hashchange', uma);
      abrir();
    });
    location.hash = g.hash;
  }

  function iniciar() {
    raiz = $('[data-busca-global]');
    if (!raiz) return;
    campo = $('[data-busca-global-campo]', raiz);
    painel = $('[data-busca-global-resultados]', raiz);
    status = $('[data-busca-global-status]', raiz);

    campo.addEventListener('input', renderizar);
    // Voltar ao campo (clique ou Tab) reabre os resultados da busca que já estava escrita.
    campo.addEventListener('focus', function () { if (!voltando && painel.hidden && campo.value.trim()) renderizar(); });
    campo.addEventListener('keydown', function (e) {
      var lista = botoes();
      if (e.key === 'ArrowDown' && !painel.hidden && lista.length) { e.preventDefault(); lista[0].focus(); }
      else if (e.key === 'Enter' && !painel.hidden && lista.length) { e.preventDefault(); lista[0].click(); }
      else if (e.key === 'Escape' && !painel.hidden) { e.preventDefault(); e.stopPropagation(); fechar(true); }
    });
    painel.addEventListener('keydown', function (e) {
      var lista = botoes();
      var i = lista.indexOf(document.activeElement);
      if (i === -1) return;
      var alvo = null;
      if (e.key === 'ArrowDown') alvo = lista[Math.min(i + 1, lista.length - 1)];
      else if (e.key === 'ArrowUp') alvo = i === 0 ? campo : lista[i - 1];
      else if (e.key === 'Home') alvo = lista[0];
      else if (e.key === 'End') alvo = lista[lista.length - 1];
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (alvo) { e.preventDefault(); alvo.focus(); }
    });
    // Fecha ao sair da busca (Tab para fora ou clique em outro lugar).
    raiz.addEventListener('focusout', function (e) {
      if (!e.relatedTarget || !raiz.contains(e.relatedTarget)) abrirPainel(false);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!painel.hidden && !raiz.contains(e.target)) abrirPainel(false);
    });
  }

  document.addEventListener('pbr:admin-dados', function (e) {
    var d = e.detail || {};
    if (d.tipo === 'limpar') {
      dados = { conversas: null, pedidos: null, briefings: null };
      if (campo) { campo.value = ''; abrirPainel(false); status.textContent = ''; }
      return;
    }
    if (!(d.tipo in dados)) return;
    dados[d.tipo] = d.itens || [];
    // Painel aberto: atualiza os resultados com os dados novos (tempo real), sem roubar o foco.
    // Se o foco está num resultado, espera: redesenhar agora tiraria o foco do lugar.
    if (painel && !painel.hidden && !painel.contains(document.activeElement)) renderizar();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Exposto para testes.
  window.PBRAdminBusca = { procurar: procurar, normalizar: normalizar };
})();
