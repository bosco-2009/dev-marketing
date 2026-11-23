/*
 * chat.js — widget de chat ao vivo da Portfólio BR (todas as páginas públicas).
 *
 * Requisitos na página: config.js, supabase-client.js e o sprite de ícones (#i-conversa, #i-fechar,
 * #i-whatsapp, #i-seta). Basta incluir:
 *   <script src="config.js" defer></script>
 *   <script src="assets/js/supabase-client.js" defer></script>
 *   <script src="assets/js/chat.js" defer></script>
 *
 * Sem supabase.url/anonKey no config.js, o widget não aparece (sem erros).
 *
 * Segurança: o visitante tem um id e um token secreto aleatório guardados no localStorage.
 * Todas as operações passam pelas RPCs chat_iniciar / chat_listar / chat_enviar, que conferem o token.
 * Avisos em tempo real chegam por Broadcast num canal secreto; ao receber um aviso, o widget
 * rebusca as mensagens pela RPC (a fonte da verdade). Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  var CHAVE_ARMAZENAMENTO = 'pbr_chat_v1';
  var LIMITE_TEXTO = 2000;
  var INTERVALO_RESERVA_MS = 20000; // busca periódica só quando o tempo real não está conectado

  // =========================================================================
  // Funções puras (expostas em window.PBRChat para teste)
  // =========================================================================

  function minutosDoDia(hhmm) {
    var p = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return p ? Number(p[1]) * 60 + Number(p[2]) : null;
  }

  // Dia da semana (0 = domingo) e minutos do dia no fuso informado.
  function agoraNoFuso(data, fuso) {
    var partes = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso || 'America/Sao_Paulo',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(data).forEach(function (p) { partes[p.type] = p.value; });
    var dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dia: dias[partes.weekday], minutos: Number(partes.hour) * 60 + Number(partes.minute) };
  }

  function estaNoHorario(atendimento, data) {
    if (!atendimento || !Array.isArray(atendimento.horarios)) return false;
    var agora = agoraNoFuso(data || new Date(), atendimento.fusoHorario);
    return atendimento.horarios.some(function (h) {
      var ini = minutosDoDia(h.inicio);
      var fim = minutosDoDia(h.fim);
      return Array.isArray(h.dias) && h.dias.indexOf(agora.dia) !== -1 &&
        ini !== null && fim !== null && agora.minutos >= ini && agora.minutos < fim;
    });
  }

  function gerarToken() {
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function gerarUuid() {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function apenasDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  // Aceita 10–11 dígitos (DDD + número) ou 12–13 (com 55). Vazio é válido (campo opcional).
  function whatsappValido(t) {
    var d = apenasDigitos(t);
    return d === '' || /^\d{10,13}$/.test(d);
  }

  function mensagemDeErro(erro) {
    var m = (erro && (erro.message || erro.msg)) || '';
    if (m.indexOf('limite_mensagens') !== -1) return 'Você enviou muitas mensagens seguidas. Aguarde alguns minutos e tente de novo.';
    if (m.indexOf('limite_conversas') !== -1) return 'Muitas conversas sendo iniciadas agora. Tente de novo em alguns minutos.';
    if (m.indexOf('whatsapp_invalido') !== -1) return 'Confira o WhatsApp: use DDD + número, por exemplo (11) 91234-5678.';
    if (m.indexOf('texto_invalido') !== -1) return 'Escreva uma mensagem de até 2.000 caracteres.';
    return 'Não foi possível enviar agora. Verifique sua conexão e tente de novo.';
  }

  window.PBRChat = {
    estaNoHorario: estaNoHorario,
    whatsappValido: whatsappValido,
    mensagemDeErro: mensagemDeErro
  };

  // =========================================================================
  // Inicialização
  // =========================================================================
  var config = window.PBR_CONFIG;
  if (!config || !window.PBRSupabase || !window.PBRSupabase.configurado()) return; // chat oculto
  if (!window.crypto || !window.crypto.getRandomValues) return;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  function iniciar() {
    // ------------------------------------------------------------- estado
    var memoria = null; // usado se o localStorage estiver indisponível
    function lerEstado() {
      try {
        var bruto = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
        if (bruto) return JSON.parse(bruto);
      } catch (e) { /* modo privado ou bloqueado */ }
      return memoria;
    }
    function salvarEstado(e) {
      memoria = e;
      try { window.localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(e)); } catch (err) { /* ignora */ }
    }
    function identidadeValida(e) {
      return e && /^[0-9a-f-]{36}$/i.test(e.visitanteId || '') && /^[0-9a-f]{64}$/.test(e.token || '');
    }
    function novaIdentidade() {
      var e = { visitanteId: gerarUuid(), token: gerarToken(), iniciada: false, ultimaVista: null };
      salvarEstado(e);
      return e;
    }

    var estado = lerEstado();
    if (!identidadeValida(estado)) estado = novaIdentidade();

    var conversa = null;       // { conversa_id, canal, status }
    var mensagens = [];        // [{ id, autor, texto, criado_em }]
    var idsVistos = {};
    var supa = null;
    var canalRealtime = null;
    var realtimeConectado = false;
    var timerReserva = null;
    var aberto = false;
    var enviando = false;

    var whatsappDono = config.contato && config.contato.whatsapp;
    var atendimento = config.atendimento || {};

    // ------------------------------------------------------------- DOM
    var SVG_NS = 'http://www.w3.org/2000/svg';
    function icone(nome) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'icone');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#i-' + nome);
      svg.appendChild(use);
      return svg;
    }
    function el(tag, classe, texto, attrs) {
      var e = document.createElement(tag);
      if (classe) e.className = classe;
      if (texto != null) e.textContent = texto;
      if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    function oculto(texto) { return el('span', 'visualmente-oculto', texto); }

    var raiz = el('div', 'chat', null, { 'data-chat': '' });

    // Botão flutuante
    var botao = el('button', 'chat__lancador', null, {
      type: 'button', 'aria-expanded': 'false', 'aria-controls': 'chat-painel'
    });
    botao.appendChild(icone('conversa'));
    var rotuloBotao = oculto('Abrir chat');
    botao.appendChild(rotuloBotao);
    var selo = el('span', 'chat__selo', null, { 'aria-hidden': 'true' });
    selo.hidden = true;
    botao.appendChild(selo);

    // Painel
    var painel = el('section', 'chat__painel', null, {
      id: 'chat-painel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'chat-titulo'
    });
    painel.hidden = true;

    var cabecalho = el('div', 'chat__cabecalho');
    var avatar = el('img', 'chat__avatar', null, { src: caminhoRaiz() + 'assets/img/logo-icone.svg', alt: '', width: '40', height: '40' });
    var identificacao = el('div', 'chat__identificacao');
    identificacao.appendChild(el('h2', 'chat__titulo', 'Portfólio BR', { id: 'chat-titulo' }));
    var statusLinha = el('p', 'chat__status');
    var statusPonto = el('span', 'chat__ponto', null, { 'aria-hidden': 'true' });
    var statusTexto = el('span');
    statusLinha.appendChild(statusPonto);
    statusLinha.appendChild(statusTexto);
    identificacao.appendChild(statusLinha);
    var fechar = el('button', 'chat__fechar', null, { type: 'button' });
    fechar.appendChild(icone('fechar'));
    fechar.appendChild(oculto('Fechar chat'));
    cabecalho.appendChild(avatar);
    cabecalho.appendChild(identificacao);
    cabecalho.appendChild(fechar);

    // Aviso fora do horário
    var avisoHorario = el('div', 'chat__aviso');
    avisoHorario.hidden = true;

    // Corpo: histórico. Não é região viva (melhoria 36): o leitor de tela não relê o histórico ao abrir
    // nem as mensagens do próprio visitante; só as respostas novas do atendente vão para o anúncio abaixo.
    var log = el('div', 'chat__mensagens', null, { role: 'region', 'aria-label': 'Mensagens da conversa', tabindex: '0' });
    var boasVindas = el('p', 'chat__bolha chat__bolha--admin chat__bolha--boas-vindas');
    boasVindas.appendChild(oculto('Portfólio BR: '));
    boasVindas.appendChild(document.createTextNode('Olá! '));
    boasVindas.appendChild(el('span', null, '👋', { 'aria-hidden': 'true' }));
    boasVindas.appendChild(document.createTextNode(' Como podemos ajudar? Conte o que você precisa e respondemos por aqui.'));
    log.appendChild(boasVindas);
    var listaMensagens = el('ol', 'chat__lista', null, { role: 'list' });
    log.appendChild(listaMensagens);
    var avisoFechada = el('p', 'chat__nota', 'Esta conversa foi encerrada. Envie uma nova mensagem se precisar de algo.');
    avisoFechada.hidden = true;
    log.appendChild(avisoFechada);

    // Formulário inicial (nome e WhatsApp opcionais)
    var formInicio = el('form', 'chat__inicio', null, { novalidate: '' });
    var campoNome = campo('chat-nome', 'Seu nome (opcional)', 'input', {
      type: 'text', autocomplete: 'name', maxlength: '80', 'aria-describedby': 'chat-privacidade'
    });
    var campoZap = campo('chat-whatsapp', 'Seu WhatsApp (opcional)', 'input', {
      type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '(11) 91234-5678',
      'aria-describedby': 'chat-whatsapp-dica chat-privacidade'
    });
    var dicaZap = el('p', 'chat__dica', 'Se preferir, respondemos também por lá.', { id: 'chat-whatsapp-dica' });
    campoZap.grupo.appendChild(dicaZap);
    formInicio.appendChild(campoNome.grupo);
    formInicio.appendChild(campoZap.grupo);
    formInicio.appendChild(el('p', 'chat__privacidade',
      'Usamos esses dados só para responder você. Não enviamos propaganda.', { id: 'chat-privacidade' }));

    // Compositor (mensagem)
    var formEnvio = el('form', 'chat__compositor', null, { novalidate: '' });
    var rotuloTexto = el('label', 'visualmente-oculto', 'Sua mensagem', { for: 'chat-texto' });
    var areaTexto = el('textarea', 'chat__texto', null, {
      id: 'chat-texto', rows: '1', maxlength: String(LIMITE_TEXTO), placeholder: 'Escreva sua mensagem…',
      'aria-describedby': 'chat-erro', required: ''
    });
    var botaoEnviar = el('button', 'chat__enviar', null, { type: 'submit' });
    botaoEnviar.appendChild(icone('seta'));
    botaoEnviar.appendChild(oculto('Enviar mensagem'));
    formEnvio.appendChild(rotuloTexto);
    formEnvio.appendChild(areaTexto);
    formEnvio.appendChild(botaoEnviar);

    var erro = el('p', 'chat__erro', null, { id: 'chat-erro', role: 'alert' });
    erro.hidden = true;

    var rodapePainel = el('div', 'chat__rodape');
    rodapePainel.appendChild(formInicio);
    rodapePainel.appendChild(erro);
    rodapePainel.appendChild(formEnvio);

    painel.appendChild(cabecalho);
    painel.appendChild(avisoHorario);
    painel.appendChild(log);
    painel.appendChild(rodapePainel);

    // Anúncio para leitores de tela: só respostas novas do atendente (fora do painel, para ser ouvido
    // também com o chat fechado). O histórico carregado ao abrir ou retomar não é anunciado.
    var anuncio = el('p', 'visualmente-oculto', null, { 'aria-live': 'polite', 'data-chat-anuncio': '' });

    raiz.appendChild(painel);
    raiz.appendChild(botao);
    raiz.appendChild(anuncio);
    document.body.appendChild(raiz);
    document.documentElement.classList.add('tem-chat');

    function campo(id, rotulo, tag, attrs) {
      var grupo = el('div', 'chat__campo');
      grupo.appendChild(el('label', 'chat__rotulo', rotulo, { for: id }));
      attrs.id = id;
      var entrada = el(tag, 'chat__entrada', null, attrs);
      grupo.appendChild(entrada);
      return { grupo: grupo, entrada: entrada };
    }

    // Caminho até a raiz do site (as páginas podem estar em subpastas no futuro).
    function caminhoRaiz() {
      var s = document.querySelector('script[src$="assets/js/chat.js"]');
      return s ? s.getAttribute('src').replace(/assets\/js\/chat\.js$/, '') : '';
    }

    // ------------------------------------------------------------- horário
    function linkWhatsDono() {
      var contextual = window.PBR_whatsapp && window.PBR_whatsapp.linkDaPagina();
      return contextual || 'https://wa.me/' + whatsappDono + '?text=' + encodeURIComponent(config.contato.whatsappMensagem || '');
    }

    function atualizarHorario() {
      var online = estaNoHorario(atendimento, new Date());
      raiz.setAttribute('data-online', String(online));
      statusTexto.textContent = online ? 'Online agora · respondemos em minutos' : 'Fora do horário de atendimento';

      avisoHorario.textContent = '';
      if (online) { avisoHorario.hidden = true; return; }
      var texto = el('p');
      texto.appendChild(el('strong', null, 'Estamos fora do horário agora.'));
      texto.appendChild(document.createTextNode('Deixe sua mensagem que respondemos assim que voltarmos' +
        (whatsappDono ? ', ou chame no WhatsApp.' : '.') +
        (atendimento.textoHorario ? ' Atendimento: ' + atendimento.textoHorario : '')));
      avisoHorario.appendChild(texto);
      if (whatsappDono) {
        var a = el('a', 'botao botao--whatsapp botao--pequeno chat__whatsapp', null, {
          href: linkWhatsDono(),
          target: '_blank', rel: 'noopener'
        });
        // A mensagem acompanha a página (artigo, plano marcado...); recalcula no clique (melhoria 24)
        a.addEventListener('click', function () { a.href = linkWhatsDono(); });
        a.appendChild(icone('whatsapp'));
        a.appendChild(document.createTextNode('Falar no WhatsApp'));
        a.appendChild(oculto(' (abre em nova aba)'));
        avisoHorario.appendChild(a);
      }
      avisoHorario.hidden = false;
    }
    atualizarHorario();
    setInterval(atualizarHorario, 60000);

    // ------------------------------------------------------------- render
    var formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var formatoDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    function quando(iso) {
      var d = new Date(iso);
      return (new Date().toDateString() === d.toDateString() ? formatoHora : formatoDia).format(d);
    }

    var historicoCarregado = false; // vira true depois da primeira lista vinda do servidor
    var timerAnuncio = null;
    function anunciar(texto) {
      // limpa e escreve no quadro seguinte, para o mesmo texto ser anunciado de novo se repetir
      anuncio.textContent = '';
      clearTimeout(timerAnuncio);
      timerAnuncio = setTimeout(function () { anuncio.textContent = texto; }, 100);
    }
    function anunciarDoAtendente(lista) {
      if (!lista.length) return;
      var ultima = lista[lista.length - 1].texto;
      var curta = ultima.length > 200 ? ultima.slice(0, 200) + '…' : ultima;
      anunciar(lista.length === 1
        ? 'Nova mensagem da Portfólio BR: ' + curta
        : lista.length + ' novas mensagens da Portfólio BR. A última: ' + curta);
    }

    function adicionarMensagens(novas, anunciarNovas) {
      var adicionou = false;
      var doAtendente = [];
      novas.forEach(function (m) {
        if (!m || idsVistos[m.id]) return;
        idsVistos[m.id] = true;
        mensagens.push(m);
        var li = el('li', 'chat__bolha chat__bolha--' + (m.autor === 'admin' ? 'admin' : 'visitante'));
        li.appendChild(oculto(m.autor === 'admin' ? 'Portfólio BR: ' : 'Você: '));
        li.appendChild(el('span', 'chat__bolha-texto', m.texto));
        var hora = el('time', 'chat__hora', quando(m.criado_em), { datetime: m.criado_em });
        li.appendChild(hora);
        listaMensagens.appendChild(li);
        if (m.autor === 'admin') doAtendente.push(m);
        adicionou = true;
      });
      if (adicionou) {
        mensagens.sort(function (a, b) { return a.criado_em < b.criado_em ? -1 : 1; });
        log.scrollTop = log.scrollHeight;
        atualizarNaoLidas();
        if (anunciarNovas) anunciarDoAtendente(doAtendente);
      }
    }

    function ultimaData() {
      return mensagens.length ? mensagens[mensagens.length - 1].criado_em : null;
    }

    function atualizarNaoLidas() {
      if (aberto && !document.hidden) {
        var ultima = ultimaData();
        if (ultima && ultima !== estado.ultimaVista) { estado.ultimaVista = ultima; salvarEstado(estado); }
      }
      var n = mensagens.filter(function (m) {
        return m.autor === 'admin' && (!estado.ultimaVista || m.criado_em > estado.ultimaVista);
      }).length;
      selo.hidden = n === 0;
      selo.textContent = n > 9 ? '9+' : String(n);
      rotuloBotao.textContent = n ? 'Abrir chat (' + n + (n === 1 ? ' nova mensagem)' : ' novas mensagens)') : (aberto ? 'Fechar chat' : 'Abrir chat');
      atualizarRecolhido();
    }

    function atualizarModo() {
      var iniciada = !!estado.iniciada;
      formInicio.hidden = iniciada;
      avisoFechada.hidden = !(conversa && conversa.status === 'fechada');
      botaoEnviar.querySelector('.visualmente-oculto').textContent = iniciada ? 'Enviar mensagem' : 'Iniciar conversa';
      raiz.setAttribute('data-iniciada', String(iniciada));
    }
    atualizarModo();

    function mostrarErro(texto) {
      erro.textContent = texto || '';
      erro.hidden = !texto;
    }

    // ------------------------------------------------------------- Supabase
    function obterCliente() {
      if (supa) return Promise.resolve(supa);
      return window.PBRSupabase.cliente({
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      }).then(function (c) { supa = c; return c; });
    }

    function rpc(nome, args) {
      return obterCliente().then(function (c) { return c.rpc(nome, args); }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
    }

    function credenciais(extra) {
      var a = { p_visitante_id: estado.visitanteId, p_token: estado.token };
      if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
      return a;
    }

    function tratarAcessoNegado(e) {
      var m = (e && e.message) || '';
      if (m.indexOf('acesso_negado') === -1) return false;
      // Identidade local inválida (ex.: armazenamento corrompido). Recomeça do zero.
      desligarRealtime();
      estado = novaIdentidade();
      conversa = null;
      mensagens = [];
      idsVistos = {};
      historicoCarregado = false;
      listaMensagens.textContent = '';
      atualizarModo();
      atualizarNaoLidas();
      return true;
    }

    var retomando = null; // evita dois chat_iniciar seguidos (abrir o chat durante a retomada automática)
    function retomarConversa() {
      if (retomando) return retomando;
      retomando = rpc('chat_iniciar', credenciais({ p_criar: false })).then(function (linhas) {
        var c = linhas && linhas[0];
        if (!c) {
          // A conversa foi apagada no painel: volta ao formulário inicial.
          estado.iniciada = false;
          salvarEstado(estado);
          conversa = null;
          atualizarModo();
          return null;
        }
        conversa = c;
        atualizarModo();
        ligarRealtime();
        return buscarMensagens();
      }).catch(function (e) {
        if (!tratarAcessoNegado(e)) iniciarReserva();
      }).then(function (r) { retomando = null; return r; });
      return retomando;
    }

    var buscando = null;
    function buscarMensagens() {
      if (buscando) return buscando;
      buscando = rpc('chat_listar', credenciais({ p_depois: ultimaData() }))
        .then(function (lista) {
          adicionarMensagens(lista || [], historicoCarregado);
          historicoCarregado = true;
        })
        .catch(function (e) { tratarAcessoNegado(e); })
        .then(function () { buscando = null; });
      return buscando;
    }

    function ligarRealtime() {
      if (!conversa || canalRealtime) return;
      obterCliente().then(function (c) {
        if (canalRealtime) return;
        canalRealtime = c.channel('chat:' + conversa.canal)
          .on('broadcast', { event: 'nova_mensagem' }, function () { buscarMensagens(); })
          .on('broadcast', { event: 'status' }, function (msg) {
            var s = msg && msg.payload && msg.payload.status;
            if (conversa && (s === 'aberta' || s === 'fechada')) { conversa.status = s; atualizarModo(); }
          })
          .subscribe(function (status) {
            realtimeConectado = status === 'SUBSCRIBED';
            if (realtimeConectado) { pararReserva(); buscarMensagens(); } else iniciarReserva();
          });
      }).catch(iniciarReserva);
    }

    function desligarRealtime() {
      if (canalRealtime && supa) supa.removeChannel(canalRealtime);
      canalRealtime = null;
      realtimeConectado = false;
      pararReserva();
    }

    // Reserva: se o tempo real cair, busca de tempos em tempos (só com a página visível).
    function iniciarReserva() {
      if (timerReserva || !estado.iniciada) return;
      timerReserva = setInterval(function () {
        if (!document.hidden && !realtimeConectado) {
          if (conversa) buscarMensagens(); else retomarConversa();
        }
      }, INTERVALO_RESERVA_MS);
    }
    function pararReserva() { clearInterval(timerReserva); timerReserva = null; }

    // ------------------------------------------------------------- envio
    function enviar(texto) {
      if (enviando) return;
      texto = texto.trim();
      if (!texto) { mostrarErro('Escreva sua mensagem.'); areaTexto.focus(); return; }
      if (texto.length > LIMITE_TEXTO) { mostrarErro(mensagemDeErro({ message: 'texto_invalido' })); return; }

      var passoInicial = Promise.resolve();
      if (!estado.iniciada) {
        var zap = campoZap.entrada.value;
        if (!whatsappValido(zap)) {
          mostrarErro(mensagemDeErro({ message: 'whatsapp_invalido' }));
          campoZap.entrada.setAttribute('aria-invalid', 'true');
          campoZap.entrada.setAttribute('aria-describedby', 'chat-erro chat-whatsapp-dica chat-privacidade');
          campoZap.entrada.focus();
          return;
        }
        campoZap.entrada.removeAttribute('aria-invalid');
        campoZap.entrada.setAttribute('aria-describedby', 'chat-whatsapp-dica chat-privacidade');
        passoInicial = rpc('chat_iniciar', credenciais({
          p_nome: campoNome.entrada.value.trim() || null,
          p_whatsapp: apenasDigitos(zap) || null,
          // página + de onde o visitante veio (origem.js, melhoria 10), no mesmo campo de texto
          p_pagina: [location.pathname + location.hash, window.PBROrigem ? window.PBROrigem.resumo() : '']
            .filter(Boolean).join(' · ').slice(0, 300),
          p_criar: true
        })).then(function (linhas) {
          conversa = linhas && linhas[0];
          if (!conversa) throw new Error('falha_iniciar');
          estado.iniciada = true;
          historicoCarregado = true; // conversa nova: não há histórico a ignorar
          salvarEstado(estado);
          atualizarModo();
          ligarRealtime();
        });
      }

      enviando = true;
      botaoEnviar.disabled = true;
      raiz.setAttribute('aria-busy', 'true');
      mostrarErro('');

      passoInicial
        .then(function () { return rpc('chat_enviar', credenciais({ p_texto: texto })); })
        .then(function (linhas) {
          areaTexto.value = '';
          ajustarAltura();
          if (conversa) { conversa.status = 'aberta'; atualizarModo(); }
          adicionarMensagens(linhas || []);
        })
        .catch(function (e) {
          if (e && e.message && e.message.indexOf('conversa_inexistente') !== -1) {
            estado.iniciada = false; salvarEstado(estado); atualizarModo();
            mostrarErro('Sua conversa anterior foi encerrada. Envie de novo para começar outra.');
          } else if (tratarAcessoNegado(e)) {
            mostrarErro('Sua sessão de chat expirou neste navegador. Envie de novo para começar uma nova conversa.');
          } else {
            mostrarErro(mensagemDeErro(e));
          }
        })
        .then(function () {
          enviando = false;
          botaoEnviar.disabled = false;
          raiz.removeAttribute('aria-busy');
        });
    }

    formEnvio.addEventListener('submit', function (e) { e.preventDefault(); enviar(areaTexto.value); });
    formInicio.addEventListener('submit', function (e) { e.preventDefault(); areaTexto.focus(); });
    areaTexto.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(areaTexto.value); }
    });
    function ajustarAltura() {
      areaTexto.style.height = 'auto';
      areaTexto.style.height = Math.min(areaTexto.scrollHeight, 140) + 'px';
    }
    areaTexto.addEventListener('input', function () { ajustarAltura(); if (!erro.hidden) mostrarErro(''); });

    // ------------------------------------------------------------- abrir/fechar
    function definirAberto(valor, devolverFoco) {
      aberto = valor;
      painel.hidden = !valor;
      botao.setAttribute('aria-expanded', String(valor));
      raiz.setAttribute('data-aberto', String(valor));
      document.documentElement.classList.toggle('chat-aberto', valor);
      atualizarModal();
      atualizarRecolhido();
      if (valor) {
        atualizarHorario();
        (estado.iniciada ? areaTexto : campoNome.entrada).focus();
        log.scrollTop = log.scrollHeight;
        if (estado.iniciada && !conversa) retomarConversa();
        else obterCliente().catch(function () { mostrarErro('Chat indisponível no momento. Tente mais tarde.'); });
      } else if (devolverFoco) {
        botao.focus();
      }
      atualizarNaoLidas();
    }

    botao.addEventListener('click', function () { definirAberto(!aberto, false); });

    // Desempenho: o supabase-js (e o Realtime) só são baixados quando o visitante abre o chat ou já tem
    // conversa salva. Ao primeiro sinal de intenção (mouse, dedo ou foco no botão) o download começa,
    // para o chat abrir pronto, sem criar cliente nem abrir conexão.
    var aquecido = false;
    function aquecer() {
      if (aquecido) return;
      aquecido = true;
      if (window.PBRSupabase.aquecer) window.PBRSupabase.aquecer();
    }
    botao.addEventListener('pointerenter', aquecer);
    botao.addEventListener('touchstart', aquecer, { passive: true });
    botao.addEventListener('focus', aquecer);
    fechar.addEventListener('click', function () { definirAberto(false, true); });
    // Esc fecha e devolve o foco ao botão, só quando o foco está no chat (ou em lugar nenhum),
    // para não roubar o Esc de menus e diálogos da página.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !aberto || e.defaultPrevented) return;
      var ativo = document.activeElement;
      if (ativo && ativo !== document.body && !raiz.contains(ativo)) return;
      e.preventDefault();
      definirAberto(false, true);
    });

    // No celular o painel cobre a tela inteira: vira diálogo modal e o Tab circula dentro dele
    // (a página por trás está coberta). No computador é uma janela lateral não modal.
    var telaCheia = window.matchMedia('(max-width: 47.99rem)');
    function atualizarModal() {
      painel.setAttribute('aria-modal', String(aberto && telaCheia.matches));
    }
    if (telaCheia.addEventListener) telaCheia.addEventListener('change', atualizarModal);
    function focaveis() {
      return Array.prototype.filter.call(
        painel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (x) { return x.getClientRects().length > 0; });
    }
    painel.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !telaCheia.matches) return;
      var lista = focaveis();
      if (!lista.length) return;
      var primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { atualizarNaoLidas(); if (conversa && !realtimeConectado) buscarMensagens(); }
    });

    // ------------------------------------------------------------- não cobrir conteúdo
    // No celular, recolhe o botão enquanto elementos com data-evitar-flutuante estão visíveis.
    var visiveis = new Set();
    var celular = window.matchMedia('(max-width: 47.99rem)');
    function atualizarRecolhido() {
      var recolher = celular.matches && visiveis.size > 0 && !aberto && selo.hidden;
      raiz.setAttribute('data-recolhido', String(recolher));
    }
    var evitar = document.querySelectorAll('[data-evitar-flutuante]');
    if (evitar.length && 'IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (en) { if (en.isIntersecting) visiveis.add(en.target); else visiveis.delete(en.target); });
        atualizarRecolhido();
      });
      evitar.forEach(function (x) { obs.observe(x); });
      if (celular.addEventListener) celular.addEventListener('change', atualizarRecolhido);
    }

    // ------------------------------------------------------------- retomada automática
    // Quem já conversou recebe respostas mesmo com o painel fechado (selo de não lidas).
    // Só depois do evento load e com o navegador ocioso, para não disputar a primeira pintura.
    if (estado.iniciada) {
      var retomar = function () { if (!conversa) retomarConversa(); };
      var agendar = function () {
        if ('requestIdleCallback' in window) window.requestIdleCallback(retomar, { timeout: 3000 });
        else setTimeout(retomar, 1500);
      };
      if (document.readyState === 'complete') agendar();
      else window.addEventListener('load', agendar, { once: true });
    }
  }
})();
