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

  var ROTULOS = {
    pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado'
  };

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
    estado = { sb: sb, avisos: avisos || {}, pedidos: [], briefings: {}, filtro: 'todos', busca: '', selecionado: null, canal: null, conhecidos: null, timer: null };

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
    $('[data-pedido-voltar]').onclick = function () {
      secao.classList.remove('mostrando-conversa');
      var item = estado.selecionado && lista.querySelector('[data-id="' + estado.selecionado + '"]');
      if (item) item.focus();
    };

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

  var timerRecarga = null;
  function agendar() { clearTimeout(timerRecarga); timerRecarga = setTimeout(carregar, 300); }

  function carregar() {
    if (!estado) return Promise.resolve();
    var briefings = estado.sb.from('briefings').select('pedido_id, status').then(function (r) {
      var mapa = {};
      ((r && r.data) || []).forEach(function (b) { mapa[b.pedido_id] = b.status; });
      return mapa;
    }, function () { return {}; });
    return Promise.all([estado.sb.from('pedidos').select(COLUNAS).order('criado_em', { ascending: false }).limit(500), briefings])
      .then(function (res) {
        var r = res[0];
        if (r.error) throw r.error;
        if (!estado) return;
        estado.briefings = res[1];
        var novos = r.data || [];
        avisarAprovados(novos);
        estado.pedidos = novos;
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

  function filtrados() {
    return estado.pedidos.filter(function (p) {
      if (estado.filtro !== 'todos' && p.status !== estado.filtro) return false;
      if (!estado.busca) return true;
      return [p.codigo, p.nome, p.email].some(function (c) { return normalizar(c).indexOf(estado.busca) !== -1; });
    });
  }

  function renderizarLista() {
    var lista = $('[data-lista-pedidos]');
    var itens = filtrados();
    lista.textContent = '';
    $('[data-pedidos-vazio]').hidden = itens.length > 0;

    var contagem = { todos: estado.pedidos.length };
    estado.pedidos.forEach(function (p) { contagem[p.status] = (contagem[p.status] || 0) + 1; });
    $$('[data-filtro-pedido]').forEach(function (b) {
      var f = b.getAttribute('data-filtro-pedido');
      var base = f === 'todos' ? 'Todos' : ROTULOS[f] + 's';
      b.textContent = base + ' (' + (contagem[f] || 0) + ')';
    });
    var aprovados = estado.pedidos.filter(function (p) { return p.status === 'aprovado'; });
    var total = aprovados.reduce(function (s, p) { return s + p.valor_centavos; }, 0);
    $('[data-resumo-pedidos]').textContent = aprovados.length
      ? aprovados.length + (aprovados.length === 1 ? ' pedido aprovado' : ' pedidos aprovados') + ' · ' + fReal.format(total / 100)
      : 'Nenhum pedido aprovado ainda.';

    var pendentes = contagem.pendente || 0;
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
    linha('Cliente', p.nome);
    linha('E-mail', p.email, 'mailto:' + p.email);
    linha('WhatsApp', whatsappFormatado(p.whatsapp), linkWhatsapp(p.whatsapp));
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

  function encerrar() {
    if (!estado) return;
    if (estado.canal) estado.sb.removeChannel(estado.canal);
    clearInterval(estado.timer);
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
    var busca = $('[data-busca-pedidos]');
    if (busca) busca.value = '';
    $$('[data-filtro-pedido]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filtro-pedido') === 'todos')); });
    // Recarrega antes de abrir: o status do briefing pode ter acabado de mudar.
    carregar().then(function () { if (estado) abrir(id); });
  }

  window.PBRAdminPedidos = { iniciar: iniciar, encerrar: encerrar, abrirPorId: abrirPorId };
})();
