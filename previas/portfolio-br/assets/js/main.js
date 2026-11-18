/*
 * main.js — comportamento da home.
 * - Lê window.PBR_CONFIG (config.js) e renderiza planos, garantias, FAQ, contatos,
 *   portfólio e depoimentos (estes dois só se houver itens reais).
 * - Menu móvel acessível e botão flutuante reservado para o chat (Fase 2).
 * Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  document.documentElement.classList.remove('sem-js');

  var config = window.PBR_CONFIG;
  if (!config) {
    console.warn('[Portfólio BR] config.js não carregado.');
    return;
  }

  // ---------------- Utilidades ----------------
  function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }

  function criar(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    return el;
  }

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

  var formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  function formatarPreco(centavos) { return formatoReal.format(centavos / 100); }

  // Link de contato preferido: WhatsApp (se configurado) ou direct do Instagram.
  function linkContato(mensagem) {
    var c = config.contato;
    if (c.whatsapp) {
      return {
        tipo: 'whatsapp',
        href: 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(mensagem || c.whatsappMensagem),
        rotulo: 'Falar no WhatsApp'
      };
    }
    return { tipo: 'instagram', href: 'https://ig.me/m/' + c.instagram, rotulo: 'Falar pelo Instagram' };
  }

  function linkExterno(href, classe, conteudo) {
    var a = criar('a', classe);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    conteudo.forEach(function (n) { a.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); });
    return a;
  }

  // ---------------- Rascunho ----------------
  if (config.rascunho) {
    var aviso = $('[data-aviso-rascunho]');
    if (aviso) aviso.hidden = false;
  }

  // ---------------- Menu móvel ----------------
  var menuBotao = $('[data-menu-botao]');
  var menu = $('[data-menu]');
  var menuRotulo = $('[data-menu-rotulo]');

  function definirMenu(aberto) {
    if (!menuBotao || !menu) return;
    menuBotao.setAttribute('aria-expanded', String(aberto));
    menu.setAttribute('data-aberto', String(aberto));
    if (menuRotulo) menuRotulo.textContent = aberto ? 'Fechar menu' : 'Abrir menu';
    var use = menuBotao.querySelector('use');
    if (use) use.setAttribute('href', aberto ? '#i-fechar' : '#i-menu');
  }

  if (menuBotao && menu) {
    menuBotao.addEventListener('click', function () {
      definirMenu(menuBotao.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) definirMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBotao.getAttribute('aria-expanded') === 'true') {
        definirMenu(false);
        menuBotao.focus();
      }
    });
  }

  // ---------------- Planos ----------------
  var parcelamento = $('[data-texto-parcelamento]');
  if (parcelamento) parcelamento.textContent = config.pagamento.textoParcelamento;

  var listaPlanos = $('[data-lista-planos]');
  if (listaPlanos) {
    config.planos.forEach(function (plano) {
      var li = criar('li', 'plano' + (plano.destaque ? ' plano--destaque' : ''));
      li.id = 'plano-' + plano.id;

      if (plano.destaque && plano.selo) li.appendChild(criar('p', 'plano__selo', plano.selo));

      var titulo = criar('h3', 'plano__nome', plano.nome);
      titulo.id = 'plano-' + plano.id + '-titulo';
      li.appendChild(titulo);
      li.appendChild(criar('p', 'plano__resumo', plano.resumo));

      var preco = criar('p', 'plano__preco');
      preco.appendChild(criar('span', 'plano__valor', formatarPreco(plano.precoCentavos)));
      preco.appendChild(criar('span', 'plano__condicao', 'pagamento único'));
      li.appendChild(preco);

      li.appendChild(criar('p', 'plano__prazo', plano.prazo));

      var itens = criar('ul', 'plano__itens');
      itens.setAttribute('role', 'list');
      plano.itens.forEach(function (texto) {
        var item = criar('li');
        item.appendChild(icone('check'));
        item.appendChild(criar('span', null, texto));
        itens.appendChild(item);
      });
      li.appendChild(itens);

      // Fase 3: este botão passará a levar ao checkout do Mercado Pago.
      var contato = linkContato('Olá! Tenho interesse no plano ' + plano.nome + ' da Portfólio BR.');
      var botao = linkExterno(contato.href, 'botao ' + (plano.destaque ? 'botao--primario' : 'botao--contorno'),
        ['Quero o plano ' + plano.nome]);
      botao.setAttribute('aria-label', 'Quero o plano ' + plano.nome + ' (abre ' +
        (contato.tipo === 'whatsapp' ? 'o WhatsApp' : 'o Instagram') + ' em nova aba)');
      li.appendChild(botao);

      listaPlanos.appendChild(li);
    });
  }

  // ---------------- Portfólio (só projetos reais) ----------------
  var projetos = (config.portfolio && config.portfolio.projetos) || [];
  var secaoPortfolio = $('[data-secao-portfolio]');
  var listaPortfolio = $('[data-lista-portfolio]');
  if (secaoPortfolio && listaPortfolio && projetos.length > 0) {
    projetos.forEach(function (p) {
      var li = criar('li', 'projeto');
      if (p.imagem) {
        var img = criar('img');
        img.src = p.imagem;
        img.alt = p.alt || ('Site criado para ' + p.nome);
        img.loading = 'lazy';
        img.width = 800;
        img.height = 600;
        li.appendChild(img);
      }
      var info = criar('div', 'projeto__info');
      info.appendChild(criar('h3', 'projeto__nome', p.nome));
      if (p.segmento) info.appendChild(criar('p', 'projeto__segmento', p.segmento));
      if (p.url) info.appendChild(linkExterno(p.url, 'projeto__link', ['Ver site']));
      li.appendChild(info);
      listaPortfolio.appendChild(li);
    });
    secaoPortfolio.hidden = false;
  }

  // ---------------- Depoimentos (só reais) ----------------
  var depoimentos = config.depoimentos || [];
  var secaoDepoimentos = $('[data-secao-depoimentos]');
  var listaDepoimentos = $('[data-lista-depoimentos]');
  if (secaoDepoimentos && listaDepoimentos && depoimentos.length > 0) {
    depoimentos.forEach(function (d) {
      var li = criar('li', 'depoimento');
      var citacao = criar('blockquote');
      citacao.appendChild(criar('p', 'depoimento__texto', '“' + d.texto + '”'));
      li.appendChild(citacao);
      li.appendChild(criar('p', 'depoimento__autor', d.nome));
      if (d.negocio) li.appendChild(criar('p', 'depoimento__negocio', d.negocio));
      listaDepoimentos.appendChild(li);
    });
    secaoDepoimentos.hidden = false;
  }

  // ---------------- Garantias ----------------
  var iconesGarantia = ['escudo', 'olho', 'ajuste', 'devolver'];
  var listaGarantias = $('[data-lista-garantias]');
  if (listaGarantias) {
    config.garantias.forEach(function (g, i) {
      var li = criar('li', 'garantia');
      li.appendChild(icone(iconesGarantia[i % iconesGarantia.length]));
      li.appendChild(criar('h3', 'garantia__titulo', g.titulo));
      li.appendChild(criar('p', 'garantia__texto', g.texto));
      listaGarantias.appendChild(li);
    });
  }

  // ---------------- FAQ ----------------
  var listaFaq = $('[data-lista-faq]');
  if (listaFaq) {
    config.faq.forEach(function (item) {
      var det = criar('details', 'faq__item');
      det.appendChild(criar('summary', 'faq__pergunta', item.pergunta));
      det.appendChild(criar('p', 'faq__resposta', item.resposta));
      listaFaq.appendChild(det);
    });
  }

  // ---------------- CTA final ----------------
  var contatoPrincipal = linkContato();
  var linkCta = $('[data-link-contato]');
  if (linkCta) {
    linkCta.href = contatoPrincipal.href;
    var rotulo = $('[data-contato-rotulo]', linkCta);
    if (rotulo) rotulo.textContent = contatoPrincipal.rotulo;
    var useCta = $('[data-contato-icone] use', linkCta);
    if (useCta) useCta.setAttribute('href', '#i-' + contatoPrincipal.tipo);
  }

  // ---------------- Rodapé ----------------
  var listaContatos = $('[data-lista-contatos]');
  if (listaContatos) {
    if (config.contato.whatsapp) {
      var liZap = criar('li');
      liZap.appendChild(linkExterno(linkContato().href, null, [icone('whatsapp'), 'WhatsApp']));
      listaContatos.insertBefore(liZap, listaContatos.firstChild);
    }
    if (config.contato.email) {
      var liEmail = criar('li');
      var aEmail = criar('a');
      aEmail.href = 'mailto:' + config.contato.email;
      aEmail.appendChild(icone('email'));
      aEmail.appendChild(document.createTextNode(config.contato.email));
      liEmail.appendChild(aEmail);
      listaContatos.appendChild(liEmail);
    }
  }

  var ano = $('[data-ano]');
  if (ano) ano.textContent = String(new Date().getFullYear());

  var dadosEmpresa = $('[data-dados-empresa]');
  if (dadosEmpresa) {
    var e = config.empresa;
    var partes = [e.razaoSocial, e.cnpj ? 'CNPJ ' + e.cnpj : '', e.cidade].filter(Boolean);
    if (partes.length) {
      dadosEmpresa.textContent = partes.join(' · ');
      dadosEmpresa.hidden = false;
    }
  }
})();
