/*
 * planos.js — página de contratação (planos.html).
 * Mostra os planos do config.js, valida o formulário, chama a Edge Function criar-pagamento
 * e redireciona para o Checkout Pro do Mercado Pago.
 *
 * O preço exibido vem do config.js; o preço COBRADO vem do servidor (tabela planos).
 * O código e o token do pedido ficam no localStorage para a página obrigado.html consultar o status.
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

  function validar() {
    var erros = {};
    var nome = campos.nome.value.trim();
    if (nome.length < 2) erros.nome = 'Informe seu nome.';
    var email = campos.email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.email = 'Informe um e-mail válido, por exemplo nome@gmail.com.';
    if (!/^\d{10,13}$/.test(digitos(campos.whatsapp.value))) erros.whatsapp = 'Informe o WhatsApp com DDD, por exemplo (11) 91234-5678.';
    if (!campos.aceite.checked) erros.aceite = 'Para continuar, aceite os termos de uso e a política de privacidade.';
    Object.keys(campos).forEach(function (k) {
      var alvo = $('#checkout-' + k + '-erro');
      if (erros[k]) {
        campos[k].setAttribute('aria-invalid', 'true');
        alvo.textContent = erros[k];
        alvo.hidden = false;
      } else {
        campos[k].removeAttribute('aria-invalid');
        alvo.hidden = true;
      }
    });
    var primeiro = Object.keys(campos).filter(function (k) { return erros[k]; })[0];
    if (primeiro) campos[primeiro].focus();
    return !primeiro;
  }

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

  // Ao voltar pelo botão "voltar" do navegador (bfcache), reabilita o botão.
  window.addEventListener('pageshow', function () {
    enviando = false;
    botao.disabled = false;
    botao.removeAttribute('data-carregando');
    textoBotao.textContent = 'Ir para o pagamento seguro';
    form.removeAttribute('aria-busy');
  });
})();
