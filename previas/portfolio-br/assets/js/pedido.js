/*
 * pedido.js — o cliente acompanha as etapas do pedido (pedido.html).
 *
 * Etapas: pagamento confirmado → briefing recebido → em produção → entregue.
 * Os dados vêm da RPC pedido_acompanhar(codigo, token), que valida o token secreto guardado neste
 * navegador (por planos.js ao comprar, ou pelo link pessoal #c=...&t=...) e não devolve dados pessoais.
 * A etapa é derivada no servidor do status do pagamento e do status do briefing que o dono muda no painel.
 * Pedido pendente (melhoria 105): "Como concluir o pagamento" de concluir-pagamento.js (o mesmo de obrigado.html),
 * com o botão que reabre a MESMA preferência do Mercado Pago (o servidor valida código + token).
 * Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  var CODIGO = /^PBR-[A-HJ-NP-Z2-9]{6}$/;
  var TOKEN = /^[0-9a-f]{64}$/;
  var INTERVALO_MINIMO_MS = 30000;

  var config = window.PBR_CONFIG;
  var caixa = document.querySelector('[data-acompanhar]');
  if (!config || !caixa) return;
  // Melhoria 94: pré-conexão ao Supabase.
  if (window.PBRSupabase && window.PBRSupabase.preconectar) window.PBRSupabase.preconectar();

  function $(s) { return caixa.querySelector(s); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function icone(nome) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + nome);
    svg.appendChild(use);
    return svg;
  }
  function lerJSON(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function gravarJSON(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* */ } }

  var fData = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  var fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function dataLonga(iso) { return iso ? fData.format(new Date(iso)) : ''; }

  // ------------------------------------------------------------------ acesso (código + token)
  // 1) link pessoal com o token no fragmento (#c=...&t=...): não vai para servidores nem para o Referer;
  // 2) pedido feito neste navegador (planos.js), escolhido por ?pedido= ou o último;
  // 3) acesso salvo pelo link pessoal (o mesmo que o briefing usa).
  function obterAcesso() {
    var h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (CODIGO.test(h.get('c') || '') && TOKEN.test(h.get('t') || '')) {
      var a = { codigo: h.get('c'), token: h.get('t') };
      gravarJSON('pbr_briefing_acesso', a);
      history.replaceState(null, '', location.pathname + '?pedido=' + a.codigo); // tira o token da barra de endereço
      return a;
    }
    var pedidos = lerJSON('pbr_pedidos_v1') || {};
    var codigo = new URLSearchParams(location.search).get('pedido');
    var ids = Object.keys(pedidos);
    if (!codigo) {
      var ultimo = null;
      try { ultimo = localStorage.getItem('pbr_ultimo_pedido'); } catch (e) { /* */ }
      if (ultimo && pedidos[ultimo]) codigo = pedidos[ultimo].codigo;
    }
    for (var i = 0; i < ids.length; i++) {
      var p = pedidos[ids[i]];
      if (p && CODIGO.test(p.codigo) && TOKEN.test(p.token) && (!codigo || p.codigo === codigo)) return { codigo: p.codigo, token: p.token };
    }
    var salvo = lerJSON('pbr_briefing_acesso');
    if (salvo && CODIGO.test(salvo.codigo) && TOKEN.test(salvo.token) && (!codigo || codigo === salvo.codigo)) return salvo;
    return null;
  }

  // ------------------------------------------------------------------ contato
  function linkContato(codigo) {
    var c = config.contato;
    if (c.whatsapp) {
      var msg = 'Olá! Quero falar sobre o meu pedido' + (codigo ? ' ' + codigo : '') + '.';
      return { href: 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(msg), rotulo: 'Falar no WhatsApp' };
    }
    return { href: 'https://ig.me/m/' + c.instagram, rotulo: 'Falar pelo Instagram' };
  }

  function prazoDoPlano(planoId) {
    var plano = (config.planos || []).filter(function (p) { return p.id === planoId; })[0];
    return plano && plano.prazo ? plano.prazo : '';
  }

  // ------------------------------------------------------------------ textos
  var ETAPAS = ['pago', 'briefing_recebido', 'em_producao', 'entregue'];

  function definicoes(d) {
    var prazo = prazoDoPlano(d.plano_id);
    var revisao = d.briefing_status === 'em_revisao';
    var produzindo = d.etapa === 'em_producao';
    return [
      { id: 'pago', titulo: 'Pagamento confirmado', data: d.pago_em,
        feito: 'O Mercado Pago confirmou o seu pagamento.',
        atual: 'Aguardando a confirmação do Mercado Pago.',
        futuro: 'Aguardando a confirmação do Mercado Pago.' },
      { id: 'briefing_recebido', titulo: 'Briefing recebido', data: d.briefing_em,
        feito: 'Você nos contou sobre o seu negócio.',
        atual: 'Falta você nos contar sobre o seu negócio: serviços, contatos, logo e fotos.',
        futuro: 'Você conta sobre o seu negócio: serviços, contatos, logo e fotos.' },
      { id: 'em_producao', titulo: revisao ? 'Em produção: ajustes finais' : 'Em produção', data: produzindo ? d.etapa_em : null,
        feito: 'Criamos o seu site.',
        atual: !produzindo ? 'A produção começa em breve.' + (prazo ? ' ' + prazo + '.' : '')
          : revisao ? 'Estamos fazendo os ajustes combinados com você.'
          : 'Estamos criando o seu site.' + (prazo ? ' ' + prazo + '.' : ''),
        futuro: 'Criamos o seu site.' + (prazo ? ' ' + prazo + '.' : '') },
      { id: 'entregue', titulo: 'Site entregue', data: d.etapa === 'entregue' ? d.etapa_em : null,
        feito: 'Seu site está pronto.',
        atual: 'Seu site está pronto.',
        futuro: 'Entregamos o site e combinamos a publicação com você.' }
    ];
  }

  // Quantas etapas estão concluídas e qual é a atual (aria-current), para cada etapa do servidor.
  var PROGRESSO = {
    pendente: { feitas: 0, atual: 0 },
    pago: { feitas: 1, atual: 1 },
    briefing_recebido: { feitas: 2, atual: 2 },
    em_producao: { feitas: 2, atual: 2 },
    entregue: { feitas: 4, atual: 3 }
  };

  var CABECALHO = {
    pendente: ['Aguardando a confirmação do pagamento', 'Se você pagou com Pix ou boleto, a confirmação do Mercado Pago pode levar alguns minutos (boleto: até 3 dias úteis). Esta página mostra a próxima etapa assim que o pagamento for confirmado.'],
    recusado: ['Pagamento não aprovado', 'O Mercado Pago não aprovou o pagamento e nenhum valor foi cobrado. Você pode tentar de novo com outro cartão ou usar Pix.'],
    cancelado: ['Pagamento cancelado', 'O pagamento foi cancelado e nenhum valor foi cobrado. Se quiser, é só tentar de novo.'],
    reembolsado: ['Pedido reembolsado', 'O valor deste pedido foi devolvido pelo Mercado Pago. Se tiver alguma dúvida, fale com a gente.'],
    pago: ['Pagamento confirmado! Falta o briefing', 'O próximo passo é contar sobre o seu negócio. O prazo do seu site começa a contar quando o briefing estiver completo.'],
    briefing_recebido: ['Recebemos o seu briefing', 'Vamos começar a produção do seu site. Até lá, você ainda pode revisar o briefing.'],
    em_producao: ['Seu site está em produção', 'Estamos trabalhando no seu site. Você recebe as novidades pelo contato informado na compra.'],
    em_revisao: ['Seu site está em ajustes finais', 'Estamos fazendo os ajustes combinados com você.'],
    entregue: ['Seu site foi entregue!', 'Obrigado pela confiança. Se precisar de algum ajuste dentro do suporte do seu plano, fale com a gente.']
  };

  // ------------------------------------------------------------------ renderização
  function mostrarErro(titulo, texto, codigo, aoTentar) {
    caixa.setAttribute('data-estado', 'erro');
    $('[data-acompanhar-titulo]').textContent = titulo;
    $('[data-acompanhar-texto]').textContent = texto;
    $('[data-acompanhar-pedido]').hidden = true;
    $('[data-etapas]').hidden = true;
    $('[data-acompanhar-proximo]').hidden = true;
    $('[data-acompanhar-atualizado]').hidden = !codigo;
    var acoes = $('[data-acompanhar-acoes]');
    acoes.textContent = '';
    if (aoTentar) { // sem internet (melhoria 53)
      var tentar = el('button', 'botao botao--primario', 'Tentar de novo', { type: 'button', 'data-tentar-pedido': '' });
      tentar.addEventListener('click', aoTentar);
      acoes.appendChild(tentar);
    }
    var c = linkContato(codigo);
    acoes.appendChild(el('a', 'botao botao--contorno', c.rotulo, { href: c.href, target: '_blank', rel: 'noopener' }));
    acoes.appendChild(el('a', 'botao botao--contorno', 'Ver os planos', { href: 'planos.html' }));
    document.title = titulo + ' — Portfólio BR';
  }

  function renderizar(d, acesso) {
    var pago = d.pedido_status === 'aprovado';
    var chave = pago ? (d.briefing_status === 'em_revisao' ? 'em_revisao' : d.etapa) : d.pedido_status;
    var cab = CABECALHO[chave] || CABECALHO.pendente;
    caixa.setAttribute('data-estado', pago ? d.etapa : d.pedido_status);
    $('[data-acompanhar-titulo]').textContent = cab[0];
    $('[data-acompanhar-texto]').textContent = cab[1];
    document.title = cab[0] + ' — Portfólio BR';

    // Pedido e plano (nada de dados pessoais)
    var dl = $('[data-acompanhar-pedido]');
    dl.textContent = '';
    [['Pedido', d.codigo], ['Plano', d.plano_nome]].forEach(function (par) {
      var linha = el('div', 'resultado__linha');
      linha.appendChild(el('dt', null, par[0]));
      linha.appendChild(el('dd', null, par[1]));
      dl.appendChild(linha);
    });
    dl.hidden = false;

    // Etapas: no pagamento pendente, a primeira é a atual; recusado/cancelado/reembolsado não mostram etapas.
    var ol = $('[data-etapas]');
    ol.textContent = '';
    var mostrarEtapas = pago || d.pedido_status === 'pendente';
    ol.hidden = !mostrarEtapas;
    if (mostrarEtapas) {
      var prog = PROGRESSO[pago ? d.etapa : 'pendente'] || PROGRESSO.pendente;
      definicoes(d).forEach(function (e, i) {
        var estado = i < prog.feitas ? (i === prog.atual ? 'feita-atual' : 'feita') : i === prog.atual ? 'atual' : 'futura';
        var li = el('li', 'etapas__item etapas__item--' + estado);
        if (i === prog.atual) li.setAttribute('aria-current', 'step');
        var marca = el('span', 'etapas__marca');
        marca.setAttribute('aria-hidden', 'true');
        if (i < prog.feitas) marca.appendChild(icone('check'));
        else marca.appendChild(el('span', 'etapas__numero', String(i + 1)));
        li.appendChild(marca);

        var corpo = el('div', 'etapas__corpo');
        var titulo = el('h2', 'etapas__titulo', e.titulo);
        var rotuloEstado = { feita: 'concluída', 'feita-atual': 'concluída', atual: 'etapa atual', futura: 'próxima' }[estado];
        titulo.appendChild(el('span', 'visualmente-oculto', ' (' + rotuloEstado + ')'));
        corpo.appendChild(titulo);
        corpo.appendChild(el('p', 'etapas__texto', estado === 'feita' ? e.feito : estado === 'futura' ? e.futuro : e.atual));
        if (estado !== 'futura' && e.data) {
          corpo.appendChild(el('time', 'etapas__data', (estado === 'atual' ? 'Desde ' : '') + dataLonga(e.data), { datetime: e.data }));
        }
        li.appendChild(corpo);
        ol.appendChild(li);
      });
    }

    // Próximo passo
    var prox = $('[data-acompanhar-proximo]');
    // Pix/boleto ainda não pago (melhoria 105): o mesmo "Como concluir o pagamento" de obrigado.html.
    // Montado uma vez: as atualizações seguintes (botão Atualizar, volta à aba) não apagam o estado de espera
    // nem o aviso de erro do botão.
    var comoConcluir = d.pedido_status === 'pendente' && !!window.PBRConcluirPagamento;
    var jaTemComoConcluir = !!prox.querySelector('[data-concluir-pagamento]');
    if (!(comoConcluir && jaTemComoConcluir)) prox.textContent = '';
    if (comoConcluir && !jaTemComoConcluir) {
      window.PBRConcluirPagamento.montar(prox, {
        codigo: acesso.codigo,
        token: acesso.token,
        passoFinal: 'Depois de pagar, volte a esta página ou toque em “Atualizar”: a próxima etapa aparece assim que o Mercado Pago confirmar.'
      });
    }
    var linkBriefing = 'briefing.html?pedido=' + encodeURIComponent(d.codigo);
    if (pago && d.etapa === 'pago') {
      prox.appendChild(el('h2', 'resultado__proximo-titulo', 'Próximo passo: o briefing'));
      prox.appendChild(el('p', null, 'Leva uns 10 minutos e pode ser salvo e continuado depois.'));
      prox.appendChild(el('a', 'botao botao--primario', 'Preencher o briefing', { href: linkBriefing, 'data-link-briefing': '' }));
    } else if (pago && d.etapa === 'briefing_recebido') {
      prox.appendChild(el('h2', 'resultado__proximo-titulo', 'Quer mudar alguma coisa?'));
      prox.appendChild(el('p', null, 'O briefing pode ser editado até a produção começar.'));
      prox.appendChild(el('a', 'botao botao--contorno', 'Revisar o briefing', { href: linkBriefing, 'data-link-briefing': '' }));
    }
    prox.hidden = !prox.firstChild;

    // Ações
    var acoes = $('[data-acompanhar-acoes]');
    acoes.textContent = '';
    if (d.pedido_status === 'recusado' || d.pedido_status === 'cancelado') {
      acoes.appendChild(el('a', 'botao botao--primario', 'Tentar de novo', { href: 'planos.html' + (d.plano_id ? '?plano=' + encodeURIComponent(d.plano_id) : '') }));
    }
    var c = linkContato(d.codigo);
    acoes.appendChild(el('a', 'botao botao--contorno', c.rotulo, { href: c.href, target: '_blank', rel: 'noopener' }));

    // Link pessoal para acompanhar em outro aparelho
    if (pago && !caixa.querySelector('[data-outro-aparelho]')) {
      var det = el('details', 'acompanhar__outro', null, { 'data-outro-aparelho': '' });
      det.appendChild(el('summary', null, 'Acompanhar em outro aparelho'));
      var url = new URL('pedido.html', location.href);
      url.hash = 'c=' + acesso.codigo + '&t=' + acesso.token;
      var bloco = el('div', 'resultado__link-briefing');
      bloco.appendChild(el('label', 'campo__dica', 'Guarde este link. Ele é pessoal: quem tiver o link vê as etapas deste pedido.', { for: 'link-acompanhar' }));
      var campo = el('input', null, null, { id: 'link-acompanhar', type: 'text', readonly: '', value: url.toString() });
      campo.addEventListener('focus', function () { campo.select(); });
      bloco.appendChild(campo);
      var copiar = el('button', 'botao botao--contorno botao--pequeno', 'Copiar link', { type: 'button' });
      var status = el('span', 'visualmente-oculto', null, { 'aria-live': 'polite' });
      copiar.addEventListener('click', function () {
        var feito = function () { copiar.textContent = 'Link copiado!'; status.textContent = 'Link copiado.'; };
        if (navigator.clipboard) navigator.clipboard.writeText(campo.value).then(feito, function () { campo.select(); });
        else campo.select();
      });
      bloco.appendChild(copiar);
      bloco.appendChild(status);
      det.appendChild(bloco);
      caixa.insertBefore(det, $('[data-acompanhar-atualizado]'));
    }
    var outro = caixa.querySelector('[data-outro-aparelho]');
    if (outro) outro.hidden = !pago;

    $('[data-acompanhar-atualizado]').hidden = false;
  }

  // ------------------------------------------------------------------ consulta
  var acesso = obterAcesso();
  if (!acesso) {
    mostrarErro('Não encontramos o seu pedido neste aparelho',
      'Abra esta página pelo link pessoal do pedido ou pelo aparelho em que fez a compra. Se precisar, fale com a gente que enviamos o link de novo.');
    return;
  }
  var base = (config.supabase && config.supabase.url || '').replace(/\/$/, '');
  var chave = config.supabase && config.supabase.anonKey;
  if (!base || !chave) {
    mostrarErro('Acompanhamento indisponível no momento', 'Tente de novo mais tarde ou fale com a gente.', acesso.codigo);
    return;
  }

  function consultar() {
    return fetch(base + '/rest/v1/rpc/pedido_acompanhar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ p_codigo: acesso.codigo, p_token: acesso.token })
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('acesso_negado');
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (linhas) {
      var d = linhas && linhas[0];
      if (!d || !d.etapa) throw new Error('resposta');
      return d;
    });
  }

  var hora = $('[data-acompanhar-hora]');
  var botaoAtualizar = $('[data-acompanhar-atualizar]');
  var ultimaConsulta = 0;
  var consultando = false;

  // Sem internet (melhoria 53): mensagem clara, "Tentar de novo" e nova consulta sozinha quando a conexão volta.
  var rede = window.PBRRede || { offline: function () { return false; }, falhaDeRede: function () { return false; }, aoVoltar: function () {} };
  var ultimaHora = '';
  var esperandoConexao = false;
  rede.aoVoltar(function () { if (esperandoConexao) carregar(false); });
  function semInternet(manual) {
    esperandoConexao = true;
    var estado = caixa.getAttribute('data-estado');
    if (estado === 'carregando' || estado === 'erro') {
      mostrarErro('Sem internet no momento',
        'Não conseguimos consultar o seu pedido porque o aparelho está sem conexão. Confira a internet e toque em “Tentar de novo”; quando a conexão voltar, consultamos sozinhos.',
        acesso.codigo, function () { carregar(true); });
      hora.textContent = '';
      $('[data-acompanhar-atualizado]').hidden = true; // "Tentar de novo" já faz o papel do "Atualizar"
      if (manual) $('[data-tentar-pedido]').focus();
    } else {
      hora.textContent = 'Sem internet: mostrando a situação ' + (ultimaHora ? 'das ' + ultimaHora : 'anterior') +
        '. Atualizamos sozinhos quando a conexão voltar.';
    }
  }

  function carregar(manual) {
    if (consultando) return;
    if (rede.offline()) { semInternet(manual); return; }
    var focoNoTentar = !!(document.activeElement && document.activeElement.hasAttribute('data-tentar-pedido'));
    consultando = true;
    ultimaConsulta = Date.now();
    botaoAtualizar.disabled = true;
    if (manual) hora.textContent = 'Atualizando…';
    consultar().then(function (d) {
      esperandoConexao = false;
      renderizar(d, acesso);
      ultimaHora = fHora.format(new Date());
      hora.textContent = 'Atualizado às ' + ultimaHora + '.';
      if (focoNoTentar) { // o "Tentar de novo" sumiu: o foco vai para o título com a situação do pedido
        var titulo = $('[data-acompanhar-titulo]');
        titulo.setAttribute('tabindex', '-1');
        titulo.focus();
      }
    }).catch(function (err) {
      if (rede.falhaDeRede(err)) {
        semInternet(manual);
      } else if (err && err.message === 'acesso_negado') {
        mostrarErro('Não foi possível abrir este pedido',
          'O link pode estar incompleto. Abra pelo link pessoal do pedido ou fale com a gente.');
      } else if (caixa.getAttribute('data-estado') === 'carregando' || caixa.getAttribute('data-estado') === 'erro') {
        mostrarErro('Não foi possível carregar o pedido', 'Verifique a sua conexão e tente de novo.', acesso.codigo);
        hora.textContent = '';
      } else {
        hora.textContent = 'Não foi possível atualizar agora. Tente de novo em instantes.';
      }
    }).then(function () {
      consultando = false;
      botaoAtualizar.disabled = false;
    });
  }

  botaoAtualizar.addEventListener('click', function () { carregar(true); });
  // Ao voltar para a aba, atualiza (no máximo a cada 30 s).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - ultimaConsulta > INTERVALO_MINIMO_MS) carregar(false);
  });
  carregar(false);
})();
