/*
 * admin-respostas.js — respostas rápidas no chat do painel (/admin/).
 * Modelos (saudação, preços, prazos, pedir WhatsApp...) que se inserem com um clique na caixa de resposta,
 * na posição do cursor, SEM enviar. Editáveis num <dialog> e salvos só no localStorage deste navegador.
 * Os padrões usam preços e prazos do config.js, então acompanham as mudanças de plano.
 * {nome} vira o primeiro nome do visitante (ou some, quando ele não informou o nome).
 */
(function () {
  'use strict';
  var config = window.PBR_CONFIG || {};
  var caixa = document.querySelector('[data-rapidas]');
  var texto = document.querySelector('[data-resposta-texto]');
  var dialogo = document.querySelector('[data-rapidas-dialogo]');
  if (!caixa || !texto || !dialogo) return;

  var CHAVE = 'pbr_admin_respostas_v1';
  var MAX_ITENS = 12;
  var MAX_TITULO = 30;
  var MAX_TEXTO = Number(texto.getAttribute('maxlength')) || 2000;

  var lista = caixa.querySelector('[data-rapidas-lista]');
  var botaoEditar = caixa.querySelector('[data-rapidas-editar]');
  var form = dialogo.querySelector('[data-rapidas-form]');
  var itensEl = dialogo.querySelector('[data-rapidas-itens]');
  var erro = dialogo.querySelector('[data-rapidas-erro]');
  var nomeConversa = document.querySelector('[data-conversa-nome]');

  var real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var planos = config.planos || [];
  var siteUrl = (config.site && config.site.url) || '';

  function juntar(partes) {
    if (partes.length < 2) return partes.join('');
    return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
  }

  function padroes() {
    var lst = [
      { titulo: 'Saudação', texto: 'Olá, {nome}! Obrigado por falar com a ' + ((config.site && config.site.nome) || 'gente') + '. Como posso ajudar?' }
    ];
    if (planos.length) {
      lst.push({
        titulo: 'Preços',
        texto: 'Nossos planos têm pagamento único: ' + juntar(planos.map(function (p) { return p.nome + ' (' + real.format(p.precoCentavos / 100) + ')'; })) +
          '.' + (siteUrl ? ' Dá para comparar tudo o que cada um inclui aqui: ' + siteUrl + 'planos.html#comparativo' : '')
      });
      var comPrazo = planos.filter(function (p) { return p.prazo; });
      if (comPrazo.length) {
        lst.push({
          titulo: 'Prazos',
          texto: 'Os prazos contam a partir do briefing preenchido: ' + juntar(comPrazo.map(function (p) {
            return p.nome + ', ' + p.prazo.replace(/^Entrega em /i, '').replace(/ após o briefing$/i, '');
          })) + '.'
        });
      }
    }
    lst.push({ titulo: 'Pedir WhatsApp', texto: 'Pode me passar seu WhatsApp com DDD? Assim eu continuo o atendimento por lá e te mando os detalhes.' });
    lst.push({ titulo: 'Encerrar', texto: 'Fico à disposição, {nome}! Se surgir qualquer dúvida, é só chamar por aqui.' });
    return lst;
  }

  function valido(item) {
    return item && typeof item.titulo === 'string' && typeof item.texto === 'string' && item.titulo.trim() && item.texto.trim();
  }
  function limpar(item) {
    return { titulo: item.titulo.trim().slice(0, MAX_TITULO), texto: item.texto.trim().slice(0, MAX_TEXTO) };
  }
  function carregar() {
    try {
      var salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (Array.isArray(salvo)) return salvo.filter(valido).slice(0, MAX_ITENS).map(limpar);
    } catch (e) { /* localStorage bloqueado ou JSON inválido: usa os padrões */ }
    return padroes();
  }
  function salvar(itens) {
    try { localStorage.setItem(CHAVE, JSON.stringify(itens)); return true; } catch (e) { return false; }
  }

  var respostas = carregar();

  // ------------------------------------------------------------ inserir na resposta
  function primeiroNome() {
    var n = nomeConversa ? nomeConversa.textContent.trim() : '';
    if (!n || /^Visitante [0-9A-F]{4}$/.test(n)) return '';
    return n.split(/\s+/)[0];
  }
  function preencher(modelo) {
    var nome = primeiroNome();
    return nome ? modelo.replace(/\{nome\}/g, nome) : modelo.replace(/,?[ \t]*\{nome\}/g, '');
  }
  function inserir(modelo) {
    var t = preencher(modelo);
    var ini = texto.selectionStart == null ? texto.value.length : texto.selectionStart;
    var fim = texto.selectionEnd == null ? ini : texto.selectionEnd;
    var antes = texto.value.slice(0, ini);
    if (antes && !/\s$/.test(antes)) t = ' ' + t;
    var cabe = MAX_TEXTO - (texto.value.length - (fim - ini));
    if (cabe <= 0) return;
    texto.focus();
    texto.setRangeText(t.slice(0, cabe), ini, fim, 'end');
    texto.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderizarLista() {
    lista.textContent = '';
    respostas.forEach(function (r, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'admin-rapidas__botao';
      b.textContent = r.titulo;
      b.title = preencher(r.texto);
      b.setAttribute('data-rapida', String(i));
      lista.appendChild(b);
    });
  }
  lista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rapida]');
    if (b && respostas[Number(b.getAttribute('data-rapida'))]) inserir(respostas[Number(b.getAttribute('data-rapida'))].texto);
  });

  // ------------------------------------------------------------ editor
  var seq = 0;
  function itemEditor(r) {
    seq++;
    var li = document.createElement('li');
    li.className = 'admin-dialogo__item';
    li.setAttribute('data-rapida-item', '');
    var c1 = document.createElement('label');
    c1.className = 'admin-dialogo__rotulo';
    c1.htmlFor = 'rapida-titulo-' + seq;
    c1.textContent = 'Título do botão';
    var titulo = document.createElement('input');
    titulo.id = 'rapida-titulo-' + seq;
    titulo.type = 'text';
    titulo.maxLength = MAX_TITULO;
    titulo.value = r.titulo;
    titulo.setAttribute('data-rapida-titulo', '');
    var c2 = document.createElement('label');
    c2.className = 'admin-dialogo__rotulo';
    c2.htmlFor = 'rapida-texto-' + seq;
    c2.textContent = 'Texto';
    var corpo = document.createElement('textarea');
    corpo.id = 'rapida-texto-' + seq;
    corpo.rows = 3;
    corpo.maxLength = MAX_TEXTO;
    corpo.value = r.texto;
    corpo.setAttribute('data-rapida-texto', '');
    var remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'admin-dialogo__remover';
    remover.textContent = 'Remover';
    remover.setAttribute('data-rapida-remover', '');
    function rotular() { remover.setAttribute('aria-label', 'Remover a resposta ' + (titulo.value.trim() || 'sem título')); }
    titulo.addEventListener('input', rotular);
    rotular();
    li.append(c1, titulo, c2, corpo, remover);
    return li;
  }
  function preencherEditor(itens) {
    itensEl.textContent = '';
    itens.forEach(function (r) { itensEl.appendChild(itemEditor(r)); });
    erro.hidden = true;
  }
  function lerEditor() {
    return Array.prototype.map.call(itensEl.querySelectorAll('[data-rapida-item]'), function (li) {
      return { titulo: li.querySelector('[data-rapida-titulo]').value, texto: li.querySelector('[data-rapida-texto]').value };
    });
  }
  function mostrarErro(msg) { erro.textContent = msg; erro.hidden = false; }

  botaoEditar.addEventListener('click', function () {
    preencherEditor(respostas);
    dialogo.showModal();
  });
  dialogo.querySelector('[data-rapidas-cancelar]').addEventListener('click', function () { dialogo.close(); });
  dialogo.addEventListener('close', function () { botaoEditar.focus(); });
  dialogo.querySelector('[data-rapidas-adicionar]').addEventListener('click', function () {
    if (itensEl.children.length >= MAX_ITENS) { mostrarErro('Limite de ' + MAX_ITENS + ' respostas.'); return; }
    var li = itemEditor({ titulo: '', texto: '' });
    itensEl.appendChild(li);
    li.querySelector('input').focus();
  });
  dialogo.querySelector('[data-rapidas-restaurar]').addEventListener('click', function () {
    preencherEditor(padroes());
    var primeiro = itensEl.querySelector('input');
    if (primeiro) primeiro.focus();
  });
  itensEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rapida-remover]');
    if (!b) return;
    var li = b.closest('li');
    var foco = li.nextElementSibling || li.previousElementSibling;
    li.remove();
    (foco ? foco.querySelector('input') : dialogo.querySelector('[data-rapidas-adicionar]')).focus();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    erro.hidden = true;
    var itens = lerEditor();
    var incompleto = itens.filter(function (r) { return (r.titulo.trim() || r.texto.trim()) && !valido(r); })[0];
    if (incompleto) { mostrarErro('Preencha o título e o texto de cada resposta (ou remova a que estiver vazia).'); return; }
    respostas = itens.filter(valido).map(limpar);
    if (!salvar(respostas)) mostrarErro('Não foi possível salvar neste navegador (armazenamento bloqueado). As respostas valem só até fechar o painel.');
    renderizarLista();
    if (erro.hidden) dialogo.close();
  });

  renderizarLista();
  caixa.hidden = false;
})();
