/*
 * obrigado.js — retorno do Checkout Pro (obrigado.html).
 *
 * O Mercado Pago volta com ?external_reference=<id do pedido>&status=...&payment_id=...
 * Esses parâmetros NÃO são confiáveis (qualquer um pode editar a URL): servem só para achar o pedido.
 * O status mostrado vem da RPC pedido_consultar(codigo, token), com o token guardado neste navegador
 * por planos.js. Enquanto o webhook não confirmar, a página consulta de novo a cada poucos segundos.
 *
 * Melhoria 100: com o pedido pendente confirmado pelo servidor (Pix/boleto ainda não pago ou "voltar" no
 * Mercado Pago), mostra "Como concluir o pagamento" e o botão que reabre a MESMA preferência pela Edge
 * Function criar-pagamento (modo reabrir, como em planos.html, melhoria 39). Sem prazos inventados.
 * O bloco é montado por concluir-pagamento.js (compartilhado com pedido.html, melhoria 105).
 */
(function () {
  'use strict';

  var CHAVE_PEDIDOS = 'pbr_pedidos_v1';
  var INTERVALO_MS = 4000;
  var TEMPO_MAXIMO_MS = 3 * 60 * 1000;

  var config = window.PBR_CONFIG;
  var caixa = document.querySelector('[data-resultado]');
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
  var formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  // ------------------------------------------------------------------ pedido deste navegador
  var params = new URLSearchParams(location.search);
  var pedidoId = params.get('external_reference') || '';
  var statusMp = params.get('collection_status') || params.get('status') || '';
  var pedidos = {};
  try { pedidos = JSON.parse(localStorage.getItem(CHAVE_PEDIDOS)) || {}; } catch (e) { pedidos = {}; }
  if (!pedidoId) { try { pedidoId = localStorage.getItem('pbr_ultimo_pedido') || ''; } catch (e) { /* */ } }
  var pedido = pedidoId ? pedidos[pedidoId] : null;

  // Tira os parâmetros do MP da barra de endereço (não ficam no histórico nem em capturas de tela).
  if (location.search) history.replaceState(null, '', location.pathname);

  // ------------------------------------------------------------------ contato
  function linkContato() {
    var c = config.contato;
    if (c.whatsapp) {
      var msg = 'Olá! Tenho uma dúvida sobre o meu pedido' + (pedido ? ' ' + pedido.codigo : '') + '.';
      return { href: 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(msg), rotulo: 'Falar no WhatsApp' };
    }
    return { href: 'https://ig.me/m/' + c.instagram, rotulo: 'Falar pelo Instagram' };
  }

  // ------------------------------------------------------------------ renderização
  var ESTADOS = {
    aprovado: {
      icone: 'check',
      titulo: 'Pagamento aprovado! Obrigado pela confiança.',
      texto: 'Seu pedido está confirmado. O comprovante do Mercado Pago foi enviado para o seu e-mail.',
      proximo: ['Próximo passo: o briefing', 'Conte sobre o seu negócio (serviços, contatos, logo e fotos). Leva uns 10 minutos, e o prazo do seu site começa a contar quando o briefing estiver completo.']
    },
    pendente: {
      icone: 'relogio',
      titulo: 'Pagamento em processamento',
      texto: 'Se você escolheu Pix ou boleto, conclua o pagamento pelo app do seu banco. Esta página se atualiza sozinha quando o Mercado Pago confirmar.',
      proximo: null
    },
    recusado: {
      icone: 'alerta',
      titulo: 'Pagamento não aprovado',
      texto: 'O Mercado Pago não aprovou o pagamento e nenhum valor foi cobrado. Você pode tentar de novo com outro cartão ou usar Pix.',
      proximo: null
    },
    cancelado: {
      icone: 'alerta',
      titulo: 'Pagamento cancelado',
      texto: 'O pagamento foi cancelado e nenhum valor foi cobrado. Se quiser, é só tentar de novo.',
      proximo: null
    },
    reembolsado: {
      icone: 'devolver',
      titulo: 'Pedido reembolsado',
      texto: 'O valor deste pedido foi devolvido pelo Mercado Pago. Se tiver alguma dúvida, fale com a gente.',
      proximo: null
    }
  };

  // ------------------------------------------------------------------ como concluir o pagamento (melhoria 100)
  // Só para pendente confirmado pelo servidor e com o token deste navegador. Fica de fora quando o MP
  // voltou "approved" (aguardando o webhook) ou "in_process" (cartão em análise): não há o que concluir.
  function mostraComoConcluir(estado, dados) {
    return estado === 'pendente' && !!dados && !!pedido && !!window.PBRConcluirPagamento && statusMp !== 'approved' && statusMp !== 'in_process';
  }

  // O bloco (passos + botão que reabre a mesma preferência) fica em concluir-pagamento.js, também usado
  // por pedido.html (melhoria 105).
  function adicionarComoConcluir(alvo) {
    window.PBRConcluirPagamento.montar(alvo, { codigo: pedido.codigo, token: pedido.token });
  }

  var ultimoEstado = null;
  var ultimaChave = null;
  function mostrar(estado, dados, observacao) {
    var info = ESTADOS[estado];
    // A consulta se repete a cada poucos segundos: sem mudança, nada é redesenhado (a região aria-live não
    // repete o mesmo texto e o botão "Concluir pagamento" não perde o estado de espera ou o aviso de erro).
    var chave = [estado, observacao || '', dados ? [dados.codigo, dados.plano_nome, dados.valor_centavos, dados.status].join('|') : ''].join('§');
    if (chave === ultimaChave) return;
    ultimaChave = chave;
    caixa.setAttribute('data-estado', estado);
    $('[data-resultado-icone] use').setAttribute('href', '#i-' + info.icone);
    $('[data-resultado-titulo]').textContent = info.titulo;
    $('[data-resultado-texto]').textContent = info.texto + (observacao ? ' ' + observacao : '');

    var dl = $('[data-resultado-pedido]');
    dl.textContent = '';
    if (dados) {
      [['Pedido', dados.codigo], ['Plano', dados.plano_nome], ['Valor', formatoReal.format(dados.valor_centavos / 100)]].forEach(function (par) {
        var linha = el('div', 'resultado__linha');
        linha.appendChild(el('dt', null, par[0]));
        linha.appendChild(el('dd', null, par[1]));
        dl.appendChild(linha);
      });
    }
    dl.hidden = !dados;

    var prox = $('[data-resultado-proximo]');
    prox.textContent = '';
    var comoConcluir = mostraComoConcluir(estado, dados);
    if (info.proximo) {
      prox.appendChild(el('h2', 'resultado__proximo-titulo', info.proximo[0]));
      prox.appendChild(el('p', null, info.proximo[1]));
      if (estado === 'aprovado' && pedido) adicionarLinkBriefing(prox);
    } else if (comoConcluir) {
      adicionarComoConcluir(prox);
    }
    prox.hidden = !info.proximo && !comoConcluir;

    var acoes = $('[data-resultado-acoes]');
    acoes.textContent = '';
    // Sem pagar (recusado, cancelado ou "voltar" no Mercado Pago com o pedido ainda pendente): volta aos planos
    // com o mesmo plano e os dados da última tentativa já preenchidos (melhoria 60; ?retomar=1 em planos.js).
    var voltouSemPagar = estado === 'pendente' && (statusMp === 'null' || statusMp === 'rejected');
    if (estado === 'recusado' || estado === 'cancelado' || voltouSemPagar) {
      var plano = (dados && dados.plano_id) || (pedido && pedido.plano_id) || '';
      var nomePlano = (dados && dados.plano_nome) || (pedido && pedido.plano_nome) || '';
      var qs = '?' + (plano ? 'plano=' + encodeURIComponent(plano) + '&' : '') + 'retomar=1';
      // Com "Como concluir o pagamento" na tela, o principal é concluir o MESMO pedido; esta vira secundária.
      acoes.appendChild(el('a', comoConcluir ? 'botao botao--contorno' : 'botao botao--primario', nomePlano ? 'Tentar de novo com o plano ' + nomePlano : 'Tentar de novo', { href: 'planos.html' + qs, 'data-tentar-de-novo': '' }));
    }
    // Pagamento aprovado: os dados da última tentativa (planos.js) não servem mais neste aparelho
    if (estado === 'aprovado' && dados) { try { localStorage.removeItem('pbr_checkout_rascunho_v1'); } catch (e) { /* */ } }
    var c = linkContato();
    acoes.appendChild(el('a', 'botao botao--contorno', c.rotulo, { href: c.href, target: '_blank', rel: 'noopener' }));
    if ((estado === 'aprovado' || comoConcluir) && pedido) {
      acoes.appendChild(el('a', 'botao botao--contorno', 'Acompanhar meu pedido', { href: 'pedido.html?pedido=' + encodeURIComponent(pedido.codigo), 'data-acompanhar-link': '' }));
    }
    if (estado === 'aprovado') acoes.appendChild(el('a', 'botao botao--contorno', 'Voltar ao início', { href: 'index.html' }));

    if (estado !== ultimoEstado) {
      ultimoEstado = estado;
      document.title = info.titulo + ' — Portfólio BR';
    }
  }

  // Botão do briefing + link para abrir em outro aparelho. O token vai no fragmento (#),
  // que não é enviado a servidores nem aparece no Referer.
  function adicionarLinkBriefing(alvo) {
    var botao = el('a', 'botao botao--primario', 'Preencher o briefing agora', { href: 'briefing.html?pedido=' + encodeURIComponent(pedido.codigo), 'data-link-briefing': '' });
    alvo.appendChild(botao);
    var url = new URL('briefing.html', location.href);
    url.hash = 'c=' + pedido.codigo + '&t=' + pedido.token;
    var bloco = el('div', 'resultado__link-briefing');
    bloco.appendChild(el('label', 'campo__dica', 'Quer preencher em outro aparelho? Guarde este link (ele é pessoal):', { for: 'link-briefing' }));
    var campo = el('input', null, null, { id: 'link-briefing', type: 'text', readonly: '', value: url.toString() });
    campo.addEventListener('focus', function () { campo.select(); });
    bloco.appendChild(campo);
    var copiar = el('button', 'botao botao--contorno botao--pequeno', 'Copiar link', { type: 'button' });
    copiar.addEventListener('click', function () {
      var feito = function () { copiar.textContent = 'Link copiado!'; };
      if (navigator.clipboard) navigator.clipboard.writeText(campo.value).then(feito, function () { campo.select(); });
      else { campo.select(); }
    });
    bloco.appendChild(copiar);
    alvo.appendChild(bloco);
  }

  function semConfirmacao() {
    // Sem o token deste navegador não dá para confirmar; usa o retorno do MP só como indicação.
    var indicacao = { approved: 'pendente', pending: 'pendente', in_process: 'pendente', rejected: 'recusado', null: 'cancelado' }[statusMp] || 'pendente';
    mostrar(indicacao, null, 'Não encontramos os dados do pedido neste navegador; se o pagamento foi feito, enviaremos a confirmação pelo e-mail informado.');
    caixa.setAttribute('data-confirmado', 'false');
  }

  // ------------------------------------------------------------------ consulta
  function consultar() {
    return fetch(config.supabase.url.replace(/\/$/, '') + '/rest/v1/rpc/pedido_consultar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
      body: JSON.stringify({ p_codigo: pedido.codigo, p_token: pedido.token })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (linhas) {
      var d = linhas && linhas[0];
      if (!d || !ESTADOS[d.status]) throw new Error('resposta');
      return d;
    });
  }

  if (!pedido || !window.PBRSupabase || !window.PBRSupabase.configurado()) {
    semConfirmacao();
    return;
  }

  var inicio = Date.now();
  function ciclo() {
    consultar().then(function (d) {
      caixa.setAttribute('data-confirmado', 'true');
      if (d.status === 'pendente' && statusMp === 'approved') {
        // O MP aprovou, mas o webhook ainda não chegou: aguarda a confirmação do servidor.
        mostrar('pendente', d, 'Recebemos o retorno do Mercado Pago e estamos confirmando o pagamento.');
      } else {
        mostrar(d.status, d);
      }
      if (d.status === 'pendente' && Date.now() - inicio < TEMPO_MAXIMO_MS) setTimeout(ciclo, INTERVALO_MS);
    }).catch(function () {
      if (Date.now() - inicio < TEMPO_MAXIMO_MS) setTimeout(ciclo, INTERVALO_MS * 2);
      else semConfirmacao();
    });
  }
  ciclo();
})();
