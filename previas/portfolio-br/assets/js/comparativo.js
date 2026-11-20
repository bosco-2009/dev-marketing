/*
 * comparativo.js — comparativo de planos em planos.html (#comparativo).
 * Linhas em config.comparativo; colunas, preço e prazo em config.planos.
 * Celular: abas acessíveis (padrão ARIA tabs: setas, Home/End). A partir de 48rem: tabela com cabeçalhos.
 * "Escolher este plano" marca o plano no formulário de contratação (planos.js) e leva o foco até ele.
 * Sem JavaScript a seção fica oculta. Todo texto entra por textContent.
 */
(function () {
  'use strict';
  var config = window.PBR_CONFIG;
  var secao = document.querySelector('[data-comparativo]');
  if (!config || !secao || !config.comparativo || !config.comparativo.length || !config.planos || !config.planos.length) return;

  var planos = config.planos;
  var abasCaixa = secao.querySelector('[data-comparativo-abas]');
  var tabelaCaixa = secao.querySelector('[data-comparativo-tabela]');
  var formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var SVG = 'http://www.w3.org/2000/svg';

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function icone(nome) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#' + nome);
    svg.appendChild(use);
    return svg;
  }
  function preco(p) { return formato.format(p.precoCentavos / 100); }
  function prazo(p) { return (p.prazo || '').replace(/^Entrega em até/i, 'Até').replace(/ após o briefing$/i, ''); }

  // Valor de uma célula: ícone + texto oculto (true/false) ou o próprio texto
  function valor(v) {
    var s = el('span', 'comparativo__valor');
    if (v === true) {
      s.classList.add('comparativo__valor--sim');
      s.appendChild(icone('i-check'));
      s.appendChild(el('span', 'visualmente-oculto', 'Incluído'));
    } else if (v === false || v == null) {
      s.classList.add('comparativo__valor--nao');
      s.appendChild(icone('i-traco'));
      s.appendChild(el('span', 'visualmente-oculto', 'Não incluído'));
    } else {
      s.textContent = String(v);
    }
    return s;
  }

  function botaoEscolher(p) {
    var b = el('button', 'botao ' + (p.destaque ? 'botao--primario' : 'botao--contorno') + ' botao--pequeno comparativo__escolher');
    b.type = 'button';
    b.textContent = 'Escolher o ' + p.nome;
    b.setAttribute('data-escolher-plano', p.id);
    return b;
  }

  // Linhas fixas (preço e prazo) + linhas do config
  var linhas = [
    { recurso: 'Preço (pagamento único)', valores: planos.reduce(function (o, p) { o[p.id] = preco(p); return o; }, {}) },
    { recurso: 'Prazo de entrega após o briefing', valores: planos.reduce(function (o, p) { o[p.id] = prazo(p); return o; }, {}) }
  ].concat(config.comparativo);

  // ------------------------------------------------------------ tabela (≥ 48rem)
  var tabela = el('table', 'tabela-comparativa');
  var legenda = el('caption', 'visualmente-oculto', 'Comparativo dos planos: o que cada um inclui');
  tabela.appendChild(legenda);
  var thead = el('thead');
  var tr = el('tr');
  var canto = el('td', 'tabela-comparativa__canto');
  tr.appendChild(canto);
  planos.forEach(function (p) {
    var th = el('th', 'tabela-comparativa__plano' + (p.destaque ? ' tabela-comparativa__plano--destaque' : ''));
    th.scope = 'col';
    if (p.destaque && p.selo) th.appendChild(el('span', 'tabela-comparativa__selo', p.selo));
    th.appendChild(el('span', 'tabela-comparativa__nome', p.nome));
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  tabela.appendChild(thead);
  var tbody = el('tbody');
  linhas.forEach(function (l) {
    var linha = el('tr');
    var th = el('th', null, l.recurso);
    th.scope = 'row';
    linha.appendChild(th);
    planos.forEach(function (p) {
      var td = el('td', p.destaque ? 'tabela-comparativa__destaque' : null);
      td.appendChild(valor(l.valores[p.id]));
      linha.appendChild(td);
    });
    tbody.appendChild(linha);
  });
  var acoes = el('tr', 'tabela-comparativa__acoes');
  var vazio = el('td');
  acoes.appendChild(vazio);
  planos.forEach(function (p) {
    var td = el('td', p.destaque ? 'tabela-comparativa__destaque' : null);
    td.appendChild(botaoEscolher(p));
    acoes.appendChild(td);
  });
  tbody.appendChild(acoes);
  tabela.appendChild(tbody);
  tabelaCaixa.appendChild(tabela);

  // ------------------------------------------------------------ abas (celular)
  var lista = el('div', 'comparativo__lista-abas');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', 'Planos');
  var abas = [];
  var paineis = [];
  planos.forEach(function (p, i) {
    var aba = el('button', 'comparativo__aba', p.nome);
    aba.type = 'button';
    aba.id = 'comparativo-aba-' + p.id;
    aba.setAttribute('role', 'tab');
    aba.setAttribute('aria-controls', 'comparativo-painel-' + p.id);
    aba.setAttribute('data-aba', String(i));
    lista.appendChild(aba);
    abas.push(aba);

    var painel = el('div', 'comparativo__painel' + (p.destaque ? ' comparativo__painel--destaque' : ''));
    painel.id = 'comparativo-painel-' + p.id;
    painel.setAttribute('role', 'tabpanel');
    painel.setAttribute('aria-labelledby', aba.id);
    painel.tabIndex = 0;
    var topo = el('p', 'comparativo__painel-topo');
    topo.appendChild(el('span', 'comparativo__painel-nome', 'Plano ' + p.nome));
    if (p.destaque && p.selo) topo.appendChild(el('span', 'tabela-comparativa__selo', p.selo));
    painel.appendChild(topo);
    var itens = el('ul', 'comparativo__itens');
    itens.setAttribute('role', 'list');
    linhas.forEach(function (l) {
      var v = l.valores[p.id];
      var li = el('li', 'comparativo__item' + (v === false || v == null ? ' comparativo__item--nao' : ''));
      li.appendChild(el('span', 'comparativo__recurso', l.recurso));
      li.appendChild(valor(v));
      itens.appendChild(li);
    });
    painel.appendChild(itens);
    painel.appendChild(botaoEscolher(p));
    paineis.push(painel);
  });
  abasCaixa.appendChild(lista);
  paineis.forEach(function (p) { abasCaixa.appendChild(p); });

  function selecionar(i, focar) {
    abas.forEach(function (a, j) {
      var ativa = i === j;
      a.setAttribute('aria-selected', ativa ? 'true' : 'false');
      a.tabIndex = ativa ? 0 : -1;
      paineis[j].hidden = !ativa;
    });
    if (focar) abas[i].focus();
  }
  lista.addEventListener('click', function (e) {
    var a = e.target.closest('[role="tab"]');
    if (a) selecionar(Number(a.getAttribute('data-aba')), false);
  });
  lista.addEventListener('keydown', function (e) {
    var atual = abas.indexOf(document.activeElement);
    if (atual < 0) return;
    var n = abas.length;
    var proxima = { ArrowRight: (atual + 1) % n, ArrowLeft: (atual - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima == null) return;
    e.preventDefault();
    selecionar(proxima, true);
  });

  // Aba inicial: plano marcado no formulário, senão o destaque
  var marcado = document.querySelector('input[name="plano"]:checked');
  var inicial = 0;
  planos.forEach(function (p, i) {
    if (marcado ? p.id === marcado.value : p.destaque) inicial = i;
  });
  selecionar(inicial, false);

  // "Escolher o plano": marca no formulário (avisando o planos.js) e leva o foco até a escolha
  secao.addEventListener('click', function (e) {
    var b = e.target.closest('[data-escolher-plano]');
    if (!b) return;
    var radio = document.querySelector('input[name="plano"][value="' + b.getAttribute('data-escolher-plano') + '"]');
    if (!radio) return;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    radio.focus();
    var reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    radio.closest('fieldset').scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
  });

  // Dúvida na escolha: WhatsApp com mensagem pronta do comparativo (só com número configurado; melhoria 24)
  var zap = window.PBR_whatsapp;
  var hrefZap = zap && zap.link('comparativo');
  if (hrefZap) {
    var duvida = el('p', 'comparativo__whats');
    duvida.appendChild(document.createTextNode('Ficou em dúvida entre os planos? '));
    duvida.appendChild(zap.criarLink(hrefZap, 'Pergunte no WhatsApp'));
    secao.querySelector('.container').appendChild(duvida);
  }

  secao.hidden = false;
  var link = document.querySelector('[data-link-comparativo]');
  if (link) link.hidden = false;
  // Chegou por planos.html#comparativo: a seção só aparece agora, depois que o navegador já tentou
  // rolar até a âncora; rola de novo quando a página termina de carregar
  if (location.hash === '#comparativo') {
    var rolar = function () { secao.scrollIntoView(); };
    if (document.readyState === 'complete') rolar(); else window.addEventListener('load', rolar, { once: true });
  }
})();
