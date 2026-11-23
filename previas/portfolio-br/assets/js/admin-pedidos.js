/*
 * admin-pedidos.js — aba "Pedidos" do painel.
 * Só leitura: pedidos e notificações do Mercado Pago (o status muda apenas pelo webhook).
 * Iniciada por admin.js depois de confirmar que o usuário é admin:
 *   PBRAdminPedidos.iniciar(clienteSupabase, { tocarSom, piscarTitulo, atento })
 */
(function () {
  'use strict';

  var COLUNAS = 'id, codigo, plano_id, plano_nome, valor_centavos, nome, email, whatsapp, status, ' +
    'mp_preference_id, mp_payment_id, mp_status, mp_status_detalhe, aceite_termos_em, pago_em, criado_em, atualizado_em';
  // Origem do visitante (melhoria 10): coluna nova; se a migration ainda não foi aplicada, o painel lê sem ela.
  var colunas = COLUNAS + ', origem';

  var ROTULOS = {
    pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado'
  };

  // Recuperação de checkout abandonado (melhoria 23): pendente há mais de 1 hora.
  // Nada é enviado sozinho: o dono abre o WhatsApp com a mensagem pronta e decide.
  var ABANDONO_MS = 60 * 60 * 1000;
  var CHAVE_CHAMADOS = 'pbr-admin-recuperacao';
  function abandonado(p, agora) {
    return p.status === 'pendente' && !!p.criado_em && (agora || Date.now()) - new Date(p.criado_em).getTime() > ABANDONO_MS;
  }
  function tempoParado(iso) {
    var min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 120) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 48) return h + ' h';
    return Math.floor(h / 24) + ' dias';
  }
  // Quando o dono abriu o WhatsApp para cada pedido (só neste navegador; conveniência, não é dado do cliente).
  function lerChamados() {
    try { var v = JSON.parse(localStorage.getItem(CHAVE_CHAMADOS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function marcarChamado(id) {
    var mapa = lerChamados();
    mapa[id] = new Date().toISOString();
    try { localStorage.setItem(CHAVE_CHAMADOS, JSON.stringify(mapa)); } catch (e) { /* sem storage: só não lembra */ }
    return mapa[id];
  }
  function mensagemRecuperacao(p) {
    var cfg = window.PBR_CONFIG || {};
    var site = cfg.site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    var link = site.url ? site.url.replace(/\/?$/, '/') + 'planos.html?plano=' + encodeURIComponent(p.plano_id || '') : '';
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Vi que o seu pedido ' + p.codigo + ' (plano ' + p.plano_nome + ', ' + fReal.format(p.valor_centavos / 100) + ') ' +
      'ficou com o pagamento pendente. Posso ajudar a concluir ou tirar alguma dúvida?' +
      (link ? ' Se preferir, dá para retomar por aqui: ' + link : '');
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  var fReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  function data(iso) { return iso ? fData.format(new Date(iso)) : '—'; }
  function whatsappFormatado(d) {
    var m = /^(?:55)?(\d{2})(\d{4,5})(\d{4})$/.exec(d || '');
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : d;
  }
  function linkWhatsapp(d) {
    var n = String(d || '').replace(/\D/g, '');
    return 'https://wa.me/' + (n.length <= 11 ? '55' + n : n);
  }
  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var estado = null;

  function iniciar(sb, avisos) {
    if (estado) return;
    estado = { sb: sb, avisos: avisos || {}, pedidos: [], briefings: {}, filtro: 'todos', busca: '', periodo: 'tudo', origem: '', selecionado: null, canal: null, conhecidos: null, timer: null, relogio: null, chaveAbandono: '' };

    var secao = $('.admin-pedidos');
    var lista = $('[data-lista-pedidos]');

    $$('[data-filtro-pedido]').forEach(function (b) {
      b.onclick = function () {
        estado.filtro = b.getAttribute('data-filtro-pedido');
        $$('[data-filtro-pedido]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderizarLista();
      };
    });
    $('[data-busca-pedidos]').oninput = function (e) { estado.busca = normalizar(e.target.value.trim()); renderizarLista(); };
    // Período, origem e exportação (melhoria 20)
    var selPeriodo = $('[data-periodo-pedidos]');
    var selOrigem = $('[data-origem-pedidos]');
    if (selPeriodo) selPeriodo.onchange = function () { estado.periodo = selPeriodo.value; renderizarLista(); };
    if (selOrigem) selOrigem.onchange = function () { estado.origem = selOrigem.value; renderizarLista(); };
    var botaoExportar = $('[data-exportar-pedidos]');
    if (botaoExportar) botaoExportar.onclick = exportar;
    $('[data-pedido-voltar]').onclick = function () {
      secao.classList.remove('mostrando-conversa');
      var item = estado.selecionado && lista.querySelector('[data-id="' + estado.selecionado + '"]');
      if (item) item.focus();
    };

    prepararRecuperacao();
    // Um pedido vira "abandonado" com o passar do tempo, sem evento no banco: confere a cada minuto.
    estado.relogio = setInterval(function () {
      if (estado && chaveAbandono() !== estado.chaveAbandono) { renderizarLista(); if (estado.selecionado) renderizarRecuperacao(); }
    }, 60000);

    if (window.PBRAvisos) window.PBRAvisos.acompanharAba('pedidos', contarPagosNaoVistos);
    carregar();
    // Tempo real (RLS do admin); sem conexão, atualiza a cada 30 s.
    estado.canal = sb.channel('painel-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, function () { agendar(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings' }, function () { agendar(); })
      .subscribe(function (status) {
        clearInterval(estado && estado.timer);
        if (status !== 'SUBSCRIBED' && estado) estado.timer = setInterval(carregar, 30000);
        else if (estado) carregar();
      });
  }

  function chaveAbandono() {
    var agora = Date.now();
    return estado.pedidos.filter(function (p) { return abandonado(p, agora); }).map(function (p) { return p.id; }).join(',');
  }

  function prepararRecuperacao() {
    var campo = $('[data-recuperar-mensagem]');
    var link = $('[data-recuperar-link]');
    if (!campo || !link) return;
    campo.oninput = function () { atualizarLinkWhats(); };
    $('[data-recuperar-padrao]').onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      campo.value = mensagemRecuperacao(p);
      atualizarLinkWhats();
      campo.focus();
    };
    // Abrir o link não envia nada: só registra, neste navegador, que o dono chamou o cliente.
    link.onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      marcarChamado(p.id);
      mostrarChamado(p.id);
      renderizarLista();
    };
  }

  function pedidoSelecionado() {
    return estado && estado.pedidos.filter(function (x) { return x.id === estado.selecionado; })[0];
  }

  function atualizarLinkWhats() {
    var p = pedidoSelecionado();
    var link = $('[data-recuperar-link]');
    if (!p || !link) return;
    link.href = linkWhatsapp(p.whatsapp) + '?text=' + encodeURIComponent($('[data-recuperar-mensagem]').value);
  }

  function mostrarChamado(id) {
    var quando = lerChamados()[id];
    $('[data-recuperar-chamado]').textContent = quando ? 'Você abriu o WhatsApp para este cliente em ' + data(quando) + '.' : '';
  }

  function renderizarRecuperacao() {
    var caixa = $('[data-recuperar]');
    if (!caixa) return;
    var p = pedidoSelecionado();
    var ativo = !!p && abandonado(p);
    if (!ativo) { caixa.hidden = true; caixa.removeAttribute('data-pedido'); return; }
    var mesmo = caixa.getAttribute('data-pedido') === p.id && !caixa.hidden;
    caixa.hidden = false;
    caixa.setAttribute('data-pedido', p.id);
    $('[data-recuperar-texto]').textContent = 'Pagamento pendente há ' + tempoParado(p.criado_em) +
      '. O cliente pode ter desistido ou tido algum problema no checkout; uma mensagem educada costuma ajudar.';
    var temWhats = String(p.whatsapp || '').replace(/\D/g, '').length >= 10;
    $('[data-recuperar-whats]').hidden = !temWhats;
    $('[data-recuperar-sem]').hidden = temWhats;
    // Preserva o texto que o dono está editando quando a lista recarrega.
    if (temWhats && !mesmo) $('[data-recuperar-mensagem]').value = mensagemRecuperacao(p);
    if (temWhats) atualizarLinkWhats();
    mostrarChamado(p.id);
  }

  var timerRecarga = null;
  function agendar() { clearTimeout(timerRecarga); timerRecarga = setTimeout(carregar, 300); }

  function carregar() {
    if (!estado) return Promise.resolve();
    var briefings = estado.sb.from('briefings').select('id, pedido_id, status').then(function (r) {
      var mapa = {};
      var ids = {};
      ((r && r.data) || []).forEach(function (b) { mapa[b.pedido_id] = b.status; ids[b.pedido_id] = b.id; });
      estado.briefingIds = ids;
      return mapa;
    }, function () { return {}; });
    function lerPedidos() {
      return estado.sb.from('pedidos').select(colunas).order('criado_em', { ascending: false }).limit(500).then(function (r) {
        if (r.error && colunas !== COLUNAS && /origem/.test(r.error.message || '')) { colunas = COLUNAS; return lerPedidos(); }
        return r;
      });
    }
    return Promise.all([lerPedidos(), briefings])
      .then(function (res) {
        var r = res[0];
        if (r.error) throw r.error;
        if (!estado) return;
        estado.briefings = res[1];
        var novos = r.data || [];
        avisarAprovados(novos);
        estado.pedidos = novos;
        document.dispatchEvent(new CustomEvent('pbr:admin-dados', { detail: { tipo: 'pedidos', itens: novos, limiteAtingido: novos.length >= 500 } }));
        renderizarLista();
        if (estado.selecionado) renderizarDetalhe(false);
      })
      .catch(function () {
        $('[data-resumo-pedidos]').textContent = 'Não foi possível carregar os pedidos.';
      });
  }

  // Som e título piscando quando um pedido passa a "aprovado" (não na primeira carga).
  function avisarAprovados(novos) {
    var aprovadosAgora = {};
    novos.forEach(function (p) { if (p.status === 'aprovado') aprovadosAgora[p.id] = true; });
    if (estado.conhecidos) {
      var recemPagos = novos.filter(function (p) { return aprovadosAgora[p.id] && !estado.conhecidos[p.id]; });
      if (recemPagos.length) {
        if (estado.avisos.tocarSom) estado.avisos.tocarSom();
        if (estado.avisos.atento && !estado.avisos.atento() && estado.avisos.piscarTitulo) estado.avisos.piscarTitulo();
        if (estado.avisos.notificar) {
          var p0 = recemPagos[0];
          estado.avisos.notificar({
            titulo: recemPagos.length === 1 ? 'Pedido pago!' : recemPagos.length + ' pedidos pagos!',
            corpo: recemPagos.length === 1 ? p0.codigo + ' · ' + (p0.plano_nome || 'plano') + ' · ' + fReal.format(p0.valor_centavos / 100) : 'Veja os pedidos aprovados no painel.',
            aba: 'pedidos',
            tag: 'pbr-pedido-' + p0.id
          });
        }
      }
    }
    estado.conhecidos = aprovadosAgora;
    contarPagosNaoVistos();
  }

  // Contador do título/favicon: pedidos pagos depois da última visita à aba Pedidos.
  function contarPagosNaoVistos() {
    if (!estado || !window.PBRAvisos) return;
    window.PBRAvisos.contarNovos('pedidos',
      estado.pedidos.filter(function (p) { return p.status === 'aprovado'; }),
      function (p) { return p.pago_em || p.atualizado_em; });
  }

  function canalDe(p) { return window.PBRExportar ? window.PBRExportar.canal(p.origem) : 'direto'; }

  // Período e origem (sem o status): base dos contadores dos botões e do resumo.
  function noRecorte(p) {
    var X = window.PBRExportar;
    if (X && !X.noPeriodo(p.criado_em, estado.periodo)) return false;
    if (estado.origem && canalDe(p) !== estado.origem) return false;
    return true;
  }

  function filtrados() {
    return estado.pedidos.filter(function (p) {
      if (!noRecorte(p)) return false;
      if (estado.filtro === 'abandonado') { if (!abandonado(p)) return false; }
      else if (estado.filtro !== 'todos' && p.status !== estado.filtro) return false;
      if (!estado.busca) return true;
      return [p.codigo, p.nome, p.email].some(function (c) { return normalizar(c).indexOf(estado.busca) !== -1; });
    });
  }

  function renderizarLista() {
    var lista = $('[data-lista-pedidos]');
    var itens = filtrados();
    lista.textContent = '';
    $('[data-pedidos-vazio]').hidden = itens.length > 0;

    if (window.PBRExportar) window.PBRExportar.preencherOrigens($('[data-origem-pedidos]'), estado.pedidos.map(canalDe));
    var recorte = estado.pedidos.filter(noRecorte);
    var recortado = recorte.length !== estado.pedidos.length;
    var contagem = { todos: recorte.length };
    var agora = Date.now();
    estado.chaveAbandono = chaveAbandono();
    recorte.forEach(function (p) {
      contagem[p.status] = (contagem[p.status] || 0) + 1;
      if (abandonado(p, agora)) contagem.abandonado = (contagem.abandonado || 0) + 1;
    });
    var chamados = lerChamados();
    $$('[data-filtro-pedido]').forEach(function (b) {
      var f = b.getAttribute('data-filtro-pedido');
      var base = f === 'todos' ? 'Todos' : f === 'abandonado' ? 'Abandonados' : ROTULOS[f] + 's';
      b.textContent = base + ' (' + (contagem[f] || 0) + ')';
    });
    var aprovados = recorte.filter(function (p) { return p.status === 'aprovado'; });
    var total = aprovados.reduce(function (s, p) { return s + p.valor_centavos; }, 0);
    $('[data-resumo-pedidos]').textContent = (aprovados.length
      ? aprovados.length + (aprovados.length === 1 ? ' pedido aprovado' : ' pedidos aprovados') + ' · ' + fReal.format(total / 100)
      : (recortado ? 'Nenhum pedido aprovado neste período/origem.' : 'Nenhum pedido aprovado ainda.')) +
      (recortado ? ' (de ' + estado.pedidos.length + ' pedidos no total)' : '');
    var botaoExportar = $('[data-exportar-pedidos]');
    if (botaoExportar) {
      botaoExportar.textContent = 'Exportar CSV (' + itens.length + ')';
      botaoExportar.disabled = !itens.length;
    }

    // O selo da aba conta todos os pendentes, sem o recorte.
    var pendentes = estado.pedidos.filter(function (p) { return p.status === 'pendente'; }).length;
    var selo = $('[data-selo-aba="pedidos"]');
    if (selo) { selo.hidden = !pendentes; selo.textContent = pendentes ? String(pendentes) : ''; selo.title = pendentes + ' pendente(s)'; }

    itens.forEach(function (p) {
      var li = el('li');
      var b = el('button', 'admin-item', null, { type: 'button', 'data-id': p.id });
      if (p.id === estado.selecionado) b.setAttribute('aria-current', 'true');
      var l1 = el('span', 'admin-item__linha');
      l1.appendChild(el('span', 'admin-item__nome', p.codigo + ' · ' + p.nome));
      l1.appendChild(el('time', 'admin-item__hora', data(p.criado_em), { datetime: p.criado_em }));
      var l2 = el('span', 'admin-item__linha');
      l2.appendChild(el('span', 'admin-item__previa', p.plano_nome + ' · ' + fReal.format(p.valor_centavos / 100)));
      l2.appendChild(el('span', 'admin-status admin-status--' + p.status, ROTULOS[p.status] || p.status));
      if (abandonado(p, agora)) {
        l2.appendChild(el('span', 'admin-item__tag admin-item__tag--alerta', chamados[p.id] ? 'abandonado · chamado' : 'abandonado · ' + tempoParado(p.criado_em)));
      }
      if (p.status === 'aprovado') {
        var temBriefing = !!estado.briefings[p.id];
        l2.appendChild(el('span', 'admin-item__tag' + (temBriefing ? ' admin-item__tag--ok' : ''), temBriefing ? 'briefing ✓' : 'sem briefing'));
      }
      b.appendChild(l1);
      b.appendChild(l2);
      b.onclick = function () { abrir(p.id); };
      li.appendChild(b);
      lista.appendChild(li);
    });
  }

  // CSV dos pedidos que estão na lista (status + período + origem + busca), montado no navegador.
  function exportar() {
    var X = window.PBRExportar;
    if (!estado || !X) return;
    var itens = filtrados();
    if (!itens.length) return;
    var reais = function (c) { return (c / 100).toFixed(2).replace('.', ','); };
    var colunas = [
      { titulo: 'Código', valor: function (p) { return p.codigo; } },
      { titulo: 'Criado em', valor: function (p) { return data(p.criado_em); } },
      { titulo: 'Status', valor: function (p) { return ROTULOS[p.status] || p.status; } },
      { titulo: 'Plano', valor: function (p) { return p.plano_nome; } },
      { titulo: 'Valor (R$)', valor: function (p) { return reais(p.valor_centavos); } },
      { titulo: 'Cliente', valor: function (p) { return p.nome; } },
      { titulo: 'E-mail', valor: function (p) { return p.email; } },
      { titulo: 'WhatsApp', valor: function (p) { return whatsappFormatado(p.whatsapp); } },
      { titulo: 'Canal de origem', valor: function (p) { return X.rotuloCanal(canalDe(p)); } },
      { titulo: 'Origem (detalhe)', valor: function (p) { return p.origem || ''; } },
      { titulo: 'Pago em', valor: function (p) { return p.pago_em ? data(p.pago_em) : ''; } },
      { titulo: 'Briefing', valor: function (p) { return estado.briefings[p.id] ? 'recebido' : (p.status === 'aprovado' ? 'não enviado' : ''); } }
    ];
    X.baixar('pedidos-portfolio-br-' + X.hoje() + '.csv', X.csv(colunas, itens));
    var aviso = $('[data-exportado-pedidos]');
    if (aviso) aviso.textContent = itens.length + (itens.length === 1 ? ' pedido exportado.' : ' pedidos exportados.');
  }

  function abrir(id) {
    estado.selecionado = id;
    $('.admin-pedidos').classList.add('mostrando-conversa');
    renderizarLista();
    renderizarDetalhe(true);
  }

  function renderizarDetalhe(focar) {
    var p = estado.pedidos.filter(function (x) { return x.id === estado.selecionado; })[0];
    $('[data-pedido-vazio]').hidden = !!p;
    $('[data-pedido-detalhe]').hidden = !p;
    if (!p) return;

    $('[data-pedido-titulo]').textContent = p.codigo + ' · ' + p.nome;
    $('[data-pedido-subtitulo]').textContent = 'Plano ' + p.plano_nome + ' · ' + fReal.format(p.valor_centavos / 100) + ' · criado em ' + data(p.criado_em);
    var st = $('[data-pedido-status]');
    st.className = 'admin-status admin-status--' + p.status;
    st.textContent = ROTULOS[p.status] || p.status;

    var dl = $('[data-pedido-dados]');
    dl.textContent = '';
    function linha(rotulo, valor, link) {
      dl.appendChild(el('dt', null, rotulo));
      var dd = el('dd');
      if (link && valor) {
        var a = el('a', null, valor, { href: link });
        if (/^https:/.test(link)) { a.target = '_blank'; a.rel = 'noopener'; }
        dd.appendChild(a);
      } else {
        dd.textContent = valor || '—';
      }
      dl.appendChild(dd);
    }
    renderizarRecuperacao();
    renderizarEtapa(p);
    linha('Cliente', p.nome);
    linha('E-mail', p.email, 'mailto:' + p.email);
    linha('WhatsApp', whatsappFormatado(p.whatsapp), linkWhatsapp(p.whatsapp));
    if ('origem' in p) linha('Origem', p.origem || 'Direto (sem campanha nem site de referência)');
    linha('Plano', p.plano_nome + ' (' + p.plano_id + ')');
    linha('Valor', fReal.format(p.valor_centavos / 100));
    linha('Status', (ROTULOS[p.status] || p.status) + (p.mp_status_detalhe ? ' — ' + p.mp_status_detalhe : ''));
    linha('Pago em', data(p.pago_em));
    linha('Aceite dos termos', data(p.aceite_termos_em));
    linha('Briefing', estado.briefings[p.id] ? 'Recebido (' + ({ novo: 'novo', em_producao: 'em produção', em_revisao: 'em revisão', entregue: 'entregue' }[estado.briefings[p.id]] || estado.briefings[p.id]) + ')' : (p.status === 'aprovado' ? 'Ainda não enviado' : '—'));
    linha('Pagamento MP', p.mp_payment_id);
    linha('Preferência MP', p.mp_preference_id);
    linha('Atualizado em', data(p.atualizado_em));

    var id = p.id;
    estado.sb.from('pedidos_eventos')
      .select('mp_payment_id, mp_status, mp_status_detalhe, valor_centavos, moeda, resultado, recebido_em')
      .eq('pedido_id', id).order('recebido_em', { ascending: true })
      .then(function (r) {
        if (!estado || estado.selecionado !== id) return;
        var ol = $('[data-pedido-eventos]');
        ol.textContent = '';
        var eventos = (r && r.data) || [];
        $('[data-pedido-sem-eventos]').hidden = eventos.length > 0;
        eventos.forEach(function (ev) {
          var texto = data(ev.recebido_em) + ' · pagamento ' + ev.mp_payment_id + ' · ' + ev.mp_status +
            (ev.mp_status_detalhe ? ' (' + ev.mp_status_detalhe + ')' : '') +
            (ev.valor_centavos != null ? ' · ' + fReal.format(ev.valor_centavos / 100) + ' ' + (ev.moeda || '') : '') +
            ' → ' + ev.resultado.replace(/_/g, ' ');
          ol.appendChild(el('li', 'admin-eventos__item' + (ev.resultado === 'valor_divergente' ? ' admin-eventos__item--alerta' : ''), texto));
        });
      });

    if (focar) $('[data-pedido-titulo]').focus();
  }

  // Etapa que o cliente vê em pedido.html (melhoria 30). Segue o status do briefing, que o dono muda aqui
  // ou na aba Briefings; sem briefing, a etapa é "pagamento confirmado" (ou o status do pagamento).
  var ETAPA_CLIENTE = {
    novo: 'Briefing recebido (o cliente ainda pode editar)',
    em_producao: 'Em produção',
    em_revisao: 'Em produção: ajustes finais',
    entregue: 'Site entregue'
  };
  function renderizarEtapa(p) {
    var caixa = $('[data-pedido-etapa]');
    if (!caixa) return;
    var erro = $('[data-pedido-etapa-erro]');
    erro.hidden = true;
    caixa.hidden = p.status !== 'aprovado';
    if (caixa.hidden) return;
    var st = estado.briefings[p.id];
    var temBriefing = !!(st && estado.briefingIds && estado.briefingIds[p.id]);
    $('[data-pedido-etapa-texto]').textContent = temBriefing
      ? 'Agora: ' + (ETAPA_CLIENTE[st] || st) + '.'
      : 'Agora: Pagamento confirmado, aguardando o briefing. A etapa pode ser mudada depois que o cliente enviar o briefing.';
    $('[data-pedido-etapa-controle]').hidden = !temBriefing;
    var sel = $('[data-pedido-etapa-select]');
    if (!temBriefing) return;
    sel.value = st;
    sel.onchange = function () {
      var novo = sel.value;
      var id = p.id;
      sel.disabled = true;
      erro.hidden = true;
      estado.sb.from('briefings').update({ status: novo }).eq('id', estado.briefingIds[id]).select('id, status')
        .then(function (r) {
          if (!estado) return;
          if (r.error || !r.data || !r.data.length) throw r.error || new Error('sem permissão');
          estado.briefings[id] = novo;
          renderizarLista();
          if (estado.selecionado === id) renderizarDetalhe(false);
          var aviso = $('[data-pedido-etapa-ok]');
          if (aviso) aviso.textContent = 'Etapa atualizada: ' + (ETAPA_CLIENTE[novo] || novo) + '.';
        })
        .catch(function () {
          if (!estado) return;
          sel.value = estado.briefings[id];
          erro.textContent = 'Não foi possível mudar a etapa. Tente de novo.';
          erro.hidden = false;
        })
        .then(function () { sel.disabled = false; });
    };
  }

  function encerrar() {
    if (!estado) return;
    if (estado.canal) estado.sb.removeChannel(estado.canal);
    clearInterval(estado.timer);
    clearInterval(estado.relogio);
    estado = null;
    var lista = $('[data-lista-pedidos]');
    if (lista) lista.textContent = '';
    var det = $('[data-pedido-detalhe]');
    if (det) det.hidden = true;
  }

  // Abre um pedido pelo id (usado pela aba Briefings).
  function abrirPorId(id) {
    if (!estado) return;
    estado.filtro = 'todos';
    estado.busca = '';
    estado.periodo = 'tudo';
    estado.origem = '';
    var selP = $('[data-periodo-pedidos]');
    if (selP) selP.value = 'tudo';
    var selO = $('[data-origem-pedidos]');
    if (selO) selO.value = '';
    var busca = $('[data-busca-pedidos]');
    if (busca) busca.value = '';
    $$('[data-filtro-pedido]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filtro-pedido') === 'todos')); });
    // Recarrega antes de abrir: o status do briefing pode ter acabado de mudar.
    carregar().then(function () { if (estado) abrir(id); });
  }

  window.PBRAdminPedidos = { iniciar: iniciar, encerrar: encerrar, abrirPorId: abrirPorId };
})();
