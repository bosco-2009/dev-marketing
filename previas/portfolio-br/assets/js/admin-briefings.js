/*
 * admin-briefings.js — aba "Briefings" do painel.
 * Lista os briefings (com o pedido de cada um), mostra a ficha completa, gera links temporários
 * para baixar os arquivos (bucket privado) e muda o status (novo → em_producao → em_revisao → entregue).
 * Iniciada por admin.js depois de confirmar que o usuário é admin.
 */
(function () {
  'use strict';

  var STATUS = { novo: 'Novo', em_producao: 'Em produção', em_revisao: 'Em revisão', entregue: 'Entregue' };
  var DOMINIO = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei' };
  var CAMPOS = [
    ['nome_negocio', 'Nome do negócio'], ['segmento', 'Segmento'], ['cidade', 'Cidade/UF'], ['publico', 'Clientes'],
    ['objetivo', 'Objetivo do site'], ['paginas', 'Páginas desejadas'], ['cores_estilo', 'Cores e estilo'],
    ['referencias', 'Referências'], ['textos_servicos', 'Serviços e textos'], ['contatos_redes', 'Contatos e redes'],
    ['tem_dominio', 'Tem domínio?'], ['dominio', 'Domínio'], ['links_arquivos', 'Links de arquivos'], ['observacoes', 'Observações']
  ];

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  var fData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  function data(iso) { return iso ? fData.format(new Date(iso)) : '—'; }
  function linkSeguro(u) { return /^https?:\/\//i.test(u); }

  var estado = null;
  var timer = null;

  function iniciar(sb, avisos) {
    if (estado) return;
    estado = { sb: sb, avisos: avisos || {}, lista: [], filtro: 'todos', selecionado: null, canal: null, conhecidos: null, intervalo: null };
    var secao = $('.admin-briefings');
    // Listas longas (melhoria 49): 50 briefings por vez, os atualizados mais recentemente primeiro.
    estado.paginacao = window.PBRPaginacao ? window.PBRPaginacao.criar({
      raiz: $('[data-mais="briefings"]'), nomes: ['briefing', 'briefings'], lista: $('[data-lista-briefings]'),
      carregar: function () { return carregar(); }
    }) : null;

    $$('[data-filtro-briefing]').forEach(function (b) {
      b.onclick = function () {
        estado.filtro = b.getAttribute('data-filtro-briefing');
        $$('[data-filtro-briefing]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderizarLista();
      };
    });
    $('[data-briefing-voltar]').onclick = function () {
      secao.classList.remove('mostrando-conversa');
      var item = estado.selecionado && $('[data-lista-briefings] [data-id="' + estado.selecionado + '"]');
      if (item) item.focus();
    };
    $('[data-briefing-status]').onchange = mudarStatus;
    $('[data-briefing-ver-pedido]').onclick = function () {
      var b = atual();
      if (!b || !window.PBRAdminPedidos) return;
      location.hash = '#pedidos';
      window.PBRAdminPedidos.abrirPorId(b.pedido_id);
    };

    if (window.PBRAvisos) window.PBRAvisos.acompanharAba('briefings', contarNovosNaoVistos);
    carregar();
    estado.canal = sb.channel('painel-briefings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings' }, function () { clearTimeout(timer); timer = setTimeout(carregar, 300); })
      .subscribe(function (status) {
        if (!estado) return;
        clearInterval(estado.intervalo);
        if (status !== 'SUBSCRIBED') estado.intervalo = setInterval(carregar, 30000);
        else carregar();
      });
  }

  function carregar() {
    if (!estado) return Promise.resolve();
    var limite = estado.paginacao ? estado.paginacao.limite() : 500;
    return estado.sb.from('briefings')
      .select('*, pedidos(codigo, nome, email, whatsapp, plano_nome)', { count: 'exact' })
      .order('atualizado_em', { ascending: false })
      .range(0, limite - 1)
      .then(function (r) {
        if (r.error) throw r.error;
        if (!estado) return;
        var lista = r.data || [];
        // aviso de briefing novo (não na primeira carga)
        var ids = {};
        lista.forEach(function (b) { ids[b.id] = b.atualizado_em; });
        if (estado.conhecidos) {
          var novidade = lista.some(function (b) { return b.status === 'novo' && estado.conhecidos[b.id] !== b.atualizado_em; });
          if (novidade) {
            if (estado.avisos.tocarSom) estado.avisos.tocarSom();
            if (estado.avisos.atento && !estado.avisos.atento() && estado.avisos.piscarTitulo) estado.avisos.piscarTitulo();
            var b0 = lista.filter(function (b) { return b.status === 'novo' && estado.conhecidos[b.id] !== b.atualizado_em; })[0];
            if (estado.avisos.notificar) {
              estado.avisos.notificar({
                titulo: estado.conhecidos[b0.id] ? 'Briefing atualizado' : 'Briefing novo!',
                corpo: 'Pedido ' + ((b0.pedidos && b0.pedidos.codigo) || '') + ((b0.pedidos && b0.pedidos.nome) ? ' · ' + b0.pedidos.nome : ''),
                aba: 'briefings',
                tag: 'pbr-briefing-' + b0.id
              });
            }
          }
        }
        estado.conhecidos = ids;
        estado.lista = lista;
        if (estado.paginacao) estado.paginacao.atualizar(lista.length, r.count);
        // Busca global (admin-busca.js) usa os briefings já carregados.
        document.dispatchEvent(new CustomEvent('pbr:admin-dados', { detail: { tipo: 'briefings', itens: lista,
          limiteAtingido: estado.paginacao ? estado.paginacao.haMais() : lista.length >= limite } }));
        contarNovosNaoVistos();
        renderizarLista();
        if (estado.selecionado) renderizarDetalhe(false);
      })
      .catch(function () {
        var vazio = $('[data-briefings-vazio]');
        vazio.textContent = 'Não foi possível carregar os briefings.';
        vazio.hidden = false;
        return false;
      });
  }

  // Contador do título/favicon: briefings "novo" enviados ou editados depois da última visita à aba.
  function contarNovosNaoVistos() {
    if (!estado || !window.PBRAvisos) return;
    window.PBRAvisos.contarNovos('briefings',
      estado.lista.filter(function (b) { return b.status === 'novo'; }),
      function (b) { return b.atualizado_em; });
  }

  function atual() { return estado && estado.lista.filter(function (b) { return b.id === estado.selecionado; })[0]; }

  function renderizarLista() {
    var ul = $('[data-lista-briefings]');
    var itens = estado.lista.filter(function (b) { return estado.filtro === 'todos' || b.status === estado.filtro; });
    ul.textContent = '';
    var vazio = $('[data-briefings-vazio]');
    vazio.textContent = 'Nenhum briefing com este filtro.';
    vazio.hidden = itens.length > 0;

    var cont = { todos: estado.lista.length };
    estado.lista.forEach(function (b) { cont[b.status] = (cont[b.status] || 0) + 1; });
    $$('[data-filtro-briefing]').forEach(function (b) {
      var f = b.getAttribute('data-filtro-briefing');
      var nome = { todos: 'Todos', novo: 'Novos', em_producao: 'Em produção', em_revisao: 'Em revisão', entregue: 'Entregues' }[f];
      b.textContent = nome + ' (' + (cont[f] || 0) + ')';
    });
    var selo = $('[data-selo-aba="briefings"]');
    if (selo) { selo.hidden = !cont.novo; selo.textContent = cont.novo ? String(cont.novo) : ''; }

    itens.forEach(function (b) {
      var p = b.pedidos || {};
      var li = el('li');
      var bt = el('button', 'admin-item', null, { type: 'button', 'data-id': b.id });
      if (b.id === estado.selecionado) bt.setAttribute('aria-current', 'true');
      var l1 = el('span', 'admin-item__linha');
      l1.appendChild(el('span', 'admin-item__nome', b.nome_negocio));
      l1.appendChild(el('time', 'admin-item__hora', data(b.atualizado_em), { datetime: b.atualizado_em }));
      var l2 = el('span', 'admin-item__linha');
      l2.appendChild(el('span', 'admin-item__previa', (p.codigo || '') + ' · ' + (p.nome || '') + ' · ' + (p.plano_nome || '')));
      l2.appendChild(el('span', 'admin-status admin-status--' + b.status, STATUS[b.status] || b.status));
      bt.appendChild(l1);
      bt.appendChild(l2);
      bt.onclick = function () { abrir(b.id); };
      li.appendChild(bt);
      ul.appendChild(li);
    });
  }

  function abrir(id) {
    estado.selecionado = id;
    $('.admin-briefings').classList.add('mostrando-conversa');
    renderizarLista();
    renderizarDetalhe(true);
  }

  function renderizarDetalhe(focar) {
    var b = atual();
    $('[data-briefing-vazio]').hidden = !!b;
    $('[data-briefing-detalhe]').hidden = !b;
    if (!b) return;
    var p = b.pedidos || {};
    $('[data-briefing-titulo]').textContent = b.nome_negocio;
    $('[data-briefing-subtitulo]').textContent = 'Pedido ' + (p.codigo || '') + ' · ' + (p.nome || '') + ' · Plano ' + (p.plano_nome || '') +
      ' · atualizado em ' + data(b.atualizado_em) + (b.envios > 1 ? ' (' + b.envios + ' envios)' : '');
    $('[data-briefing-status]').value = b.status;
    $('[data-erro-briefing-admin]').hidden = true;

    var dl = $('[data-briefing-dados]');
    dl.textContent = '';
    CAMPOS.forEach(function (c) {
      var v = b[c[0]];
      dl.appendChild(el('dt', null, c[1]));
      var dd = el('dd', 'admin-dados__longo');
      if (Array.isArray(v)) {
        if (!v.length) dd.textContent = '—';
        v.forEach(function (u, i) {
          if (i) dd.appendChild(document.createElement('br'));
          if (linkSeguro(u)) dd.appendChild(el('a', null, u, { href: u, target: '_blank', rel: 'noopener noreferrer' }));
          else dd.appendChild(document.createTextNode(u));
        });
      } else {
        dd.textContent = c[0] === 'tem_dominio' ? (DOMINIO[v] || '—') : (v || '—');
      }
      dl.appendChild(dd);
    });
    if (p.email || p.whatsapp) {
      dl.appendChild(el('dt', null, 'Contato do cliente'));
      dl.appendChild(el('dd', null, [p.email, p.whatsapp].filter(Boolean).join(' · ')));
    }

    var ul = $('[data-briefing-arquivos]');
    ul.textContent = '';
    var arquivos = Array.isArray(b.arquivos) ? b.arquivos : [];
    $('[data-briefing-sem-arquivos]').hidden = arquivos.length > 0;
    arquivos.forEach(function (a) {
      var li = el('li');
      li.appendChild(el('span', 'admin-arquivos__nome', a.nome || a.caminho));
      if (a.tamanho) li.appendChild(el('span', 'admin-item__hora', a.tamanho >= 1048576 ? (a.tamanho / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(a.tamanho / 1024)) + ' KB'));
      var baixar = el('button', 'botao botao--contorno botao--pequeno', 'Baixar', { type: 'button', 'aria-label': 'Baixar ' + (a.nome || 'arquivo') });
      baixar.onclick = function () { baixarArquivo(a, baixar); };
      li.appendChild(baixar);
      ul.appendChild(li);
    });

    if (focar) $('[data-briefing-titulo]').focus();
  }

  // Link temporário (60 s) para o arquivo do bucket privado; o RLS só permite ao admin.
  function baixarArquivo(a, botao) {
    botao.disabled = true;
    estado.sb.storage.from('briefings').createSignedUrl(a.caminho, 60, { download: a.nome || true })
      .then(function (r) {
        if (r.error || !r.data || !r.data.signedUrl) throw r.error || new Error('sem url');
        var link = el('a', null, null, { href: r.data.signedUrl, target: '_blank', rel: 'noopener', 'data-download': '' });
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch(function () {
        var erro = $('[data-erro-briefing-admin]');
        erro.textContent = 'Não foi possível gerar o link do arquivo.';
        erro.hidden = false;
      })
      .then(function () { botao.disabled = false; });
  }

  function mudarStatus(e) {
    var b = atual();
    if (!b) return;
    var novo = e.target.value;
    var anterior = b.status;
    e.target.disabled = true;
    estado.sb.from('briefings').update({ status: novo }).eq('id', b.id).select('id, status')
      .then(function (r) {
        if (r.error || !r.data || !r.data.length) throw r.error || new Error('nada alterado');
        b.status = novo;
        renderizarLista();
        renderizarDetalhe(false);
      })
      .catch(function () {
        e.target.value = anterior;
        var erro = $('[data-erro-briefing-admin]');
        erro.textContent = 'Não foi possível mudar o status.';
        erro.hidden = false;
      })
      .then(function () { e.target.disabled = false; });
  }

  function encerrar() {
    if (!estado) return;
    if (estado.canal) estado.sb.removeChannel(estado.canal);
    clearInterval(estado.intervalo);
    if (estado.paginacao) estado.paginacao.reiniciar();
    estado = null;
    var ul = $('[data-lista-briefings]');
    if (ul) ul.textContent = '';
    var det = $('[data-briefing-detalhe]');
    if (det) det.hidden = true;
  }

  // Busca global (melhoria 37): abre um briefing já carregado, mostrando "Todos" se o filtro o escondia.
  function abrirPorId(id) {
    if (!estado || !estado.lista.some(function (b) { return b.id === id; })) return;
    var item = estado.lista.filter(function (b) { return b.id === id; })[0];
    if (estado.filtro !== 'todos' && item.status !== estado.filtro) {
      estado.filtro = 'todos';
      $$('[data-filtro-briefing]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filtro-briefing') === 'todos')); });
    }
    abrir(id);
  }

  window.PBRAdminBriefings = { iniciar: iniciar, encerrar: encerrar, abrirPorId: abrirPorId };
})();
