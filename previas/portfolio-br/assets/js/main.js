/*
 * main.js — comportamento da home.
 * - Lê window.PBR_CONFIG (config.js) e renderiza planos, garantias, FAQ, contatos,
 *   portfólio e depoimentos (estes dois só se houver itens reais).
 * - Menu móvel acessível e botão flutuante reservado para o chat (Fase 2).
 * Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  // As classes "sem-js" e "modo-rascunho" do <html> são definidas pelo inicio.js, antes da primeira pintura.

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

  // ---------------- WhatsApp contextual (melhoria 24) ----------------
  // Mensagem pronta conforme o contexto (plano, comparativo, artigo), montada com os modelos do config.js.
  // Sem número válido (vazio enquanto [PROVISÓRIO]), nenhum link é criado.
  var whatsDisponivel = /^\d{12,13}$/.test(String(config.contato.whatsapp || ''));

  function mensagemWhats(modelo, vars) {
    var modelos = config.contato.whatsappModelos || {};
    var texto = (modelo && modelos[modelo]) || config.contato.whatsappMensagem || '';
    return texto.replace(/\{(\w+)\}/g, function (_, chave) {
      return vars && vars[chave] != null ? String(vars[chave]) : '';
    }).replace(/\s+/g, ' ').trim();
  }

  function linkWhats(modelo, vars) {
    if (!whatsDisponivel) return null;
    return 'https://wa.me/' + config.contato.whatsapp + '?text=' + encodeURIComponent(mensagemWhats(modelo, vars));
  }

  function tituloPagina() {
    var h1 = document.querySelector('main h1');
    return h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Link da página atual (usado pelo chat fora do horário). A página declara o contexto em
  // <main data-whats-contexto="artigo|planos|segmento">; nas demais, vale a mensagem padrão.
  function linkWhatsDaPagina() {
    var marcador = document.querySelector('[data-whats-contexto]');
    var contexto = marcador && marcador.getAttribute('data-whats-contexto');
    if (contexto === 'artigo') return linkWhats('artigo', { pagina: tituloPagina() });
    // Páginas por segmento (melhoria 25): usa o modelo `segmento` se o dono criar um; sem ele, a mensagem padrão.
    if (contexto === 'segmento') return linkWhats('segmento', { pagina: tituloPagina() });
    if (contexto === 'planos') {
      var marcado = document.querySelector('input[name="plano"]:checked');
      var plano = marcado && config.planos.filter(function (p) { return p.id === marcado.value; })[0];
      return plano ? linkWhats('plano', { plano: plano.nome }) : linkWhats('comparativo');
    }
    return linkWhats(null);
  }

  // Link discreto "Tirar dúvidas no WhatsApp" (texto + ícone), usado nos cards e no comparativo.
  function criarLinkWhats(href, texto) {
    var a = criar('a', 'link-whats');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(icone('whatsapp'));
    a.appendChild(criar('span', null, texto));
    a.appendChild(criar('span', 'visualmente-oculto', ' (abre o WhatsApp em nova aba)'));
    return a;
  }

  window.PBR_whatsapp = {
    disponivel: whatsDisponivel,
    link: linkWhats,
    linkDaPagina: linkWhatsDaPagina,
    criarLink: criarLinkWhats
  };

  // Elementos estáticos <a data-whats="modelo" hidden>: recebem o link e aparecem só com número válido.
  document.querySelectorAll('a[data-whats]').forEach(function (a) {
    var href = linkWhats(a.getAttribute('data-whats'), { pagina: tituloPagina() });
    if (!href) return;
    a.href = href;
    a.hidden = false;
  });

  function linkExterno(href, classe, conteudo) {
    var a = criar('a', classe);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    conteudo.forEach(function (n) { a.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); });
    return a;
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

      // Leva à página de contratação com o plano pré-selecionado.
      var botao = criar('a', 'botao ' + (plano.destaque ? 'botao--primario' : 'botao--contorno'), 'Quero o plano ' + plano.nome);
      botao.href = 'planos.html?plano=' + encodeURIComponent(plano.id);
      li.appendChild(botao);

      var hrefWhats = linkWhats('plano', { plano: plano.nome });
      if (hrefWhats) {
        var duvida = criar('p', 'plano__whats');
        duvida.appendChild(criarLinkWhats(hrefWhats, 'Tirar dúvidas sobre o ' + plano.nome));
        li.appendChild(duvida);
      }

      listaPlanos.appendChild(li);
    });
  }

  // ---------------- Portfólio (só projetos reais) ----------------
  var projetos = (config.portfolio && config.portfolio.projetos) || [];
  // Links "Portfólio" do menu e do rodapé só aparecem com projetos reais.
  document.querySelectorAll('[data-link-portfolio]').forEach(function (l) { l.hidden = projetos.length === 0; });
  // portfolio.html: mensagem quando ainda não há projetos.
  var portfolioVazio = $('[data-portfolio-vazio]');
  if (portfolioVazio) portfolioVazio.hidden = projetos.length > 0;
  // Imagens responsivas (melhoria 21): geradas por testes/portfolio/gerar.py em
  // assets/img/portfolio/<foto>-<largura>.webp|png. WebP para quem suporta, PNG como reserva.
  var LARGURAS_PORTFOLIO = [480, 800, 1200];
  // Grade: 1 coluna no celular, 2 a partir de 40rem, 3 a partir de 64rem (container de 72rem).
  var TAMANHOS_PORTFOLIO = '(min-width: 64rem) min(23rem, 31vw), (min-width: 40rem) 46vw, 92vw';
  function fotoResponsiva(p) {
    var base = 'assets/img/portfolio/' + p.foto + '-';
    function lista(ext) {
      return LARGURAS_PORTFOLIO.map(function (l) { return base + l + '.' + ext + ' ' + l + 'w'; }).join(', ');
    }
    var picture = criar('picture', 'projeto__foto');
    var webp = criar('source');
    webp.type = 'image/webp';
    webp.srcset = lista('webp');
    webp.sizes = TAMANHOS_PORTFOLIO;
    picture.appendChild(webp);
    var img = criar('img');
    img.sizes = TAMANHOS_PORTFOLIO;
    img.srcset = lista('png');
    img.src = base + '800.png';
    img.alt = p.alt || ('Site criado para ' + p.nome);
    img.width = 1200;
    img.height = 900;
    img.loading = 'lazy';
    img.decoding = 'async';
    picture.appendChild(img);
    return picture;
  }

  var secaoPortfolio = $('[data-secao-portfolio]');
  var listaPortfolio = $('[data-lista-portfolio]');
  if (secaoPortfolio && listaPortfolio && projetos.length > 0) {
    projetos.forEach(function (p) {
      var li = criar('li', 'projeto');
      if (p.foto && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.foto)) {
        li.appendChild(fotoResponsiva(p));
      } else if (p.imagem) {
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

  // ---------------- Como funciona: prazos da linha do tempo ----------------
  // Os números vêm de config.planos[].prazo e config.legal; os textos, de config.comoFunciona.prazos.
  // Se faltar um dado, o rótulo daquele passo continua oculto (nunca mostra prazo inventado).
  var rotulosPrazo = (config.comoFunciona && config.comoFunciona.prazos) || {};
  var diasPlanos = [];
  (config.planos || []).forEach(function (p) {
    var m = /(\d+)\s*dias?\s+úte/i.exec(p.prazo || '');
    if (m && diasPlanos.indexOf(+m[1]) === -1) diasPlanos.push(+m[1]);
  });
  diasPlanos.sort(function (a, b) { return a - b; });
  var valoresPrazo = {
    dias: diasPlanos.length < 2 ? (diasPlanos.length ? String(diasPlanos[0]) : null)
      : diasPlanos.slice(0, -1).join(', ') + ' ou ' + diasPlanos[diasPlanos.length - 1],
    suporte: config.legal && config.legal.suportePosEntregaDias ? String(config.legal.suportePosEntregaDias) : null
  };
  document.querySelectorAll('[data-passo-prazo]').forEach(function (el) {
    var modelo = rotulosPrazo[el.getAttribute('data-passo-prazo')];
    if (!modelo) return;
    var faltou = false;
    var texto = modelo.replace(/\{(\w+)\}/g, function (_, chave) {
      if (!valoresPrazo[chave]) faltou = true;
      return valoresPrazo[chave] || '';
    });
    if (faltou) return;
    el.textContent = texto;
    el.hidden = false;
  });

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

  // ---------------- FAQ (melhoria 13: links diretos #faq-..., busca e FAQPage no JSON-LD) ----------------
  function normalizar(t) {
    return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function slug(t) {
    return normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  }
  var listaFaq = $('[data-lista-faq]');
  var itensFaq = [];
  if (listaFaq) {
    var usados = {};
    // data-faq-filtro="checkout" (planos.html): só as perguntas marcadas com checkout: true no config.js
    var filtroFaq = listaFaq.getAttribute('data-faq-filtro');
    var perguntasFaq = (config.faq || []).filter(function (item) { return !filtroFaq || item[filtroFaq] === true; });
    var secaoFaq = listaFaq.closest('[data-faq-secao]');
    if (secaoFaq) secaoFaq.hidden = !perguntasFaq.length;
    perguntasFaq.forEach(function (item) {
      var id = 'faq-' + (slug(item.pergunta) || 'pergunta');
      while (usados[id]) id += '-2';
      usados[id] = true;
      var det = criar('details', 'faq__item');
      det.id = id;
      det.appendChild(criar('summary', 'faq__pergunta', item.pergunta));
      var corpo = criar('div', 'faq__corpo');
      corpo.appendChild(criar('p', 'faq__resposta', item.resposta));
      var copiar = criar('button', 'faq__copiar', 'Copiar link');
      copiar.type = 'button';
      copiar.setAttribute('data-faq-copiar', id);
      copiar.setAttribute('aria-label', 'Copiar link desta pergunta: ' + item.pergunta);
      corpo.appendChild(copiar);
      det.appendChild(corpo);
      listaFaq.appendChild(det);
      itensFaq.push({ el: det, texto: normalizar(item.pergunta + ' ' + item.resposta + ' ' + (item.palavras || '')) });
    });

    // Abrir a pergunta do link (#faq-...): na carga (a lista só existe agora) e quando o hash muda
    var abrirDoHash = function () {
      var alvo = location.hash.indexOf('#faq-') === 0 && document.getElementById(location.hash.slice(1));
      if (!alvo || !listaFaq.contains(alvo)) return;
      alvo.hidden = false;
      alvo.open = true;
      alvo.scrollIntoView({ block: 'start', behavior: 'instant' });
      var s = alvo.querySelector('summary');
      if (s) s.focus({ preventScroll: true });
    };
    if (document.readyState === 'complete') abrirDoHash(); else window.addEventListener('load', abrirDoHash, { once: true });
    window.addEventListener('hashchange', abrirDoHash);

    // Ao abrir uma pergunta, o endereço passa a apontar para ela (sem rolar nem criar histórico)
    listaFaq.addEventListener('toggle', function (e) {
      if (e.target.open && e.target.id && history.replaceState) history.replaceState(null, '', '#' + e.target.id);
    }, true);

    listaFaq.addEventListener('click', function (e) {
      var b = e.target.closest('[data-faq-copiar]');
      if (!b) return;
      var url = location.href.split('#')[0] + '#' + b.getAttribute('data-faq-copiar');
      var feito = function (ok) {
        b.textContent = ok ? 'Link copiado' : 'Copie o endereço da barra';
        setTimeout(function () { b.textContent = 'Copiar link'; }, 2500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { feito(true); }, function () { feito(false); });
      else feito(false);
    });

    // Busca: ignora acentos e maiúsculas; procura na pergunta, na resposta e nas palavras extras do config.js
    var caixaBusca = $('[data-faq-busca]');
    var entrada = $('[data-faq-entrada]');
    if (caixaBusca && entrada && itensFaq.length > 3) {
      var resultado = $('[data-faq-resultado]');
      var vazio = $('[data-faq-vazio]');
      var timer = null;
      var buscar = function () {
        var termos = normalizar(entrada.value).split(/\s+/).filter(Boolean);
        var achados = 0;
        itensFaq.forEach(function (it) {
          var bate = termos.every(function (t) { return it.texto.indexOf(t) !== -1; });
          it.el.hidden = !bate;
          if (bate) achados++;
          // abre o que a busca achou (e fecha o que ela mesma abriu quando a busca muda)
          if (termos.length && bate && !it.el.open) { it.el.open = true; it.el.setAttribute('data-aberto-pela-busca', ''); }
          if ((!termos.length || !bate) && it.el.hasAttribute('data-aberto-pela-busca')) { it.el.open = false; it.el.removeAttribute('data-aberto-pela-busca'); }
        });
        resultado.textContent = !termos.length ? '' : achados === 0 ? 'Nenhuma pergunta encontrada.'
          : achados === 1 ? '1 pergunta encontrada.' : achados + ' perguntas encontradas.';
        vazio.hidden = !(termos.length && achados === 0);
      };
      entrada.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(buscar, 150); });
      entrada.addEventListener('search', buscar);
      var botaoChat = $('[data-faq-chat]');
      botaoChat.addEventListener('click', function () {
        var lancador = document.querySelector('.chat__lancador');
        if (lancador) lancador.click();
        else if (config.contato.whatsapp) window.open(linkContato().href, '_blank', 'noopener');
      });
      caixaBusca.hidden = false;
    }
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

  // ---------------- Dados estruturados (só na home) ----------------
  // O JSON-LD fixo do index.html tem Organization e WebSite. Aqui entram, a partir do config.js,
  // o Service com as ofertas (planos e preços) e os contatos reais. Sem avaliações nem números inventados.
  if (listaPlanos && config.site && config.site.url) {
    var urlSite = config.site.url.replace(/\/?$/, '/');
    var idOrg = urlSite + '#organizacao';
    var org = { '@type': 'Organization', '@id': idOrg };
    if (config.contato.email) org.email = config.contato.email;
    if (config.contato.whatsapp) org.telephone = '+' + config.contato.whatsapp;
    if (config.empresa.razaoSocial) org.legalName = config.empresa.razaoSocial;
    if (config.empresa.cnpj) org.taxID = config.empresa.cnpj;
    var servico = {
      '@type': 'Service',
      '@id': urlSite + '#servico',
      name: 'Criação de sites profissionais para pequenos negócios',
      serviceType: 'Criação de sites',
      provider: { '@id': idOrg },
      areaServed: { '@type': 'Country', name: 'Brasil' },
      url: urlSite + 'planos.html',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Planos',
        itemListElement: config.planos.map(function (p) {
          return {
            '@type': 'Offer',
            name: 'Plano ' + p.nome,
            description: p.resumo,
            price: (p.precoCentavos / 100).toFixed(2),
            priceCurrency: 'BRL',
            url: urlSite + 'planos.html?plano=' + encodeURIComponent(p.id),
            availability: 'https://schema.org/InStock'
          };
        })
      }
    };
    var ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-ld-servico', '');
    var grafo = [org, servico];
    if (config.faq && config.faq.length) {
      grafo.push({
        '@type': 'FAQPage',
        '@id': urlSite + '#duvidas',
        mainEntity: config.faq.map(function (f) {
          return { '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } };
        })
      });
    }
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': grafo });
    document.head.appendChild(ld);
  }
})();

/*
 * Pré-carregamento dos próximos passos (melhoria 28).
 * Ao passar o mouse (com pequena espera), focar ou tocar num link para planos.html ou exemplos.html,
 * cria UMA vez um <link rel="prefetch"> para a página, para o clique abrir quase na hora.
 * Não pré-carrega com "Economia de dados" (Save-Data) nem em conexões 2g/lentas.
 */
(function () {
  'use strict';

  var PAGINAS = /\/(planos|exemplos)\.html$/;
  var ESPERA_MOUSE_MS = 65;
  var feitos = {};

  function conexaoPermite() {
    var c = navigator.connection;
    if (!c) return true;
    if (c.saveData) return false;
    return !/(^|-)2g$/.test(c.effectiveType || '');
  }

  function suportaPrefetch() {
    var l = document.createElement('link');
    return !!(l.relList && l.relList.supports && l.relList.supports('prefetch'));
  }
  if (!suportaPrefetch()) return;

  function destino(link) {
    if (!link || !link.href || link.target === '_blank' || link.hasAttribute('download')) return null;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin || !PAGINAS.test(url.pathname)) return null;
    if (url.pathname === location.pathname) return null;
    return url.origin + url.pathname; // sem #âncora nem ?busca: a página é a mesma
  }

  function preCarregar(link) {
    var url = destino(link);
    if (!url || feitos[url] || !conexaoPermite()) return;
    feitos[url] = true;
    var el = document.createElement('link');
    el.rel = 'prefetch';
    el.href = url;
    el.setAttribute('data-prefetch', '');
    document.head.appendChild(el);
  }

  function linkDo(evento) {
    var alvo = evento.target;
    return alvo && alvo.closest ? alvo.closest('a[href]') : null;
  }

  var timer = null;
  document.addEventListener('mouseover', function (e) {
    var link = linkDo(e);
    if (!link || !destino(link)) return;
    clearTimeout(timer);
    timer = setTimeout(function () { preCarregar(link); }, ESPERA_MOUSE_MS);
  }, { passive: true });
  document.addEventListener('mouseout', function (e) {
    if (linkDo(e)) clearTimeout(timer);
  }, { passive: true });
  document.addEventListener('focusin', function (e) { preCarregar(linkDo(e)); });
  document.addEventListener('touchstart', function (e) { preCarregar(linkDo(e)); }, { passive: true });
})();

/*
 * PBRRede (melhoria 53) — falhas de conexão com mensagem clara, sem perder o que foi digitado.
 *   PBRRede.offline()        -> true quando o navegador diz que está sem internet
 *   PBRRede.falhaDeRede(err) -> true se o erro foi falta de conexão (e não uma recusa do servidor)
 *   PBRRede.aoVoltar(fn)     -> chama fn quando a conexão volta (evento "online"); devolve uma função que cancela
 * Usado por planos.js, briefing.js, pedido.js e chat.js.
 */
(function () {
  'use strict';
  function offline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  function falhaDeRede(err) {
    if (offline()) return true;
    if (!err) return false;
    // fetch() rejeita com TypeError quando não há conexão (Chrome: "Failed to fetch"; Firefox: "NetworkError…";
    // Safari: "Load failed"); o supabase-js repassa a mesma mensagem. Outros TypeError (erros de código) não contam.
    var m = String(err.message || err.msg || err || '');
    return /Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(m);
  }
  function aoVoltar(fn) {
    window.addEventListener('online', fn);
    return function () { window.removeEventListener('online', fn); };
  }
  window.PBRRede = { offline: offline, falhaDeRede: falhaDeRede, aoVoltar: aoVoltar };
})();
