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

  // ---------------- Foco no destino das âncoras (melhoria 107) ----------------
  // Um link interno (#como-funciona, planos.html#comparativo, "Pular para o conteúdo"...) rola até o destino, mas o
  // navegador só move o foco se o destino for focável: sem isso, o próximo Tab volta para o topo e o leitor de tela
  // não anuncia aonde se chegou. Destino sem foco próprio ganha tabindex="-1" só enquanto está focado (some no blur).
  // As perguntas do FAQ (#faq-...) abrem e focam o próprio <summary> no bloco do FAQ, abaixo.
  // A altura real do cabeçalho fixo vira --altura-topo (scroll-padding-top do <html>), para o destino nunca ficar
  // coberto por ele, nem com o texto ampliado a 200% (WCAG 1.4.4 e 2.4.11).
  var topo = $('.topo');
  function medirTopo() {
    if (!topo) return;
    var h = topo.getBoundingClientRect().height;
    // Sticky só conta enquanto fica preso no alto (no modo impressão o topo volta ao fluxo normal)
    if (h > 0 && getComputedStyle(topo).position === 'sticky') document.documentElement.style.setProperty('--altura-topo', Math.ceil(h) + 'px');
    else document.documentElement.style.removeProperty('--altura-topo');
  }
  if (topo) {
    medirTopo();
    if ('ResizeObserver' in window) new ResizeObserver(medirTopo).observe(topo);
    else window.addEventListener('resize', medirTopo);
  }

  function destinoDoHash(hash) {
    if (!hash || hash.length < 2) return null;
    var id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) { return null; }
    if (id.indexOf('faq-') === 0) return null;
    var alvo = document.getElementById(id);
    if (!alvo || alvo.closest('[hidden], [inert], [aria-hidden="true"]')) return null;
    return alvo;
  }
  function focarDestino(alvo) {
    if (!alvo || document.activeElement === alvo) return;
    if (alvo.tabIndex < 0 && !alvo.hasAttribute('tabindex')) {
      alvo.setAttribute('tabindex', '-1');
      alvo.setAttribute('data-foco-ancora', '');
      alvo.addEventListener('blur', function () {
        alvo.removeAttribute('tabindex');
        alvo.removeAttribute('data-foco-ancora');
      }, { once: true });
    }
    alvo.focus({ preventScroll: true }); // a rolagem é do navegador (ou do chegarNoHash)
  }
  // Clique (ou Enter) num link para um ponto desta mesma página: o navegador rola (com o scroll-padding-top) e,
  // logo depois, o foco vai para o destino sem rolar de novo.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    var alvo = destinoDoHash(url.hash);
    if (!alvo) return;
    setTimeout(function () { focarDestino(alvo); }, 0);
  });
  // Chegada de outra página com #destino (ex.: index.html#duvidas) e voltar/avançar no histórico
  var focarHashAtual = function () { focarDestino(destinoDoHash(location.hash)); };
  // Na chegada, o navegador rola até o destino antes de o JS montar o resto da página (planos, FAQ, simulador...),
  // e o destino pode acabar mais abaixo: com a página pronta, alinha de novo (instantâneo) e foca.
  var chegarNoHash = function () {
    var alvo = destinoDoHash(location.hash);
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'start', behavior: 'instant' });
    focarDestino(alvo);
  };
  if (document.readyState === 'complete') chegarNoHash(); else window.addEventListener('load', chegarNoHash, { once: true });
  window.addEventListener('hashchange', focarHashAtual);

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
      // De onde veio o clique (melhoria 110): "home/planos", vindo de data-origem-planos da lista
      var origemPlanos = listaPlanos.getAttribute('data-origem-planos');
      if (origemPlanos) botao.setAttribute('data-origem-cta', origemPlanos);
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

  // ---------------- Planos em resumo na 404 (melhoria 86) ----------------
  // Só nome e preço de config.planos; os links usam o endereço absoluto de data-planos-404
  // (a 404 do GitHub Pages responde em qualquer caminho, então links relativos quebrariam).
  var planos404 = $('[data-planos-404]');
  var lista404 = planos404 && $('[data-planos-404-lista]', planos404);
  if (lista404 && (config.planos || []).length) {
    var base404 = planos404.getAttribute('data-planos-404');
    config.planos.forEach(function (plano) {
      var li = criar('li', 'planos-404__item' + (plano.destaque ? ' planos-404__item--destaque' : ''));
      var link = criar('a', 'planos-404__link');
      link.href = base404 + '?plano=' + encodeURIComponent(plano.id);
      var origem404 = planos404.getAttribute('data-origem-planos'); // "erro/404" (melhoria 110)
      if (origem404) link.setAttribute('data-origem-cta', origem404);
      link.appendChild(criar('span', 'planos-404__nome', plano.nome));
      link.appendChild(criar('span', 'planos-404__preco', formatarPreco(plano.precoCentavos)));
      link.appendChild(icone('seta'));
      li.appendChild(link);
      lista404.appendChild(li);
    });
    planos404.hidden = false;
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
  // Desempenho (melhoria 64): em portfolio.html a 1ª foto fica acima da dobra e é o elemento LCP da página,
  // então ela é pedida já (eager) e com fetchpriority="high"; todas as outras (e as da home) ficam lazy.
  var ehPaginaPortfolio = /(^|\/)portfolio\.html$/.test(location.pathname);
  function prioridadeFoto(img, indice) {
    if (ehPaginaPortfolio && indice === 0) {
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
    } else {
      img.loading = 'lazy';
    }
    img.decoding = 'async';
  }
  function fotoResponsiva(p, indice) {
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
    prioridadeFoto(img, indice);
    picture.appendChild(img);
    return picture;
  }

  var secaoPortfolio = $('[data-secao-portfolio]');
  var listaPortfolio = $('[data-lista-portfolio]');
  if (secaoPortfolio && listaPortfolio && projetos.length > 0) {
    projetos.forEach(function (p, indice) {
      var li = criar('li', 'projeto');
      if (p.foto && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.foto)) {
        li.appendChild(fotoResponsiva(p, indice));
      } else if (p.imagem) {
        var img = criar('img');
        img.src = p.imagem;
        img.alt = p.alt || ('Site criado para ' + p.nome);
        prioridadeFoto(img, indice);
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

    // Dados estruturados do portfólio (melhoria 61): só em portfolio.html e só com projetos REAIS do config.js.
    // Sem projetos, nenhum JSON-LD de projeto existe (nada inventado), e sem avaliações.
    var canonicalPortfolio = document.querySelector('link[rel="canonical"]');
    if (canonicalPortfolio && /\/portfolio\.html$/.test(canonicalPortfolio.href) && config.site && config.site.url) {
      var urlBase = config.site.url.replace(/\/?$/, '/');
      var ldPortfolio = document.createElement('script');
      ldPortfolio.type = 'application/ld+json';
      ldPortfolio.setAttribute('data-ld-portfolio', '');
      ldPortfolio.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': canonicalPortfolio.href + '#pagina',
        url: canonicalPortfolio.href,
        name: 'Portfólio',
        inLanguage: 'pt-BR',
        isPartOf: { '@id': urlBase + '#site' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: projetos.length,
          itemListElement: projetos.map(function (p, i) {
            var obra = { '@type': 'CreativeWork', name: p.nome, creator: { '@id': urlBase + '#organizacao' } };
            if (p.segmento) obra.genre = p.segmento;
            if (p.url && /^https:\/\//.test(p.url)) obra.url = p.url;
            return { '@type': 'ListItem', position: i + 1, item: obra };
          })
        }
      });
      document.head.appendChild(ldPortfolio);
    }
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

  // ---------------- Plano indicado no fim de artigos e segmentos (melhoria 65) ----------------
  // O bloco já vem pronto no HTML (gravado por testes/conteudo/indicado.mjs). Aqui só se confere com o
  // config.js, para uma mudança de nome/resumo/regra valer mesmo antes de o HTML ser gravado de novo.
  document.querySelectorAll('[data-indicado]').forEach(function (bloco) {
    var id = (config.planoIndicado || {})[bloco.getAttribute('data-indicado')];
    var plano = id && (config.planos || []).filter(function (p) { return p.id === id; })[0];
    if (!plano) return; // sem regra válida, fica o que está no HTML
    bloco.querySelectorAll('[data-indicado-nome]').forEach(function (el) {
      if (el.textContent !== plano.nome) el.textContent = plano.nome;
    });
    var resumo = $('[data-indicado-resumo]', bloco);
    if (resumo && resumo.textContent !== plano.resumo) resumo.textContent = plano.resumo;
    var link = $('[data-indicado-link]', bloco);
    if (link && link.textContent !== 'Ver o plano ' + plano.nome) link.textContent = 'Ver o plano ' + plano.nome;
    if (link) link.setAttribute('href', link.getAttribute('href').replace(/\?plano=[^#&]*/, '?plano=' + encodeURIComponent(plano.id)));
  });

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
      // Confirmação visível e anunciada uma vez (melhoria 112); o rótulo do botão não muda
      var copiado = criar('span', 'aviso-temporario', '');
      copiado.setAttribute('role', 'status');
      copiado.setAttribute('data-faq-copiado', '');
      corpo.appendChild(copiado);
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
      var corpoFaq = b.parentNode;
      var feito = function (ok) {
        var regiao = corpoFaq.querySelector('[data-faq-copiado]');
        if (regiao && window.PBRAviso) window.PBRAviso.mostrar(regiao, ok ? 'Link copiado.' : 'Não deu para copiar: copie o endereço da barra.', corpoFaq);
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

    // Lista filtrada (planos.html): FAQPage só com as perguntas exibidas nesta página (melhoria 55).
    // A home tem o seu FAQPage completo no bloco de dados estruturados abaixo.
    if (filtroFaq && perguntasFaq.length && secaoFaq && secaoFaq.id && config.site && config.site.url) {
      var urlPagina = config.site.url.replace(/\/?$/, '/') + location.pathname.split('/').pop();
      var ldFaq = document.createElement('script');
      ldFaq.type = 'application/ld+json';
      ldFaq.setAttribute('data-ld-faq', '');
      ldFaq.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': urlPagina + '#' + secaoFaq.id,
        url: urlPagina,
        inLanguage: 'pt-BR',
        mainEntity: perguntasFaq.map(function (f) {
          return { '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } };
        })
      });
      document.head.appendChild(ldFaq);
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
    // Melhoria 80: só entra o que é real. Vazio, marcado [PROVISÓRIO] ou em formato inválido fica de fora.
    var real = function (v) {
      v = String(v == null ? '' : v).trim();
      return v && !/provis[óo]rio/i.test(v) ? v : '';
    };
    var org = { '@type': 'Organization', '@id': idOrg };
    if (real(config.site.nome)) org.name = real(config.site.nome);
    var email = real(config.contato.email);
    if (/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)) org.email = email;
    if (whatsDisponivel) {
      org.telephone = '+' + config.contato.whatsapp;
      org.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: org.telephone,
        availableLanguage: 'pt-BR',
        areaServed: 'BR'
      };
    }
    var instagram = real(config.contato.instagram).replace(/^@/, '');
    if (/^[\w.]{1,30}$/.test(instagram)) org.sameAs = ['https://www.instagram.com/' + instagram + '/'];
    if (real(config.empresa.razaoSocial)) org.legalName = real(config.empresa.razaoSocial);
    if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(real(config.empresa.cnpj))) org.taxID = real(config.empresa.cnpj);
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

/*
 * Impressão limpa (melhoria 77) — no papel o link não é clicável: antes de imprimir, cada link do conteúdo
 * ganha data-endereco-impresso com o endereço legível, que o @media print de main.css mostra entre parênteses.
 * Ficam de fora: âncoras da própria página, links cujo texto já é o endereço e os botões (somem na impressão).
 * Query e fragmento são cortados: no papel não vão códigos de pedido nem tokens.
 */
(function () {
  'use strict';
  function enderecoLegivel(link) {
    var url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch (e) { return ''; }
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return decodeURIComponent(url.pathname);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.origin === location.origin && url.pathname === location.pathname) return ''; // âncora desta página
    return (url.host + url.pathname).replace(/^www\./, '').replace(/\/$/, '');
  }
  function prepararImpressao() {
    var links = document.querySelectorAll('main a[href]:not(.botao)');
    for (var i = 0; i < links.length; i++) {
      var endereco = enderecoLegivel(links[i]);
      var texto = links[i].textContent.replace(/\s+/g, ' ').trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      if (endereco && texto !== endereco) links[i].setAttribute('data-endereco-impresso', endereco);
      else links[i].removeAttribute('data-endereco-impresso');
    }
  }
  window.addEventListener('beforeprint', prepararImpressao);
  window.PBRImpressao = { preparar: prepararImpressao };
})();

/*
 * Avisos temporários (melhoria 112, WCAG 2.2.1 e 4.1.3) — "Link copiado" e afins.
 * PBRAviso.mostrar(regiao, texto, area): escreve o texto numa região role="status" já existente no DOM (anunciada
 * uma vez; limpa e escreve no quadro seguinte para repetir o anúncio num novo clique) e o apaga depois de pelo menos
 * MIN_MS. Nunca some com o foco ou o ponteiro dentro de `area` (espera sair e confere de novo) e Esc com o foco em
 * `area` dispensa na hora. Devolve uma função que dispensa.
 */
(function () {
  'use strict';
  var MIN_MS = 6000;
  var RECHECAR_MS = 1000;
  var ativos = typeof WeakMap === 'function' ? new WeakMap() : null;

  function mostrar(regiao, texto, area, ms) {
    area = area || regiao;
    var anterior = ativos && ativos.get(regiao);
    if (anterior) anterior.cancelar();
    var timer = null;
    var encerrado = false;
    function soltar() {
      clearTimeout(timer);
      area.removeEventListener('keydown', aoTeclar);
      if (ativos && ativos.get(regiao) === controle) ativos.delete(regiao);
    }
    function dispensar() {
      if (encerrado) return;
      encerrado = true;
      soltar();
      regiao.textContent = '';
    }
    function conferir() {
      timer = null;
      if (encerrado) return;
      if (area.isConnected && (area.contains(document.activeElement) || area.matches(':hover'))) {
        timer = setTimeout(conferir, RECHECAR_MS);
        return;
      }
      dispensar();
    }
    function aoTeclar(e) {
      if (e.key === 'Escape' && regiao.textContent) { e.preventDefault(); dispensar(); }
    }
    var controle = { cancelar: function () { encerrado = true; soltar(); } };
    if (ativos) ativos.set(regiao, controle);
    area.addEventListener('keydown', aoTeclar);
    regiao.textContent = '';
    timer = setTimeout(function () {
      if (encerrado) return;
      regiao.textContent = texto;
      timer = setTimeout(conferir, Math.max(MIN_MS, ms || 0));
    }, 60);
    return dispensar;
  }

  window.PBRAviso = { mostrar: mostrar, MIN_MS: MIN_MS };
})();
