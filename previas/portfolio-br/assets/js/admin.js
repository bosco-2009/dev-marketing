/*
 * admin.js — painel do dono: login (Supabase Auth, e-mail e senha) e chat em tempo real.
 *
 * Acesso: só usuários cadastrados em public.admins (conferido por eh_admin() e pelo RLS).
 * Tempo real: postgres_changes em mensagens (INSERT) e conversas (*), filtrados pelo RLS.
 * Todo texto vindo do banco é inserido com textContent.
 */
(function () {
  'use strict';

  var LIMITE_MENSAGENS = 500;
  var CHAVE_SOM = 'pbr_admin_som';
  var TITULO_ORIGINAL = document.title;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function oculto(texto) { return el('span', 'visualmente-oculto', texto); }

  function mostrarTela(nome) {
    $$('[data-tela]').forEach(function (t) { t.hidden = t.getAttribute('data-tela') !== nome; });
    $$('[data-acoes-sessao]').forEach(function (a) { a.hidden = nome !== 'painel'; });
  }

  // ------------------------------------------------------------------ datas
  var fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  var fDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
  var fCompleto = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  function curto(iso) {
    var d = new Date(iso);
    return (d.toDateString() === new Date().toDateString() ? fHora : fDia).format(d);
  }

  function formatarWhatsapp(d) {
    var m = /^(?:55)?(\d{2})(\d{4,5})(\d{4})$/.exec(d || '');
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : d;
  }
  function linkWhatsapp(d) {
    var n = String(d || '').replace(/\D/g, '');
    if (n.length <= 11) n = '55' + n;
    return 'https://wa.me/' + n;
  }

  // ------------------------------------------------------------------ início
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  function iniciar() {
    if (!window.PBRSupabase || !window.PBRSupabase.configurado()) { mostrarTela('sem-config'); return; }

    window.PBRSupabase.cliente({ auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
      .then(configurarPainel)
      .catch(function () {
        mostrarTela('login');
        mostrarErro($('[data-erro-login]'), 'Não foi possível carregar o painel. Verifique sua conexão e recarregue a página.');
      });
  }

  function mostrarErro(alvo, texto) {
    if (!alvo) return;
    alvo.textContent = texto || '';
    alvo.hidden = !texto;
  }

  function configurarPainel(sb) {
    var estado = {
      conversas: [],
      filtro: 'aberta',
      selecionada: null,
      idsMensagens: {},
      canal: null,
      chatIniciado: false,
      usuario: undefined
    };

    // -------------------------------------------------------------- sessão
    sb.auth.onAuthStateChange(function (evento, sessao) {
      // Não chamar o Supabase dentro deste callback (recomendação da biblioteca).
      setTimeout(function () { tratarSessao(sessao); }, 0);
    });

    function tratarSessao(sessao) {
      var usuario = sessao && sessao.user ? sessao.user.id : null;
      // Ignora eventos que não mudam o usuário (ex.: TOKEN_REFRESHED).
      if (estado.usuario !== undefined && usuario === estado.usuario) return;
      estado.usuario = usuario;

      if (!usuario) { encerrarChat(); encerrarPedidos(); mostrarTela('login'); return; }

      sb.rpc('eh_admin').then(function (r) {
        if (r.error) throw r.error;
        if (r.data !== true) { encerrarChat(); encerrarPedidos(); mostrarTela('negado'); return; }
        mostrarTela('painel');
        iniciarChat();
        var avisos = { tocarSom: tocarSom, piscarTitulo: piscarTitulo, atento: atento };
        if (window.PBRAdminPedidos) window.PBRAdminPedidos.iniciar(sb, avisos);
        if (window.PBRAdminBriefings) window.PBRAdminBriefings.iniciar(sb, avisos);
      }).catch(function () {
        mostrarTela('login');
        mostrarErro($('[data-erro-login]'), 'Não foi possível confirmar seu acesso. Tente de novo.');
      });
    }

    function encerrarPedidos() {
      if (window.PBRAdminPedidos) window.PBRAdminPedidos.encerrar();
      if (window.PBRAdminBriefings) window.PBRAdminBriefings.encerrar();
    }

    // -------------------------------------------------------------- abas (#conversas / #pedidos)
    function mostrarAba() {
      var aba = ({ '#pedidos': 'pedidos', '#briefings': 'briefings' })[location.hash] || 'conversas';
      $$('[data-aba]').forEach(function (s) { s.hidden = s.getAttribute('data-aba') !== aba; });
      $$('[data-aba-link]').forEach(function (l) {
        if (l.getAttribute('data-aba-link') === aba) l.setAttribute('aria-current', 'page');
        else l.removeAttribute('aria-current');
      });
    }
    window.addEventListener('hashchange', mostrarAba);
    mostrarAba();

    $('[data-form-login]').addEventListener('submit', function (e) {
      e.preventDefault();
      prepararSom(); // gesto do usuário libera o áudio
      var form = e.currentTarget;
      var erro = $('[data-erro-login]');
      var email = form.email.value.trim();
      var senha = form.senha.value;
      if (!email || !senha) { mostrarErro(erro, 'Informe e-mail e senha.'); return; }
      var botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      mostrarErro(erro, '');
      sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
        if (r.error) {
          var msg = /invalid login credentials/i.test(r.error.message) ? 'E-mail ou senha incorretos.'
            : /rate limit|too many/i.test(r.error.message) ? 'Muitas tentativas. Aguarde alguns minutos.'
            : 'Não foi possível entrar. Tente de novo.';
          mostrarErro(erro, msg);
          form.senha.focus();
        } else {
          form.senha.value = '';
        }
      }).catch(function () {
        mostrarErro(erro, 'Sem conexão com o servidor. Tente de novo.');
      }).then(function () { botao.disabled = false; });
    });

    $$('[data-sair]').forEach(function (b) {
      b.addEventListener('click', function () { sb.auth.signOut(); });
    });

    // -------------------------------------------------------------- som e título
    var audio = null;
    var somLigado = true;
    try { somLigado = window.localStorage.getItem(CHAVE_SOM) !== 'off'; } catch (e) { /* ignora */ }
    var botaoSom = $('[data-botao-som]');
    function atualizarBotaoSom() {
      botaoSom.setAttribute('aria-pressed', String(somLigado));
      botaoSom.querySelector('use').setAttribute('href', somLigado ? '#i-som' : '#i-mudo');
      botaoSom.title = somLigado ? 'Som ligado' : 'Som desligado';
    }
    atualizarBotaoSom();
    botaoSom.addEventListener('click', function () {
      somLigado = !somLigado;
      try { window.localStorage.setItem(CHAVE_SOM, somLigado ? 'on' : 'off'); } catch (e) { /* ignora */ }
      atualizarBotaoSom();
      if (somLigado) { prepararSom(); tocarSom(); }
    });

    function prepararSom() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audio) audio = new Ctx();
      if (audio.state === 'suspended') audio.resume();
    }
    document.addEventListener('pointerdown', prepararSom, { once: true });
    document.addEventListener('keydown', prepararSom, { once: true });

    function tocarSom() {
      if (!somLigado || !audio || audio.state !== 'running') return;
      var t = audio.currentTime;
      [880, 1175].forEach(function (freq, i) {
        var o = audio.createOscillator();
        var g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
        o.connect(g).connect(audio.destination);
        o.start(t + i * 0.16);
        o.stop(t + i * 0.16 + 0.16);
      });
    }

    var novasNoTitulo = 0;
    var timerTitulo = null;
    function piscarTitulo() {
      novasNoTitulo += 1;
      if (timerTitulo) return;
      var alterna = false;
      timerTitulo = setInterval(function () {
        alterna = !alterna;
        document.title = alterna
          ? '(' + novasNoTitulo + ') ' + (novasNoTitulo === 1 ? 'Nova mensagem!' : 'Novas mensagens!')
          : TITULO_ORIGINAL;
      }, 1000);
    }
    function pararTitulo() {
      clearInterval(timerTitulo);
      timerTitulo = null;
      novasNoTitulo = 0;
      document.title = TITULO_ORIGINAL;
    }
    function atento() { return !document.hidden && document.hasFocus(); }
    window.addEventListener('focus', function () {
      pararTitulo();
      if (estado.selecionada) marcarLida(estado.selecionada);
    });
    document.addEventListener('visibilitychange', function () { if (atento()) pararTitulo(); });

    // -------------------------------------------------------------- chat
    var lista = $('[data-lista-conversas]');
    var listaVazia = $('[data-lista-vazia]');
    var secaoChat = $('.admin-chat');
    var conteudo = $('[data-conversa-conteudo]');
    var conversaVazia = $('[data-conversa-vazia]');
    var caixaMensagens = $('[data-mensagens]');
    var formResposta = $('[data-form-resposta]');
    var textoResposta = $('[data-resposta-texto]');
    var botaoResposta = $('[data-resposta-enviar]');
    var erroResposta = $('[data-erro-resposta]');
    var botaoStatus = $('[data-alternar-status]');
    var indicador = $('[data-conexao]');

    function iniciarChat() {
      if (estado.chatIniciado) return;
      estado.chatIniciado = true;
      carregarConversas();
      ligarRealtime();
    }

    function encerrarChat() {
      if (estado.canal) sb.removeChannel(estado.canal);
      estado.canal = null;
      pararReserva();
      estado.chatIniciado = false;
      estado.conversas = [];
      estado.selecionada = null;
      lista.textContent = '';
      caixaMensagens.textContent = '';
      conteudo.hidden = true;
      conversaVazia.hidden = false;
      secaoChat.classList.remove('mostrando-conversa');
      pararTitulo();
    }

    function ligarRealtime() {
      indicador.textContent = 'Conectando…';
      indicador.setAttribute('data-estado', 'conectando');
      estado.canal = sb.channel('painel-admin')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, function (p) { aoNovaMensagem(p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, function () { agendarRecarga(); })
        .subscribe(function (status) {
          var ok = status === 'SUBSCRIBED';
          indicador.textContent = ok ? 'Tempo real ativo' : 'Reconectando… (atualizando a cada 15 s)';
          indicador.setAttribute('data-estado', ok ? 'ok' : 'erro');
          if (ok) {
            pararReserva();
            // Recupera o que chegou enquanto estava desconectado.
            carregarConversas();
            if (estado.selecionada) carregarMensagens(estado.selecionada);
          } else {
            iniciarReserva();
          }
        });
    }

    // Reserva: sem tempo real, busca conversas e mensagens a cada 15 s.
    var timerReserva = null;
    function iniciarReserva() {
      if (timerReserva) return;
      timerReserva = setInterval(function () {
        if (!estado.chatIniciado) return;
        var antes = totalNaoLidas();
        carregarConversas().then(function () {
          if (totalNaoLidas() > antes) { tocarSom(); if (!atento()) piscarTitulo(); }
        });
        if (estado.selecionada) carregarMensagens(estado.selecionada).then(function () { marcarLida(estado.selecionada); });
      }, 15000);
    }
    function pararReserva() { clearInterval(timerReserva); timerReserva = null; }
    function totalNaoLidas() {
      return estado.conversas.reduce(function (s, c) { return s + (c.nao_lidas_admin || 0); }, 0);
    }

    var timerRecarga = null;
    function agendarRecarga() {
      clearTimeout(timerRecarga);
      timerRecarga = setTimeout(carregarConversas, 300);
    }

    function carregarConversas() {
      return sb.from('conversas')
        .select('id, nome, whatsapp, pagina_origem, status, nao_lidas_admin, criado_em, atualizado_em, mensagens(texto, autor, criado_em)')
        .order('atualizado_em', { ascending: false })
        .order('criado_em', { referencedTable: 'mensagens', ascending: false })
        .limit(1, { referencedTable: 'mensagens' })
        .limit(300)
        .then(function (r) {
          if (r.error) throw r.error;
          estado.conversas = (r.data || []).filter(function (c) { return c.mensagens && c.mensagens.length; });
          renderizarLista();
          atualizarCabecalho();
        })
        .catch(function () {
          indicador.textContent = 'Erro ao carregar conversas';
          indicador.setAttribute('data-estado', 'erro');
        });
    }

    function nomeDe(c) { return c.nome || 'Visitante ' + c.id.slice(0, 4).toUpperCase(); }
    function conversaPorId(id) { return estado.conversas.filter(function (c) { return c.id === id; })[0]; }

    function renderizarLista() {
      var visiveis = estado.conversas.filter(function (c) { return estado.filtro === 'todas' || c.status === estado.filtro; });
      lista.textContent = '';
      listaVazia.hidden = visiveis.length > 0;

      visiveis.forEach(function (c) {
        var li = el('li');
        var b = el('button', 'admin-item' + (c.nao_lidas_admin ? ' admin-item--nova' : ''), null, { type: 'button', 'data-id': c.id });
        if (c.id === estado.selecionada) b.setAttribute('aria-current', 'true');

        var linha1 = el('span', 'admin-item__linha');
        linha1.appendChild(el('span', 'admin-item__nome', nomeDe(c)));
        var ultima = c.mensagens[0];
        linha1.appendChild(el('time', 'admin-item__hora', curto(ultima.criado_em), { datetime: ultima.criado_em }));
        b.appendChild(linha1);

        var linha2 = el('span', 'admin-item__linha');
        var previa = el('span', 'admin-item__previa', (ultima.autor === 'admin' ? 'Você: ' : '') + ultima.texto);
        linha2.appendChild(previa);
        if (c.nao_lidas_admin) {
          var selo = el('span', 'admin-item__selo', String(c.nao_lidas_admin), { 'aria-hidden': 'true' });
          linha2.appendChild(selo);
          b.appendChild(oculto(c.nao_lidas_admin === 1 ? ', 1 mensagem não lida' : ', ' + c.nao_lidas_admin + ' mensagens não lidas'));
        }
        if (c.status === 'fechada' && estado.filtro === 'todas') linha2.appendChild(el('span', 'admin-item__tag', 'fechada'));
        b.appendChild(linha2);

        b.addEventListener('click', function () { abrirConversa(c.id); });
        li.appendChild(b);
        lista.appendChild(li);
      });

      var n = totalNaoLidas();
      $$('[data-filtro="aberta"]').forEach(function (f) {
        f.textContent = 'Abertas' + (n ? ' (' + n + ')' : '');
      });
    }

    $$('[data-filtro]').forEach(function (b) {
      b.addEventListener('click', function () {
        estado.filtro = b.getAttribute('data-filtro');
        $$('[data-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderizarLista();
      });
    });

    function atualizarCabecalho() {
      var c = conversaPorId(estado.selecionada);
      if (!c) return;
      $('[data-conversa-nome]').textContent = nomeDe(c);
      var detalhes = [];
      if (c.whatsapp) detalhes.push('WhatsApp ' + formatarWhatsapp(c.whatsapp));
      detalhes.push('desde ' + fCompleto.format(new Date(c.criado_em)));
      if (c.pagina_origem) detalhes.push('veio de ' + c.pagina_origem);
      $('[data-conversa-detalhes]').textContent = detalhes.join(' · ');
      var zap = $('[data-conversa-whatsapp]');
      zap.hidden = !c.whatsapp;
      if (c.whatsapp) zap.href = linkWhatsapp(c.whatsapp);
      botaoStatus.textContent = c.status === 'aberta' ? 'Fechar conversa' : 'Reabrir conversa';
      botaoStatus.setAttribute('data-status', c.status);
    }

    function abrirConversa(id) {
      estado.selecionada = id;
      estado.idsMensagens = {};
      caixaMensagens.textContent = '';
      conteudo.hidden = false;
      conversaVazia.hidden = true;
      secaoChat.classList.add('mostrando-conversa');
      mostrarErro(erroResposta, '');
      atualizarCabecalho();
      renderizarLista();
      $('[data-conversa-nome]').focus();
      carregarMensagens(id).then(function () { marcarLida(id); });
    }

    $('[data-voltar]').addEventListener('click', function () {
      var id = estado.selecionada;
      secaoChat.classList.remove('mostrando-conversa');
      var item = id && lista.querySelector('[data-id="' + id + '"]');
      if (item) item.focus();
    });

    function carregarMensagens(id) {
      return sb.from('mensagens')
        .select('id, conversa_id, autor, texto, criado_em')
        .eq('conversa_id', id)
        .order('criado_em', { ascending: false })
        .limit(LIMITE_MENSAGENS)
        .then(function (r) {
          if (r.error) throw r.error;
          if (estado.selecionada !== id) return;
          (r.data || []).reverse().forEach(adicionarMensagem);
          caixaMensagens.scrollTop = caixaMensagens.scrollHeight;
        })
        .catch(function () { mostrarErro(erroResposta, 'Não foi possível carregar as mensagens.'); });
    }

    function adicionarMensagem(m) {
      if (estado.idsMensagens[m.id]) return false;
      estado.idsMensagens[m.id] = true;
      var li = el('div', 'admin-msg admin-msg--' + (m.autor === 'admin' ? 'admin' : 'visitante'));
      li.appendChild(oculto(m.autor === 'admin' ? 'Você: ' : 'Visitante: '));
      li.appendChild(el('span', 'admin-msg__texto', m.texto));
      li.appendChild(el('time', 'admin-msg__hora', fCompleto.format(new Date(m.criado_em)), { datetime: m.criado_em }));
      // Mantém a ordem cronológica mesmo se uma mensagem chegar fora de ordem.
      var depois = null;
      $$('time', caixaMensagens).some(function (t) {
        if (t.getAttribute('datetime') > m.criado_em) { depois = t.parentNode; return true; }
        return false;
      });
      caixaMensagens.insertBefore(li, depois);
      return true;
    }

    function marcarLida(id) {
      var c = conversaPorId(id);
      if (!c || !c.nao_lidas_admin || !atento()) return;
      c.nao_lidas_admin = 0;
      renderizarLista();
      sb.from('conversas').update({ nao_lidas_admin: 0 }).eq('id', id).then(function () { /* realtime atualiza a lista */ });
    }

    var notificadas = {}; // evita notificar duas vezes a mesma mensagem
    function aoNovaMensagem(m) {
      if (!m || !m.id) return;
      if (m.conversa_id === estado.selecionada) {
        var perto = caixaMensagens.scrollHeight - caixaMensagens.scrollTop - caixaMensagens.clientHeight < 120;
        if (adicionarMensagem(m) && perto) caixaMensagens.scrollTop = caixaMensagens.scrollHeight;
      }
      if (m.autor === 'visitante' && !notificadas[m.id]) {
        notificadas[m.id] = true;
        var vendo = atento() && m.conversa_id === estado.selecionada && secaoChat.classList.contains('mostrando-conversa');
        if (!vendo) { tocarSom(); if (!atento()) piscarTitulo(); }
      }
      agendarRecarga();
    }

    // -------------------------------------------------------------- responder
    function enviarResposta() {
      var texto = textoResposta.value.trim();
      var id = estado.selecionada;
      if (!id) return;
      if (!texto) { mostrarErro(erroResposta, 'Escreva a resposta.'); textoResposta.focus(); return; }
      if (texto.length > 2000) { mostrarErro(erroResposta, 'Máximo de 2.000 caracteres.'); return; }
      botaoResposta.disabled = true;
      mostrarErro(erroResposta, '');
      sb.from('mensagens')
        .insert({ conversa_id: id, autor: 'admin', texto: texto })
        .select('id, conversa_id, autor, texto, criado_em')
        .single()
        .then(function (r) {
          if (r.error) throw r.error;
          textoResposta.value = '';
          if (estado.selecionada === id) {
            adicionarMensagem(r.data);
            caixaMensagens.scrollTop = caixaMensagens.scrollHeight;
          }
          agendarRecarga();
        })
        .catch(function () { mostrarErro(erroResposta, 'Não foi possível enviar. Tente de novo.'); })
        .then(function () { botaoResposta.disabled = false; textoResposta.focus(); });
    }

    formResposta.addEventListener('submit', function (e) { e.preventDefault(); enviarResposta(); });
    textoResposta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarResposta(); }
    });

    botaoStatus.addEventListener('click', function () {
      var c = conversaPorId(estado.selecionada);
      if (!c) return;
      var novo = c.status === 'aberta' ? 'fechada' : 'aberta';
      botaoStatus.disabled = true;
      sb.from('conversas').update({ status: novo }).eq('id', c.id).then(function (r) {
        if (r.error) throw r.error;
        c.status = novo;
        atualizarCabecalho();
        renderizarLista();
      }).catch(function () {
        mostrarErro(erroResposta, 'Não foi possível alterar o status.');
      }).then(function () { botaoStatus.disabled = false; });
    });
  }
})();
