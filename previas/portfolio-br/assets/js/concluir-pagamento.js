/*
 * concluir-pagamento.js — bloco "Como concluir o pagamento" (melhorias 100 e 105).
 *
 * Usado por obrigado.html (retorno do Mercado Pago) e pedido.html (acompanhamento) quando o pedido está
 * PENDENTE e este navegador tem o código + token do pedido. Mostra 3 passos (sem prazos inventados) e o botão
 * que reabre a MESMA preferência pela Edge Function criar-pagamento (modo reabrir, melhoria 39): o servidor
 * valida o token e recusa se já existe Pix/boleto gerado, para não cobrar duas vezes.
 *
 * window.PBRConcluirPagamento.montar(alvo, { codigo, token, idTitulo, passoFinal })
 *   alvo       — elemento onde o título, os passos, o botão e o aviso de erro são acrescentados
 *   idTitulo   — id do h2 (o padrão é "como-concluir-titulo")
 *   passoFinal — texto do 3º passo (cada página diz onde a confirmação aparece)
 * Todo texto é inserido com textContent.
 */
(function () {
  'use strict';

  var MENSAGENS_REABRIR = {
    pagamento_em_andamento: 'Já existe um Pix ou boleto gerado para este pedido, então não abrimos outro (para não cobrar duas vezes). Pague pelo app do seu banco com o código que o Mercado Pago mostrou; se não tiver mais o código, fale com a gente.',
    pedido_nao_pendente: 'Este pedido não está mais aguardando pagamento. Atualize a página para ver a situação.',
    pedido_nao_reabrivel: 'Este pagamento não pode mais ser reaberto. Se ainda quiser o site, faça um novo pedido na página de planos.',
    acesso_negado: 'Não encontramos este pedido neste navegador. Se ainda quiser o site, faça um novo pedido na página de planos.'
  };
  var ERRO_GENERICO = 'Não foi possível reabrir o pagamento agora. Tente de novo em instantes ou fale com a gente.';
  var PASSO_FINAL_PADRAO = 'Depois de pagar, deixe esta página aberta ou acompanhe o pedido: a confirmação aparece sozinha assim que o Mercado Pago aprovar.';

  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function svgIcone(nome) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + nome);
    svg.appendChild(use);
    return svg;
  }

  // Mesma regra de planos.js: só segue para o Mercado Pago (ou o MP falso local nos testes).
  function urlCheckoutSegura(u) {
    try {
      var url = new URL(u);
      if (url.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$|(^|\.)mercadolivre\.com(\.br)?$|(^|\.)mercadolibre\.com$/.test(url.hostname)) return true;
      return url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    } catch (e) { return false; }
  }

  function montar(alvo, opcoes) {
    var config = window.PBR_CONFIG;
    var idTitulo = opcoes.idTitulo || 'como-concluir-titulo';
    alvo.appendChild(el('h2', 'resultado__proximo-titulo', 'Como concluir o pagamento', { id: idTitulo }));
    var passos = el('ol', 'resultado__passos', null, { 'aria-labelledby': idTitulo, 'data-como-concluir': '' });
    [
      'Abra o app do seu banco e pague o Pix (QR Code ou “copia e cola”) ou o boleto que o Mercado Pago mostrou.',
      'Ainda não gerou o Pix ou fechou a tela antes de pagar? Volte ao mesmo pagamento pelo botão abaixo, sem preencher nada de novo.',
      opcoes.passoFinal || PASSO_FINAL_PADRAO
    ].forEach(function (t) { passos.appendChild(el('li', null, t)); });
    alvo.appendChild(passos);

    var botao = el('button', 'botao botao--primario', null, { type: 'button', 'data-concluir-pagamento': '' });
    botao.appendChild(svgIcone('cadeado'));
    var texto = el('span', null, 'Concluir pagamento no Mercado Pago');
    botao.appendChild(texto);
    alvo.appendChild(botao);
    var aviso = el('p', 'resultado__aviso-erro', null, { role: 'alert', 'data-concluir-erro': '' });
    aviso.hidden = true;
    alvo.appendChild(aviso);

    var reabrindo = false;
    function liberar() {
      reabrindo = false;
      botao.removeAttribute('aria-disabled');
      botao.removeAttribute('data-carregando');
      texto.textContent = 'Concluir pagamento no Mercado Pago';
    }
    function erro(t) { aviso.textContent = t || ''; aviso.hidden = !t; }
    botao.addEventListener('click', function () {
      if (reabrindo) return;
      reabrindo = true;
      erro('');
      // aria-disabled (e não disabled): o foco continua no botão durante a espera e depois de um erro
      botao.setAttribute('aria-disabled', 'true');
      botao.setAttribute('data-carregando', '');
      texto.textContent = 'Abrindo o pagamento…';
      fetch(config.supabase.url.replace(/\/$/, '') + '/functions/v1/criar-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
        body: JSON.stringify({ reabrir: true, codigo: opcoes.codigo, token: opcoes.token })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, dados: d }; });
        })
        .then(function (res) {
          var d = res.dados || {};
          if (!res.ok || !d.init_point) throw new Error(d.erro || 'falha');
          if (!urlCheckoutSegura(d.init_point)) throw new Error('url_invalida');
          texto.textContent = 'Abrindo o Mercado Pago…';
          location.assign(d.init_point);
        })
        .catch(function (e) {
          erro(MENSAGENS_REABRIR[e && e.message] || ERRO_GENERICO);
          liberar();
        });
    });
    window.addEventListener('pageshow', function (ev) { if (ev.persisted) liberar(); });
    return botao;
  }

  window.PBRConcluirPagamento = { montar: montar };
})();
