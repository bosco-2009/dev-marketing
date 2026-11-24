/*
 * planos.js — página de contratação (planos.html).
 * Mostra os planos do config.js, valida o formulário, chama a Edge Function criar-pagamento
 * e redireciona para o Checkout Pro do Mercado Pago.
 *
 * O preço exibido vem do config.js; o preço COBRADO vem do servidor (tabela planos).
 * O código e o token do pedido ficam no localStorage para a página obrigado.html consultar o status.
 * Com um pedido pendente salvo aqui, mostra o aviso "Você tem um pedido em aberto" (melhoria 39).
 */
(function () {
  'use strict';

  var CHAVE_PEDIDOS = 'pbr_pedidos_v1';
  var config = window.PBR_CONFIG;
  if (!config) return;

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icone(nome) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + nome);
    svg.appendChild(use);
    return svg;
  }
  var formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  function preco(c) { return formatoReal.format(c / 100); }

  // ------------------------------------------------------------------ armazenamento do pedido
  function lerPedidos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PEDIDOS)) || {}; } catch (e) { return {}; }
  }
  function salvarPedido(p) {
    var todos = lerPedidos();
    todos[p.pedido_id] = { codigo: p.codigo, token: p.token, plano_id: p.plano_id, plano_nome: p.plano_nome, valor_centavos: p.valor_centavos, criado_em: new Date().toISOString() };
    // guarda só os 10 mais recentes
    var ids = Object.keys(todos).sort(function (a, b) { return todos[b].criado_em < todos[a].criado_em ? -1 : 1; });
    ids.slice(10).forEach(function (id) { delete todos[id]; });
    try {
      localStorage.setItem(CHAVE_PEDIDOS, JSON.stringify(todos));
      localStorage.setItem('pbr_ultimo_pedido', p.pedido_id);
      return true;
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ opções de plano
  var opcoes = $('[data-opcoes-plano]');
  var resumo = $('[data-resumo-plano]');
  var form = $('[data-form-checkout]');
  if (!opcoes || !form) return;

  var parcelamento = $('[data-texto-parcelamento]');
  if (parcelamento) parcelamento.textContent = config.pagamento.textoParcelamento;

  var params = new URLSearchParams(location.search);
  var preSelecionado = params.get('plano');
  var existe = config.planos.some(function (p) { return p.id === preSelecionado; });
  if (!existe) preSelecionado = (config.planos.filter(function (p) { return p.destaque; })[0] || config.planos[0]).id;

  config.planos.forEach(function (plano) {
    var rotulo = el('label', 'opcao-plano' + (plano.destaque ? ' opcao-plano--destaque' : ''));
    var radio = el('input', 'opcao-plano__radio', null, { type: 'radio', name: 'plano', value: plano.id });
    if (plano.id === preSelecionado) radio.checked = true;
    rotulo.appendChild(radio);
    var conteudo = el('span', 'opcao-plano__conteudo');
    var linha = el('span', 'opcao-plano__linha');
    linha.appendChild(el('span', 'opcao-plano__nome', plano.nome));
    if (plano.destaque && plano.selo) linha.appendChild(el('span', 'opcao-plano__selo', plano.selo));
    conteudo.appendChild(linha);
    conteudo.appendChild(el('span', 'opcao-plano__preco', preco(plano.precoCentavos)));
    conteudo.appendChild(el('span', 'opcao-plano__resumo', plano.resumo));
    rotulo.appendChild(conteudo);
    opcoes.appendChild(rotulo);
  });

  function planoEscolhido() {
    var r = form.querySelector('input[name="plano"]:checked');
    return r ? config.planos.filter(function (p) { return p.id === r.value; })[0] : null;
  }

  function atualizarResumo() {
    var p = planoEscolhido();
    resumo.textContent = '';
    if (!p) { resumo.appendChild(el('p', 'checkout__resumo-vazio', 'Escolha um plano para ver o resumo.')); return; }
    resumo.appendChild(el('p', 'checkout__resumo-plano', 'Plano ' + p.nome));
    var valor = el('p', 'checkout__resumo-valor');
    valor.appendChild(el('span', 'checkout__resumo-preco', preco(p.precoCentavos)));
    valor.appendChild(el('span', 'checkout__resumo-condicao', ' pagamento único'));
    resumo.appendChild(valor);
    resumo.appendChild(el('p', 'checkout__resumo-prazo', p.prazo));
    var ul = el('ul', 'checkout__resumo-itens', null, { role: 'list' });
    p.itens.forEach(function (t) {
      var li = el('li');
      li.appendChild(icone('check'));
      li.appendChild(el('span', null, t));
      ul.appendChild(li);
    });
    resumo.appendChild(ul);
    // Dúvida sobre o plano escolhido: WhatsApp com a mensagem pronta (só com número configurado)
    var zap = window.PBR_whatsapp;
    var hrefZap = zap && zap.link('plano', { plano: p.nome });
    if (hrefZap) {
      var duvida = el('p', 'checkout__resumo-whats');
      duvida.appendChild(zap.criarLink(hrefZap, 'Dúvidas sobre o ' + p.nome + '? Pergunte no WhatsApp'));
      resumo.appendChild(duvida);
    }
    var url = new URL(location.href);
    url.searchParams.set('plano', p.id);
    history.replaceState(null, '', url.pathname + url.search + url.hash); // mantém #comparativo
  }
  opcoes.addEventListener('change', atualizarResumo);
  atualizarResumo();

  // ------------------------------------------------------------------ o que acontece depois de pagar (melhoria 35)
  // Mesmas etapas de pedido.html, textos de config.depoisDoPagamento. {prazo} = prazo do plano escolhido.
  var depois = $('[data-depois-pagar]');
  var cfgDepois = config.depoisDoPagamento;
  function textoEtapa(t, p) {
    var prazo = p && p.prazo ? p.prazo : 'No prazo do plano escolhido';
    return String(t).replace('{prazo}', prazo).replace(/\.\.$/, '.');
  }
  function atualizarDepois() {
    var lista = $('[data-depois-lista]', depois);
    var p = planoEscolhido();
    lista.textContent = '';
    cfgDepois.etapas.forEach(function (e, i) {
      var li = el('li', 'depois-pagar__etapa');
      li.appendChild(el('span', 'depois-pagar__numero', String(i + 1), { 'aria-hidden': 'true' }));
      var corpo = el('div', 'depois-pagar__corpo');
      corpo.appendChild(el('h3', 'depois-pagar__etapa-titulo', e.titulo));
      corpo.appendChild(el('p', 'depois-pagar__texto', textoEtapa(e.texto, p)));
      li.appendChild(corpo);
      lista.appendChild(li);
    });
  }
  if (depois && cfgDepois && cfgDepois.etapas && cfgDepois.etapas.length) {
    if (cfgDepois.titulo) $('[data-depois-titulo]', depois).textContent = cfgDepois.titulo;
    var notaAcompanhar = $('[data-depois-acompanhar]', depois);
    if (cfgDepois.acompanhar) { notaAcompanhar.textContent = cfgDepois.acompanhar; notaAcompanhar.hidden = false; }
    // O link para as dúvidas só aparece se a seção de dúvidas tiver perguntas
    var temDuvidas = (config.faq || []).some(function (f) { return f.checkout === true; });
    $('[data-depois-duvidas]', depois).hidden = !temDuvidas || !$('#duvidas-pagamento');
    atualizarDepois();
    opcoes.addEventListener('change', atualizarDepois);
    depois.hidden = false;
  }

  // ------------------------------------------------------------------ validação
  var campos = {
    nome: $('#checkout-nome'),
    email: $('#checkout-email'),
    whatsapp: $('#checkout-whatsapp'),
    aceite: $('#checkout-aceite')
  };
  var erroGeral = $('[data-erro-checkout]');
  var botao = $('[data-botao-pagar]');
  var textoBotao = $('[data-botao-pagar-texto]');

  function digitos(t) { return String(t || '').replace(/\D/g, ''); }

  // Regras por campo: a mesma função serve ao envio e à saída do campo (melhoria 46)
  var REGRAS = {
    nome: function () { return campos.nome.value.trim().length < 2 ? 'Informe seu nome.' : ''; },
    email: function () {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(campos.email.value.trim()) ? '' : 'Informe um e-mail válido, por exemplo nome@gmail.com.';
    },
    whatsapp: function () {
      return /^\d{10,13}$/.test(digitos(campos.whatsapp.value)) ? '' : 'Informe o WhatsApp com DDD, por exemplo (11) 91234-5678.';
    },
    aceite: function () { return campos.aceite.checked ? '' : 'Para continuar, aceite os termos de uso e a política de privacidade.'; }
  };

  function marcarCampo(k, erro) {
    var alvo = $('#checkout-' + k + '-erro');
    if (erro) {
      campos[k].setAttribute('aria-invalid', 'true');
      alvo.textContent = erro;
      alvo.hidden = false;
    } else {
      campos[k].removeAttribute('aria-invalid');
      alvo.textContent = '';
      alvo.hidden = true;
    }
  }

  function validar() {
    var primeiro = null;
    Object.keys(campos).forEach(function (k) {
      var erro = REGRAS[k]();
      marcarCampo(k, erro);
      if (erro && !primeiro) primeiro = k;
    });
    if (primeiro) campos[primeiro].focus();
    return !primeiro;
  }

  // Ao sair do campo: mostra o erro só se a pessoa escreveu algo (passar com Tab por um campo vazio não acusa nada).
  // Enquanto digita: nenhuma mensagem nova; um erro já mostrado some assim que o valor fica certo.
  ['nome', 'email', 'whatsapp'].forEach(function (k) {
    campos[k].addEventListener('blur', function () {
      if (campos[k].value.trim() || campos[k].hasAttribute('aria-invalid')) marcarCampo(k, REGRAS[k]());
    });
    campos[k].addEventListener('input', function () {
      if (campos[k].hasAttribute('aria-invalid') && !REGRAS[k]()) marcarCampo(k, '');
    });
  });
  campos.aceite.addEventListener('change', function () {
    if (campos.aceite.hasAttribute('aria-invalid') && campos.aceite.checked) marcarCampo('aceite', '');
  });

  // Máscara leve do WhatsApp: (11) 91234-5678. Só formata ao digitar/colar com o cursor no fim;
  // apagar nunca é reformatado (o Backspace funciona normalmente) e números com DDI (mais de 11 dígitos) ficam como estão.
  function mascaraWhatsapp(d) {
    if (d.length > 11) return null;
    if (d.length <= 2) return d.length ? '(' + d : '';
    var ddd = '(' + d.slice(0, 2) + ') ', resto = d.slice(2);
    if (resto.length <= 4) return ddd + resto;
    var corte = resto.length === 9 ? 5 : 4;
    return ddd + resto.slice(0, corte) + '-' + resto.slice(corte);
  }
  campos.whatsapp.addEventListener('input', function (e) {
    var c = campos.whatsapp;
    if (e.inputType && e.inputType.indexOf('delete') === 0) return;
    if (c.selectionStart !== c.value.length) return;
    var formatado = mascaraWhatsapp(digitos(c.value));
    if (formatado !== null && formatado !== c.value) c.value = formatado;
  });
  campos.whatsapp.addEventListener('blur', function () {
    var formatado = mascaraWhatsapp(digitos(campos.whatsapp.value));
    if (formatado && digitos(formatado).length >= 10) campos.whatsapp.value = formatado;
  });

  function mostrarErro(texto) {
    erroGeral.textContent = texto || '';
    erroGeral.hidden = !texto;
    if (texto) erroGeral.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  var MENSAGENS = {
    plano_invalido: 'Este plano não está disponível no momento. Escolha outro ou fale com a gente.',
    nome_invalido: 'Confira o seu nome.',
    email_invalido: 'Confira o seu e-mail.',
    whatsapp_invalido: 'Confira o seu WhatsApp (DDD + número).',
    aceite_obrigatorio: 'Para continuar, aceite os termos de uso e a política de privacidade.',
    limite_pedidos: 'Muitas tentativas de pedido em pouco tempo. Aguarde um pouco ou fale com a gente pelo chat.',
    mp_indisponivel: 'O Mercado Pago não respondeu agora. Tente de novo em alguns instantes.'
  };

  // Só redireciona para o Mercado Pago (ou localhost em desenvolvimento).
  function urlCheckoutSegura(u) {
    try {
      var url = new URL(u);
      if (url.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$|(^|\.)mercadolivre\.com(\.br)?$|(^|\.)mercadolibre\.com$/.test(url.hostname)) return true;
      return url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    } catch (e) { return false; }
  }

  var enviando = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;
    mostrarErro('');
    var plano = planoEscolhido();
    if (!plano) { mostrarErro('Escolha um plano.'); return; }
    if (!validar()) return;
    if (!window.PBRSupabase || !window.PBRSupabase.configurado()) {
      mostrarErro('A contratação online está indisponível no momento. Fale com a gente pelo chat ou pelo Instagram @' + config.contato.instagram + '.');
      return;
    }

    enviando = true;
    botao.disabled = true;
    botao.setAttribute('data-carregando', ''); // microinteração (melhoria 16): indicador no botão
    textoBotao.textContent = 'Preparando o pagamento…';
    form.setAttribute('aria-busy', 'true');

    fetch(config.supabase.url.replace(/\/$/, '') + '/functions/v1/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
      body: JSON.stringify({
        plano_id: plano.id,
        nome: campos.nome.value.trim(),
        email: campos.email.value.trim(),
        whatsapp: digitos(campos.whatsapp.value),
        aceite_termos: campos.aceite.checked,
        origem: (window.PBROrigem && window.PBROrigem.resumo()) || undefined // melhoria 10
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (dados) { return { ok: r.ok, dados: dados }; });
      })
      .then(function (res) {
        var d = res.dados || {};
        if (!res.ok || !d.init_point) throw new Error(d.erro || 'falha');
        if (!urlCheckoutSegura(d.init_point)) throw new Error('url_invalida');
        d.plano_id = plano.id;
        salvarPedido(d);
        textoBotao.textContent = 'Abrindo o Mercado Pago…';
        location.assign(d.init_point);
      })
      .catch(function (err) {
        var codigo = err && err.message;
        mostrarErro(MENSAGENS[codigo] || 'Não foi possível iniciar o pagamento. Verifique sua conexão e tente de novo.');
        enviando = false;
        botao.disabled = false;
        botao.removeAttribute('data-carregando');
        textoBotao.textContent = 'Ir para o pagamento seguro';
        form.removeAttribute('aria-busy');
      });
  });

  // ------------------------------------------------------------------ pedido em aberto (melhoria 39)
  // Quem volta do Mercado Pago sem pagar vê um aviso discreto com "Concluir pagamento" (reabre a MESMA
  // preferência pela Edge Function criar-pagamento, modo reabrir) e "Acompanhar pedido".
  // Usa só o que planos.js já guardou (código + token); não grava nada novo nem mostra dados pessoais.
  var caixaAberto = $('[data-pedido-aberto]');
  var DIAS_REABRIR = 30; // mesmo limite da função pedido_preferencia_para_reabrir
  var MENSAGENS_REABRIR = {
    pagamento_em_andamento: 'Já existe um pagamento em processamento para este pedido (Pix ou boleto). Conclua pelo app do seu banco ou acompanhe o pedido.',
    pedido_nao_pendente: 'Este pedido não está mais aguardando pagamento. Veja a situação em "Acompanhar pedido".',
    pedido_nao_reabrivel: 'Este pagamento não pode mais ser reaberto. Se ainda quiser o site, faça um novo pedido abaixo.',
    acesso_negado: 'Não encontramos este pedido. Se ainda quiser o site, faça um novo pedido abaixo.'
  };
  var CODIGO_OK = /^PBR-[A-HJ-NP-Z2-9]{6}$/;
  var TOKEN_OK = /^[0-9a-f]{64}$/;

  function pedidoRecente() {
    var todos = lerPedidos();
    var ultimoId = null;
    try { ultimoId = localStorage.getItem('pbr_ultimo_pedido'); } catch (e) { /* */ }
    var p = ultimoId && todos[ultimoId];
    if (!p || !CODIGO_OK.test(p.codigo) || !TOKEN_OK.test(p.token)) return null;
    var criado = Date.parse(p.criado_em);
    if (!criado || Date.now() - criado > DIAS_REABRIR * 864e5) return null;
    return p;
  }

  function erroAberto(texto) {
    var alvo = $('[data-pedido-aberto-erro]', caixaAberto);
    alvo.textContent = texto || '';
    alvo.hidden = !texto;
  }

  function mostrarPedidoAberto(p, d) {
    var nomePlano = d.plano_nome || p.plano_nome || '';
    $('[data-pedido-aberto-texto]', caixaAberto).textContent =
      'O pedido ' + d.codigo + (nomePlano ? ' (plano ' + nomePlano + ')' : '') +
      ' ainda aguarda pagamento. Você pode concluir agora, sem preencher nada de novo.';
    $('[data-pedido-aberto-acompanhar]', caixaAberto).setAttribute('href', 'pedido.html?pedido=' + encodeURIComponent(d.codigo));

    var botaoConcluir = $('[data-pedido-aberto-concluir]', caixaAberto);
    var textoConcluir = $('[data-pedido-aberto-concluir-texto]', caixaAberto);
    var reabrindo = false;
    function liberar() {
      reabrindo = false;
      botaoConcluir.removeAttribute('aria-disabled');
      botaoConcluir.removeAttribute('data-carregando');
      textoConcluir.textContent = 'Concluir pagamento';
    }
    botaoConcluir.addEventListener('click', function () {
      if (reabrindo) return;
      reabrindo = true;
      erroAberto('');
      // aria-disabled (e não disabled): o foco continua no botão durante a espera e depois de um erro
      botaoConcluir.setAttribute('aria-disabled', 'true');
      botaoConcluir.setAttribute('data-carregando', '');
      textoConcluir.textContent = 'Abrindo o pagamento…';
      fetch(config.supabase.url.replace(/\/$/, '') + '/functions/v1/criar-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
        body: JSON.stringify({ reabrir: true, codigo: p.codigo, token: p.token })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (dados) { return { ok: r.ok, dados: dados }; });
        })
        .then(function (res) {
          var dd = res.dados || {};
          if (!res.ok || !dd.init_point) throw new Error(dd.erro || 'falha');
          if (!urlCheckoutSegura(dd.init_point)) throw new Error('url_invalida');
          textoConcluir.textContent = 'Abrindo o Mercado Pago…';
          location.assign(dd.init_point);
        })
        .catch(function (err) {
          var codigo = err && err.message;
          erroAberto(MENSAGENS_REABRIR[codigo] || 'Não foi possível reabrir o pagamento agora. Tente de novo em instantes ou acompanhe o pedido.');
          liberar();
        });
    });
    window.addEventListener('pageshow', function (ev) { if (ev.persisted) liberar(); });
    caixaAberto.hidden = false;
  }

  (function verificarPedidoAberto() {
    if (!caixaAberto || !window.PBRSupabase || !window.PBRSupabase.configurado()) return;
    var p = pedidoRecente();
    if (!p) return;
    // O status vem do servidor (pedido_consultar valida o token); o aviso só aparece para "pendente".
    fetch(config.supabase.url.replace(/\/$/, '') + '/rest/v1/rpc/pedido_consultar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
      body: JSON.stringify({ p_codigo: p.codigo, p_token: p.token })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (linhas) {
        var d = linhas && linhas[0];
        if (d && d.status === 'pendente' && d.codigo === p.codigo) mostrarPedidoAberto(p, d);
      })
      .catch(function () { /* sem rede: o aviso simplesmente não aparece */ });
  })();

  // Ao voltar pelo botão "voltar" do navegador (bfcache), reabilita o botão.
  window.addEventListener('pageshow', function () {
    enviando = false;
    botao.disabled = false;
    botao.removeAttribute('data-carregando');
    textoBotao.textContent = 'Ir para o pagamento seguro';
    form.removeAttribute('aria-busy');
  });
})();
