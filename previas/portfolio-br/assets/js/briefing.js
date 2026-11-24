/*
 * briefing.js — formulário de briefing em etapas (briefing.html).
 *
 * Acesso: código + token do pedido. Vêm de um destes lugares, em ordem:
 *   1. fragmento da URL  briefing.html#c=PBR-XXXXXX&t=<token>  (link para abrir em outro aparelho;
 *      o fragmento não é enviado a servidores nem aparece no Referer);
 *   2. ?pedido=PBR-XXXXXX com o token guardado por planos.js (pbr_pedidos_v1);
 *   3. o último acesso usado neste navegador (pbr_briefing_acesso).
 * Servidor: RPCs briefing_obter / briefing_enviar e a Edge Function briefing-upload (URL assinada do Storage).
 * Rascunho salvo no localStorage a cada alteração, com a etapa atual (melhoria 43): guarda só as respostas, a etapa e
 * a lista dos arquivos JÁ enviados ao Storage (nome/caminho), nunca o conteúdo dos arquivos nem o token.
 * Ao voltar, retoma na etapa onde parou; "Limpar rascunho" apaga o rascunho deste aparelho (com confirmação).
 * Revisão (melhoria 50): a etapa 5 mostra o resumo agrupado por etapa, cada grupo com "Editar"; editar leva à etapa
 * certa (foco na legenda) e "Voltar à revisão" devolve o foco ao "Editar" de onde a pessoa saiu.
 * Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  var config = window.PBR_CONFIG;
  var form = document.querySelector('[data-form-briefing]');
  var aviso = document.querySelector('[data-briefing-aviso]');
  if (!config || !form || !aviso) return;

  var TOTAL_ETAPAS = 5;
  var TAMANHO_MAXIMO = 5 * 1024 * 1024;
  var MAX_ARQUIVOS = 20;
  var TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];
  var CAMPOS_TEXTO = ['nome_negocio', 'segmento', 'cidade', 'publico', 'objetivo', 'paginas', 'cores_estilo',
    'textos_servicos', 'contatos_redes', 'dominio', 'observacoes'];
  var ROTULOS = {
    nome_negocio: 'Nome do negócio', segmento: 'Segmento', cidade: 'Cidade/UF', publico: 'Clientes',
    objetivo: 'Objetivo do site', paginas: 'Páginas', cores_estilo: 'Cores e estilo', referencias: 'Referências',
    textos_servicos: 'Serviços e textos', contatos_redes: 'Contatos e redes', tem_dominio: 'Tem domínio?',
    dominio: 'Domínio', arquivos: 'Arquivos enviados', links_arquivos: 'Links de arquivos', observacoes: 'Observações'
  };
  // Grupos do resumo da etapa 5 (observações ficam na própria etapa 5, logo abaixo do resumo).
  var GRUPOS_RESUMO = [
    { etapa: 1, titulo: 'Seu negócio', campos: ['nome_negocio', 'segmento', 'cidade', 'publico'] },
    { etapa: 2, titulo: 'O site', campos: ['objetivo', 'paginas', 'cores_estilo', 'referencias'] },
    { etapa: 3, titulo: 'Conteúdo', campos: ['textos_servicos', 'contatos_redes'] },
    { etapa: 4, titulo: 'Domínio e arquivos', campos: ['tem_dominio', 'dominio', 'arquivos', 'links_arquivos'] }
  ];
  var STATUS_BRIEFING = { novo: 'Recebido', em_producao: 'Em produção', em_revisao: 'Em revisão', entregue: 'Entregue' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function lerJSON(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function gravarJSON(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var base = (config.supabase && config.supabase.url || '').replace(/\/$/, '');
  var chave = config.supabase && config.supabase.anonKey;

  // ------------------------------------------------------------------ acesso (código + token)
  function obterAcesso() {
    var CODIGO = /^PBR-[A-HJ-NP-Z2-9]{6}$/;
    var TOKEN = /^[0-9a-f]{64}$/;
    var h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (CODIGO.test(h.get('c') || '') && TOKEN.test(h.get('t') || '')) {
      var a = { codigo: h.get('c'), token: h.get('t') };
      gravarJSON('pbr_briefing_acesso', a);
      history.replaceState(null, '', location.pathname + location.search); // tira o token da barra de endereço
      return a;
    }
    var pedidos = lerJSON('pbr_pedidos_v1') || {};
    var codigo = new URLSearchParams(location.search).get('pedido');
    var ids = Object.keys(pedidos);
    for (var i = 0; i < ids.length; i++) {
      var p = pedidos[ids[i]];
      if (p && p.codigo === codigo && TOKEN.test(p.token)) return { codigo: p.codigo, token: p.token };
    }
    var salvo = lerJSON('pbr_briefing_acesso');
    if (salvo && CODIGO.test(salvo.codigo) && TOKEN.test(salvo.token) && (!codigo || codigo === salvo.codigo)) return salvo;
    return null;
  }

  // ------------------------------------------------------------------ avisos
  function linkContato() {
    var c = config.contato;
    return c.whatsapp
      ? { href: 'https://wa.me/' + c.whatsapp, rotulo: 'Falar no WhatsApp' }
      : { href: 'https://ig.me/m/' + c.instagram, rotulo: 'Falar pelo Instagram' };
  }
  function mostrarAviso(tipo, titulo, texto, acoes) {
    aviso.hidden = false;
    aviso.setAttribute('data-tipo', tipo);
    $('[data-aviso-titulo]', aviso).textContent = titulo;
    $('[data-aviso-texto]', aviso).textContent = texto || '';
    var box = $('[data-aviso-acoes]', aviso);
    box.textContent = '';
    (acoes || []).forEach(function (a) {
      var classe = 'botao ' + (a.primario ? 'botao--primario' : 'botao--contorno');
      if (a.aoClicar) { // botão de ação na própria página (ex.: "Tentar de novo", melhoria 53)
        var b = el('button', classe, a.rotulo, Object.assign({ type: 'button' }, a.attrs || {}));
        b.addEventListener('click', a.aoClicar);
        box.appendChild(b);
      } else box.appendChild(el('a', classe, a.rotulo, a.attrs));
    });
    var c = linkContato();
    box.appendChild(el('a', 'botao botao--contorno', c.rotulo, { href: c.href, target: '_blank', rel: 'noopener' }));
  }

  var acesso = obterAcesso();
  if (!acesso) {
    mostrarAviso('erro', 'Não encontramos o seu pedido neste aparelho',
      'Abra o briefing pelo link mostrado na página de confirmação do pagamento ou fale com a gente que enviamos o link de novo.');
    return;
  }
  if (!base || !chave) {
    mostrarAviso('erro', 'Briefing indisponível no momento', 'Tente de novo mais tarde ou fale com a gente.');
    return;
  }

  var CHAVE_RASCUNHO = 'pbr_briefing_rascunho_' + acesso.codigo;
  var rede = window.PBRRede || { offline: function () { return false; }, falhaDeRede: function () { return false; }, aoVoltar: function () { return function () {}; } };

  // Falhas passageiras (melhoria 82): sem conexão, tempo esgotado ou erro 5xx do servidor. Nesses casos nada se perde:
  // as respostas ficam no formulário (e no rascunho do aparelho) e "Tentar de novo" repete o mesmo envio.
  var PRAZO_RPC_MS = 20000;
  var PRAZO_ARQUIVO_MS = 90000;
  function buscarComPrazo(url, opcoes, prazoMs) {
    if (typeof AbortController === 'undefined') return fetch(url, opcoes);
    var controle = new AbortController();
    var esgotou = false;
    var relogio = setTimeout(function () { esgotou = true; controle.abort(); }, prazoMs);
    opcoes.signal = controle.signal;
    return fetch(url, opcoes).then(function (r) { clearTimeout(relogio); return r; }, function (e) {
      clearTimeout(relogio);
      if (esgotou) { var t = new Error('tempo_esgotado'); t.tempoEsgotado = true; throw t; }
      throw e;
    });
  }
  function erroHttp(mensagem, status) { var e = new Error(mensagem); e.status = status; return e; }
  // 'rede' | 'tempo' | 'servidor' | '' (recusa do servidor: não adianta repetir igual)
  function tipoFalha(err) {
    if (rede.falhaDeRede(err)) return 'rede';
    if (err && err.tempoEsgotado) return 'tempo';
    if (err && err.status >= 500) return 'servidor';
    return '';
  }

  function chamarRpc(nome, args) {
    return buscarComPrazo(base + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify(args)
    }, PRAZO_RPC_MS).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) throw erroHttp((d && d.message) || ('http ' + r.status), r.status);
        return d;
      });
    });
  }

  // ------------------------------------------------------------------ listas de links
  $$('[data-lista-links]').forEach(function (box) {
    var nome = box.getAttribute('data-lista-links');
    var n = Number(box.getAttribute('data-quantidade'));
    for (var i = 1; i <= n; i++) {
      var id = 'b-' + nome + '-' + i;
      var campo = el('div', 'campo campo--link');
      campo.appendChild(el('label', 'visualmente-oculto', (nome === 'referencias' ? 'Referência ' : 'Link de arquivo ') + i, { for: id }));
      campo.appendChild(el('input', 'campo__entrada', null, {
        id: id, type: 'url', inputmode: 'url', maxlength: '500', placeholder: 'https://', 'data-link': nome,
        'aria-describedby': id + '-erro', autocapitalize: 'off', spellcheck: 'false'
      }));
      var erro = el('p', 'campo__erro', null, { id: id + '-erro' });
      erro.hidden = true;
      campo.appendChild(erro);
      box.appendChild(campo);
    }
  });

  // ------------------------------------------------------------------ dados do formulário
  var arquivos = []; // [{caminho, nome, tipo, tamanho}]

  function coletar() {
    var d = {};
    CAMPOS_TEXTO.forEach(function (n) { d[n] = form.elements[n].value.trim(); });
    var tem = form.querySelector('input[name="tem_dominio"]:checked');
    d.tem_dominio = tem ? tem.value : '';
    if (d.tem_dominio !== 'sim') d.dominio = '';
    ['referencias', 'links_arquivos'].forEach(function (n) {
      d[n] = $$('[data-link="' + n + '"]', form).map(function (i) { return i.value.trim(); }).filter(Boolean);
    });
    d.arquivos = arquivos.slice();
    return d;
  }

  function preencher(d) {
    if (!d) return;
    CAMPOS_TEXTO.forEach(function (n) { if (typeof d[n] === 'string') form.elements[n].value = d[n]; });
    $$('input[name="tem_dominio"]', form).forEach(function (r) { r.checked = r.value === d.tem_dominio; });
    ['referencias', 'links_arquivos'].forEach(function (n) {
      var lista = Array.isArray(d[n]) ? d[n] : [];
      $$('[data-link="' + n + '"]', form).forEach(function (i, k) { i.value = lista[k] || ''; });
    });
    arquivos = Array.isArray(d.arquivos) ? d.arquivos.filter(function (a) { return a && a.caminho; }) : [];
    atualizarDominio();
    renderizarArquivos();
  }

  function atualizarDominio() {
    var tem = form.querySelector('input[name="tem_dominio"]:checked');
    $('[data-campo-dominio]', form).hidden = !(tem && tem.value === 'sim');
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'tem_dominio') atualizarDominio(); });

  // ------------------------------------------------------------------ rascunho local
  var statusRascunho = $('[data-rascunho-status]');
  var bLimpar = $('[data-limpar-rascunho]');
  var caixaConfirmar = $('[data-confirmar-limpeza]');
  var timerRascunho = null;
  var briefingServidor = null; // último briefing enviado (volta a ele ao limpar o rascunho)
  var formularioPronto = false; // só grava a etapa depois de abrir o formulário
  var fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function gravarRascunhoAgora() {
    clearTimeout(timerRascunho);
    timerRascunho = null;
    var ok = gravarJSON(CHAVE_RASCUNHO, { salvo_em: new Date().toISOString(), etapa: etapaAtual, dados: coletar() });
    statusRascunho.textContent = ok ? 'Rascunho salvo neste aparelho às ' + fHora.format(new Date()) + '.' : '';
    bLimpar.hidden = !ok || !caixaConfirmar.hidden;
  }
  function salvarRascunho() {
    clearTimeout(timerRascunho);
    timerRascunho = setTimeout(gravarRascunhoAgora, 500);
  }
  form.addEventListener('input', salvarRascunho);
  form.addEventListener('change', salvarRascunho);
  // Não perde a última alteração ao sair, recarregar ou trocar de aba.
  function gravarPendente() { if (timerRascunho) gravarRascunhoAgora(); }
  window.addEventListener('pagehide', gravarPendente);
  document.addEventListener('visibilitychange', function () { if (document.hidden) gravarPendente(); });

  function existeRascunho() { var r = lerJSON(CHAVE_RASCUNHO); return !!(r && r.dados); }
  function dadosVazios() {
    var d = { tem_dominio: '', referencias: [], links_arquivos: [], arquivos: [] };
    CAMPOS_TEXTO.forEach(function (n) { d[n] = ''; });
    return d;
  }
  function fecharConfirmacao(focarLimpar) {
    caixaConfirmar.hidden = true;
    bLimpar.hidden = !existeRascunho();
    if (focarLimpar && !bLimpar.hidden) bLimpar.focus();
  }
  bLimpar.addEventListener('click', function () {
    bLimpar.hidden = true;
    caixaConfirmar.hidden = false;
    $('[data-confirmar-limpar]', caixaConfirmar).focus();
  });
  $('[data-cancelar-limpar]', caixaConfirmar).addEventListener('click', function () { fecharConfirmacao(true); });
  caixaConfirmar.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); fecharConfirmacao(true); }
  });
  $('[data-confirmar-limpar]', caixaConfirmar).addEventListener('click', function () {
    clearTimeout(timerRascunho);
    timerRascunho = null;
    try { localStorage.removeItem(CHAVE_RASCUNHO); } catch (e) { /* sem armazenamento: nada a apagar */ }
    preencher(briefingServidor || dadosVazios());
    $$('[aria-invalid]', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
    $$('.campo__erro', form).forEach(function (p) { p.hidden = true; });
    if (resumoErros) resumoErros.esconder();
    caixaConfirmar.hidden = true;
    bLimpar.hidden = true;
    irPara(1, false);
    statusRascunho.textContent = briefingServidor
      ? 'Rascunho apagado. O formulário voltou ao briefing que você já enviou.'
      : 'Rascunho apagado deste aparelho.';
    form.elements.nome_negocio.focus();
  });

  // ------------------------------------------------------------------ validação
  var URL_OK = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
  // Resumo "Corrija N campos" no topo da etapa, com links para cada campo (melhoria 59)
  var resumoErros = window.PBRResumoErros
    ? window.PBRResumoErros.criar({ id: 'b-resumo-erros', antesDe: $('[data-etapa="1"]', form) })
    : null;
  function erroCampo(entrada, alvo, msg) {
    if (msg) { entrada.setAttribute('aria-invalid', 'true'); alvo.textContent = msg; alvo.hidden = false; }
    else {
      entrada.removeAttribute('aria-invalid'); alvo.hidden = true;
      if (resumoErros) resumoErros.remover(entrada);
    }
    return !msg;
  }
  // Rótulo curto do campo para o resumo ("Referência 2: ..."), já que a mensagem dos links se repete.
  function rotuloCampo(i) { return i.labels && i.labels[0] ? i.labels[0].textContent.replace(/\s*\(obrigatório\)\s*$/, '').trim() : ''; }
  function validarEtapa(n) {
    var etapa = $('[data-etapa="' + n + '"]', form);
    var erros = [];
    if (n === 1) {
      var nome = form.elements.nome_negocio;
      var msgNome = nome.value.trim().length < 2 ? 'Informe o nome do negócio.' : '';
      if (!erroCampo(nome, $('#b-nome_negocio-erro'), msgNome)) erros.push({ campo: nome, mensagem: msgNome });
    }
    $$('[data-link]', etapa).forEach(function (i) {
      var v = i.value.trim();
      var msg = v && !URL_OK.test(v) ? 'Cole um link completo, começando com https://' : '';
      if (!erroCampo(i, $('#' + i.id + '-erro'), msg)) erros.push({ campo: i, mensagem: msg, rotulo: rotuloCampo(i) });
    });
    if (!erros.length) { if (resumoErros) resumoErros.esconder(); return true; }
    if (resumoErros) resumoErros.mostrar(erros); else erros[0].campo.focus();
    return false;
  }
  // Enquanto digita: nenhum erro novo; um erro já mostrado some (no campo e no resumo) assim que o valor fica certo.
  form.addEventListener('input', function (e) {
    var i = e.target;
    if (!i.hasAttribute || !i.hasAttribute('aria-invalid')) return;
    var v = i.value.trim();
    if (i.name === 'nome_negocio' && v.length >= 2) erroCampo(i, $('#b-nome_negocio-erro'), '');
    else if (i.hasAttribute('data-link') && (!v || URL_OK.test(v))) erroCampo(i, $('#' + i.id + '-erro'), '');
  });

  // ------------------------------------------------------------------ etapas
  var etapaAtual = 1;
  var bAnterior = $('[data-etapa-anterior]');
  var bProxima = $('[data-etapa-proxima]');
  var bEnviar = $('[data-enviar-briefing]');
  var bVoltarRevisao = $('[data-voltar-revisao]');
  var revisando = false; // true quando a pessoa saiu da revisão por um "Editar"
  var erroGeral = $('[data-erro-briefing]');

  function irPara(n, focar) {
    etapaAtual = n;
    $$('[data-etapa]', form).forEach(function (f) { f.hidden = Number(f.getAttribute('data-etapa')) !== n; });
    $$('[data-indicador]', form).forEach(function (li) {
      var i = Number(li.getAttribute('data-indicador'));
      li.setAttribute('data-estado', i < n ? 'feito' : i === n ? 'atual' : 'futuro');
      if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    bAnterior.hidden = n === 1;
    if (n === TOTAL_ETAPAS) revisando = false;
    bProxima.hidden = n === TOTAL_ETAPAS;
    bEnviar.hidden = n !== TOTAL_ETAPAS;
    bVoltarRevisao.hidden = !revisando;
    // Vindo de "Editar", a ação principal é voltar à revisão; "Continuar" fica como secundária.
    bProxima.classList.toggle('botao--primario', !revisando);
    bProxima.classList.toggle('botao--contorno', revisando);
    if (n === TOTAL_ETAPAS) renderizarResumo();
    mostrarErro('');
    if (resumoErros) resumoErros.esconder();
    // Guarda a etapa para retomar dali (só se já há rascunho: trocar de etapa sem responder nada não cria um).
    if (formularioPronto && existeRascunho()) gravarRascunhoAgora();
    if (focar) {
      var legenda = $('[data-etapa="' + n + '"] .briefing__legenda', form);
      legenda.focus();
      form.scrollIntoView({ block: 'start', behavior: rolagemSuave() });
    }
  }
  bProxima.addEventListener('click', function () { if (validarEtapa(etapaAtual)) irPara(etapaAtual + 1, true); });
  bAnterior.addEventListener('click', function () { irPara(etapaAtual - 1, true); });
  bVoltarRevisao.addEventListener('click', function () {
    if (!validarEtapa(etapaAtual)) return;
    var origem = etapaAtual;
    irPara(TOTAL_ETAPAS, false);
    var editar = $('[data-editar-etapa="' + origem + '"]', form);
    if (editar) {
      editar.focus({ preventScroll: true });
      editar.closest('section').scrollIntoView({ block: 'start', behavior: rolagemSuave() });
    }
  });
  function rolagemSuave() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  var botaoTentar = $('[data-tentar-briefing]');
  function mostrarErro(t, semConexao) {
    erroGeral.textContent = t || '';
    erroGeral.hidden = !t;
    botaoTentar.hidden = !(t && semConexao);
  }

  function valorResumo(d, k) {
    var v = d[k];
    if (k === 'tem_dominio') v = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei' }[v] || '';
    if (k === 'arquivos') v = arquivos.map(function (a) { return a.nome; }).join('\n');
    if (Array.isArray(v)) v = v.join('\n');
    return v || '';
  }
  function renderizarResumo() {
    var box = $('[data-resumo-briefing]');
    box.textContent = '';
    var d = coletar();
    GRUPOS_RESUMO.forEach(function (g) {
      var idTitulo = 'b-resumo-etapa-' + g.etapa;
      var grupo = el('section', 'briefing__resumo-grupo', null, { 'aria-labelledby': idTitulo, 'data-resumo-grupo': String(g.etapa) });
      var topo = el('div', 'briefing__resumo-topo');
      topo.appendChild(el('h3', 'briefing__resumo-subtitulo', g.titulo, { id: idTitulo }));
      var editar = el('button', 'botao botao--contorno botao--pequeno briefing__editar', 'Editar',
        { type: 'button', 'data-editar-etapa': String(g.etapa) });
      editar.appendChild(el('span', 'visualmente-oculto', ' etapa ' + g.etapa + ': ' + g.titulo));
      editar.addEventListener('click', function () {
        revisando = true;
        irPara(g.etapa, true);
      });
      topo.appendChild(editar);
      grupo.appendChild(topo);
      var dl = el('dl', 'briefing__resumo-lista');
      g.campos.forEach(function (k) {
        if (k === 'dominio' && d.tem_dominio !== 'sim') return;
        var v = valorResumo(d, k);
        var linha = el('div', 'briefing__resumo-linha');
        linha.appendChild(el('dt', null, ROTULOS[k]));
        linha.appendChild(el('dd', v ? null : 'briefing__resumo-vazio', v || 'Não informado'));
        dl.appendChild(linha);
      });
      grupo.appendChild(dl);
      box.appendChild(grupo);
    });
  }

  // ------------------------------------------------------------------ arquivos (Storage)
  var listaArquivos = $('[data-lista-arquivos]');
  var entradaArquivos = $('#b-arquivos');
  function tamanhoLegivel(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

  function renderizarArquivos() {
    $$('li[data-caminho]', listaArquivos).forEach(function (li) { li.remove(); });
    arquivos.forEach(function (a) {
      var li = el('li', 'arquivos__item', null, { 'data-caminho': a.caminho });
      li.appendChild(el('span', 'arquivos__nome', a.nome));
      li.appendChild(el('span', 'arquivos__info', a.tamanho ? tamanhoLegivel(a.tamanho) : ''));
      var rem = el('button', 'arquivos__remover', 'Remover', { type: 'button', 'aria-label': 'Remover ' + a.nome });
      rem.addEventListener('click', function () {
        arquivos = arquivos.filter(function (x) { return x.caminho !== a.caminho; });
        renderizarArquivos();
        salvarRascunho();
        entradaArquivos.focus();
      });
      li.appendChild(rem);
      listaArquivos.appendChild(li);
    });
  }

  // Falha passageira no envio de um arquivo (melhoria 82): o item fica na lista com a mensagem num role="alert"
  // e os botões "Tentar de novo" (reenvia o MESMO arquivo, sem escolher de novo) e "Descartar".
  // Sem duplicar: a URL assinada já obtida é reaproveitada (mesmo caminho no bucket) e, se o arquivo já tinha
  // chegado numa tentativa cuja resposta se perdeu, o Storage responde 409 e o arquivo entra na lista uma vez só.
  var MSG_ARQUIVO = {
    rede: 'Sem internet: confira a conexão e toque em “Tentar de novo”.',
    tempo: 'O envio demorou demais e foi interrompido. Toque em “Tentar de novo”.',
    servidor: 'O servidor não respondeu agora. Toque em “Tentar de novo”.'
  };
  var MSG_RECUSA_ARQUIVO = { limite_arquivos: 'Limite de arquivos atingido.', arquivo_grande: 'Maior que 5 MB.', tipo_nao_permitido: 'Tipo não aceito.',
    briefing_bloqueado: 'O briefing já está em produção.' };
  function jaExiste(r, d) { return r.status === 409 || /already exists|duplicate/i.test((d && (d.message || d.error)) || ''); }

  function enviarArquivo(arquivo) {
    var item = el('li', 'arquivos__item arquivos__item--enviando', null, { 'data-arquivo-estado': 'enviando', tabindex: '-1' });
    item.appendChild(el('span', 'arquivos__nome', arquivo.name));
    var info = el('span', 'arquivos__info', 'Enviando…');
    item.appendChild(info);
    listaArquivos.appendChild(item);
    var assinatura = null; // { caminho, upload_url } da 1ª tentativa
    var acoes = null;
    function trocarInfo(texto, alerta) {
      var novo = el('span', 'arquivos__info', texto, alerta ? { role: 'alert' } : null);
      item.replaceChild(novo, info);
      info = novo;
    }
    function falhar(msg) { // recusa definitiva (tipo, tamanho, limite...): some sozinho
      if (acoes) { acoes.remove(); acoes = null; }
      item.className = 'arquivos__item arquivos__item--erro';
      item.setAttribute('data-arquivo-estado', 'recusado');
      trocarInfo(msg, false);
      setTimeout(function () { item.remove(); }, 8000);
    }
    function falharPassageiro(tipo, manual) {
      item.className = 'arquivos__item arquivos__item--erro';
      item.setAttribute('data-arquivo-estado', 'falhou');
      item.setAttribute('data-falha', tipo);
      trocarInfo(MSG_ARQUIVO[tipo], true);
      acoes = el('span', 'arquivos__acoes');
      var bTentar = el('button', 'arquivos__remover', 'Tentar de novo',
        { type: 'button', 'data-tentar-arquivo': '', 'aria-label': 'Tentar enviar de novo ' + arquivo.name });
      var bDescartar = el('button', 'arquivos__remover', 'Descartar',
        { type: 'button', 'data-descartar-arquivo': '', 'aria-label': 'Descartar ' + arquivo.name });
      bTentar.addEventListener('click', function () { tentar(true); });
      bDescartar.addEventListener('click', function () { item.remove(); entradaArquivos.focus(); });
      acoes.appendChild(bTentar);
      acoes.appendChild(bDescartar);
      item.appendChild(acoes);
      if (manual) bTentar.focus();
    }
    function concluir(d) {
      item.remove();
      // Nunca duas vezes o mesmo caminho (ex.: dois toques rápidos em "Tentar de novo")
      if (!arquivos.some(function (a) { return a.caminho === d.caminho; })) {
        arquivos.push({ caminho: d.caminho, nome: arquivo.name.slice(0, 200), tipo: arquivo.type, tamanho: arquivo.size });
      }
      renderizarArquivos();
      salvarRascunho();
    }
    function assinar() {
      if (assinatura) return Promise.resolve(assinatura);
      return buscarComPrazo(base + '/functions/v1/briefing-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: chave },
        body: JSON.stringify({ codigo: acesso.codigo, token: acesso.token, nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size })
      }, PRAZO_RPC_MS).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.upload_url) throw erroHttp(d.erro || 'falha', r.status);
          assinatura = d;
          return d;
        });
      });
    }
    function tentar(manual) {
      if (acoes) { acoes.remove(); acoes = null; }
      item.className = 'arquivos__item arquivos__item--enviando';
      item.setAttribute('data-arquivo-estado', 'enviando');
      item.removeAttribute('data-falha');
      trocarInfo('Enviando…', false);
      if (manual) item.focus(); // o botão some durante o envio: o foco fica no próprio item
      if (rede.offline()) { falharPassageiro('rede', manual); return Promise.resolve(); }
      var reaproveitada = !!assinatura;
      return assinar().then(function (d) {
        return buscarComPrazo(d.upload_url, { method: 'PUT', headers: { 'Content-Type': arquivo.type, 'x-upsert': 'false' }, body: arquivo }, PRAZO_ARQUIVO_MS)
          .then(function (r) {
            if (r.ok) return concluir(d);
            return r.json().catch(function () { return null; }).then(function (corpo) {
              if (reaproveitada && jaExiste(r, corpo)) return concluir(d); // já tinha chegado antes
              if (reaproveitada && r.status < 500) assinatura = null; // URL vencida: a próxima tentativa pede outra
              throw erroHttp('upload', r.status >= 500 || reaproveitada ? Math.max(r.status, 500) : r.status);
            });
          });
      }).then(function () {
        if (manual && !document.body.contains(item)) entradaArquivos.focus();
      }).catch(function (e) {
        var tipo = tipoFalha(e);
        if (tipo) { falharPassageiro(tipo, manual); return; }
        falhar(MSG_RECUSA_ARQUIVO[e && e.message] || 'Não foi possível enviar. Tente de novo.');
        if (manual) entradaArquivos.focus();
      });
    }

    if (TIPOS.indexOf(arquivo.type) === -1) { falhar('Tipo não aceito: use imagem ou PDF.'); return Promise.resolve(); }
    if (arquivo.size > TAMANHO_MAXIMO) { falhar('Maior que 5 MB.'); return Promise.resolve(); }
    if (arquivos.length >= MAX_ARQUIVOS) { falhar('Limite de ' + MAX_ARQUIVOS + ' arquivos.'); return Promise.resolve(); }
    return tentar(false);
  }

  entradaArquivos.addEventListener('change', function () {
    var lista = Array.prototype.slice.call(entradaArquivos.files || []);
    entradaArquivos.value = '';
    lista.reduce(function (p, f) { return p.then(function () { return enviarArquivo(f); }); }, Promise.resolve());
  });
  rede.aoVoltar(function () {
    $$('[data-falha="rede"] .arquivos__info', listaArquivos).forEach(function (i) {
      i.textContent = 'A conexão voltou: toque em “Tentar de novo”.';
    });
  });

  // ------------------------------------------------------------------ envio
  var MENSAGENS = {
    nome_negocio_obrigatorio: 'Informe o nome do negócio (etapa 1).',
    link_invalido: 'Algum link está incompleto. Confira as referências e os links de arquivos.',
    briefing_bloqueado: 'Seu briefing já está em produção e não pode mais ser alterado por aqui. Fale com a gente se precisar mudar algo.',
    pedido_nao_aprovado: 'O pagamento deste pedido ainda não foi confirmado.',
    arquivo_invalido: 'Um dos arquivos não foi encontrado. Remova-o e envie de novo.',
    acesso_negado: 'Não foi possível confirmar o seu pedido. Abra o briefing pelo link da página de confirmação.'
  };
  // Sem internet (melhoria 53): as respostas ficam no formulário (e no rascunho do aparelho);
  // "Tentar de novo" reenvia o mesmo briefing. Nada é enviado sozinho quando a conexão volta.
  var SEM_INTERNET = 'Sem internet: suas respostas continuam aqui. Confira a conexão e toque em “Tentar de novo”.';
  var MSG_ENVIO = {
    rede: SEM_INTERNET,
    tempo: 'O envio demorou demais e foi interrompido. Suas respostas continuam aqui e salvas neste aparelho: toque em “Tentar de novo”.',
    servidor: 'Nosso servidor teve um problema agora. Suas respostas continuam aqui e salvas neste aparelho: toque em “Tentar de novo”.'
  };
  var CONEXAO_VOLTOU = 'A conexão voltou. Suas respostas continuam aqui: toque em “Tentar de novo” para enviar.';
  botaoTentar.addEventListener('click', function () {
    bEnviar.focus(); // o "Tentar de novo" some ao reenviar: o foco fica no botão de envio
    if (form.requestSubmit) form.requestSubmit(bEnviar); else bEnviar.click();
  });
  rede.aoVoltar(function () { if (!botaoTentar.hidden) mostrarErro(CONEXAO_VOLTOU, true); });

  var enviando = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;
    for (var n = 1; n <= TOTAL_ETAPAS; n++) {
      if (!validarEtapa(n)) { irPara(n, false); validarEtapa(n); return; }
    }
    // Arquivo ainda subindo ou que falhou: avisa antes, para nenhum arquivo ficar de fora sem a pessoa saber.
    var pendente = $('[data-arquivo-estado="enviando"], [data-arquivo-estado="falhou"]', listaArquivos);
    if (pendente) {
      var falhou = pendente.getAttribute('data-arquivo-estado') === 'falhou';
      irPara(4, false);
      mostrarErro(falhou
        ? 'Um arquivo não foi enviado. Toque em “Tentar de novo” ao lado dele ou descarte-o antes de enviar o briefing.'
        : 'Espere os arquivos terminarem de enviar e toque em “Enviar briefing” de novo.');
      if (falhou) $('[data-tentar-arquivo]', pendente).focus(); else pendente.focus();
      return;
    }
    if (rede.offline()) { mostrarErro(SEM_INTERNET, true); return; }
    enviando = true;
    bEnviar.disabled = true;
    bEnviar.setAttribute('data-carregando', ''); // microinteração (melhoria 16)
    bEnviar.textContent = 'Enviando…';
    mostrarErro('');
    chamarRpc('briefing_enviar', { p_codigo: acesso.codigo, p_token: acesso.token, p_dados: coletar() })
      .then(function () {
        try { localStorage.removeItem(CHAVE_RASCUNHO); } catch (err) { /* */ }
        form.hidden = true;
        mostrarAviso('sucesso', 'Briefing enviado! Obrigado.',
          'Já recebemos as informações e vamos começar o seu site. Você pode voltar aqui e editar o briefing até começarmos a produção.',
          [{ rotulo: 'Acompanhar meu pedido', primario: true, attrs: { href: 'pedido.html?pedido=' + encodeURIComponent(acesso.codigo), 'data-acompanhar-link': '' } },
           { rotulo: 'Editar o briefing', primario: false, attrs: { href: 'briefing.html?pedido=' + encodeURIComponent(acesso.codigo), 'data-editar': '' } }]);
        aviso.querySelector('[data-aviso-titulo]').setAttribute('tabindex', '-1');
        aviso.querySelector('[data-aviso-titulo]').focus();
      })
      .catch(function (err) {
        var m = (err && err.message) || '';
        var tipo = tipoFalha(err);
        // Falha passageira: as respostas continuam no formulário e no rascunho. Reenviar é seguro mesmo se o
        // primeiro envio chegou (tempo esgotado): briefing_enviar grava por pedido (on conflict), sem duplicar.
        if (tipo) { gravarRascunhoAgora(); mostrarErro(MSG_ENVIO[tipo], true); return; }
        var chaveMsg = Object.keys(MENSAGENS).filter(function (k) { return m.indexOf(k) !== -1; })[0];
        mostrarErro(MENSAGENS[chaveMsg] || 'Não foi possível enviar agora. Seu rascunho está salvo; tente de novo em instantes.');
      })
      .then(function () { enviando = false; bEnviar.disabled = false; bEnviar.removeAttribute('data-carregando'); bEnviar.textContent = 'Enviar briefing'; });
  });

  // ------------------------------------------------------------------ início
  var carregando = false;
  var cancelarVolta = null;
  function semInternetNaCarga(focar) {
    mostrarAviso('erro', 'Sem internet no momento',
      'Não conseguimos abrir o seu briefing porque o aparelho está sem conexão. Confira a internet e toque em “Tentar de novo”; quando a conexão voltar, tentamos sozinhos.',
      [{ rotulo: 'Tentar de novo', primario: true, attrs: { 'data-tentar-carga': '' }, aoClicar: function () { carregarBriefing(true); } }]);
    if (focar) $('[data-tentar-carga]', aviso).focus();
    if (!cancelarVolta) cancelarVolta = rede.aoVoltar(function () { carregarBriefing(false); });
  }
  function carregarBriefing(manual) {
    if (carregando) return;
    if (rede.offline()) { semInternetNaCarga(manual); return; }
    carregando = true;
    if (manual) {
      aviso.setAttribute('data-tipo', 'carregando');
      $('[data-aviso-titulo]', aviso).textContent = 'Carregando o seu pedido…';
      $('[data-aviso-texto]', aviso).textContent = '';
      $('[data-aviso-titulo]', aviso).setAttribute('tabindex', '-1');
      $('[data-aviso-titulo]', aviso).focus(); // o botão "Tentar de novo" some: o foco vai para o aviso
      $('[data-aviso-acoes]', aviso).textContent = '';
    }
    chamarRpc('briefing_obter', { p_codigo: acesso.codigo, p_token: acesso.token })
      .then(function (linhas) {
        if (cancelarVolta) { cancelarVolta(); cancelarVolta = null; }
        var info = linhas && linhas[0];
        if (!info) throw new Error('acesso_negado');
        if (info.pedido_status !== 'aprovado') {
          mostrarAviso('pendente', 'Pagamento ainda não confirmado',
            'O briefing fica disponível assim que o Mercado Pago confirmar o pagamento do pedido ' + acesso.codigo + '.',
            [{ rotulo: 'Acompanhar meu pedido', primario: true, attrs: { href: 'pedido.html?pedido=' + encodeURIComponent(acesso.codigo), 'data-acompanhar-link': '' } }]);
          return;
        }
        var b = info.briefing;
        if (b && b.status !== 'novo') {
          mostrarAviso('bloqueado', 'Seu briefing já está com a gente',
            'Status: ' + (STATUS_BRIEFING[b.status] || b.status) + '. Para mudar alguma informação agora, fale com a gente.',
            [{ rotulo: 'Acompanhar meu pedido', primario: true, attrs: { href: 'pedido.html?pedido=' + encodeURIComponent(acesso.codigo), 'data-acompanhar-link': '' } }]);
          return;
        }
        briefingServidor = b || null;
        var rascunho = lerJSON(CHAVE_RASCUNHO);
        var usarRascunho = rascunho && rascunho.dados && (!b || rascunho.salvo_em > b.atualizado_em);
        var etapaSalva = usarRascunho ? Math.min(TOTAL_ETAPAS, Math.max(1, Math.floor(Number(rascunho.etapa)) || 1)) : 1;
        preencher(usarRascunho ? rascunho.dados : b);
        $('[data-briefing-pedido]').textContent = 'Pedido ' + acesso.codigo + ' · Plano ' + info.plano_nome;
        aviso.hidden = true;
        form.hidden = false;
        irPara(etapaSalva, !!manual); // depois de "Tentar de novo", o foco vai para a etapa
        formularioPronto = true;
        bLimpar.hidden = !usarRascunho;
        if (usarRascunho) {
          statusRascunho.textContent = etapaSalva > 1
            ? 'Continuando o rascunho salvo neste aparelho, na etapa ' + etapaSalva + ' de ' + TOTAL_ETAPAS + '.'
            : 'Continuando o rascunho salvo neste aparelho.';
        } else if (b) statusRascunho.textContent = 'Você já enviou este briefing. Pode editar e enviar de novo.';
      })
      .catch(function (e) {
        if (rede.falhaDeRede(e)) { semInternetNaCarga(manual); return; }
        if (cancelarVolta) { cancelarVolta(); cancelarVolta = null; }
        var negado = e && /acesso_negado/.test(e.message);
        mostrarAviso('erro', negado ? 'Não foi possível abrir este briefing' : 'Não foi possível carregar o briefing',
          negado ? 'O link pode estar incompleto. Abra pelo link da página de confirmação do pagamento ou fale com a gente.'
            : 'Verifique sua conexão e recarregue a página.');
      })
    .then(function () { carregando = false; });
  }
  carregarBriefing(false);
})();
