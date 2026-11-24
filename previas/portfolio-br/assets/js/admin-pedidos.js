/*
 * admin-pedidos.js — aba "Pedidos" do painel.
 * Só leitura: pedidos e notificações do Mercado Pago (o status muda apenas pelo webhook).
 * Iniciada por admin.js depois de confirmar que o usuário é admin:
 *   PBRAdminPedidos.iniciar(clienteSupabase, { tocarSom, piscarTitulo, atento })
 */
(function () {
  'use strict';

  var COLUNAS = 'id, codigo, plano_id, plano_nome, valor_centavos, nome, email, whatsapp, status, ' +
    'mp_preference_id, mp_payment_id, mp_status, mp_status_detalhe, aceite_termos_em, pago_em, criado_em, atualizado_em';
  // Origem do visitante (melhoria 10): coluna nova; se a migration ainda não foi aplicada, o painel lê sem ela.
  var colunas = COLUNAS + ', origem';

  var ROTULOS = {
    pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado'
  };

  // Recuperação de checkout abandonado (melhoria 23): pendente há mais de 1 hora.
  // Nada é enviado sozinho: o dono abre o WhatsApp com a mensagem pronta e decide.
  var ABANDONO_MS = 60 * 60 * 1000;
  var CHAVE_CHAMADOS = 'pbr-admin-recuperacao';
  function abandonado(p, agora) {
    return p.status === 'pendente' && !!p.criado_em && (agora || Date.now()) - new Date(p.criado_em).getTime() > ABANDONO_MS;
  }
  // Pix/boleto gerado (melhoria 108): pendente COM pagamento registrado no Mercado Pago (mp_payment_id), à espera
  // do Pix ou do boleto. Cartão em análise (in_process/authorized/in_mediation) não entra: lá não há o que o cliente pagar.
  // Os demais pendentes nunca chegaram a gerar pagamento ("Sem pagamento"). Só dados já carregados, nada novo no banco.
  var CHAVE_PIX = 'pbr-admin-lembrete-pix';
  var MP_AGUARDANDO_CLIENTE = { pending: true };
  function pagamentoGerado(p) {
    return p.status === 'pendente' && !!p.mp_payment_id && !!MP_AGUARDANDO_CLIENTE[p.mp_status];
  }
  function semPagamento(p) {
    return p.status === 'pendente' && !p.mp_payment_id;
  }
  // Nome do meio de pagamento pelo detalhe do MP (só os dois detalhes conhecidos; o resto fica genérico).
  function tipoGerado(p) {
    return p.mp_status_detalhe === 'pending_waiting_transfer' ? 'Pix'
      : p.mp_status_detalhe === 'pending_waiting_payment' ? 'boleto' : '';
  }
  function rotuloGerado(p) {
    var t = tipoGerado(p);
    return t === 'Pix' ? 'Pix gerado' : t === 'boleto' ? 'boleto gerado' : 'Pix/boleto gerado';
  }
  function tempoParado(iso) {
    var min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 120) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 48) return h + ' h';
    return Math.floor(h / 24) + ' dias';
  }
  // Quando o dono abriu o WhatsApp para cada pedido (só neste navegador; conveniência, não é dado do cliente).
  function lerChamados(modo) { return lerMapa(chaveChamados(modo)); }
  function marcarChamado(id, modo) { return marcarEm(chaveChamados(modo), id); }
  function marcarEm(chave, id) {
    var mapa = lerMapa(chave);
    mapa[id] = new Date().toISOString();
    try { localStorage.setItem(chave, JSON.stringify(mapa)); } catch (e) { /* sem storage: só não lembra */ }
    return mapa[id];
  }
  // Pedido atrasado em produção (melhoria 83): briefing recebido há mais dias úteis do que o prazo do plano e o site
  // ainda não entregue. O prazo vem de config.planos[].prazoDias (número de dias úteis) ou, sem ele, dos "N dias úteis"
  // escritos em config.planos[].prazo. Plano sem prazo numérico confiável nunca fica "atrasado" (melhor nada do que um
  // alarme falso). Dias úteis = segunda a sexta no fuso do navegador (feriados não são descontados). Só leitura.
  function prazoDiasDe(planoId, lista) {
    var planos = lista || (window.PBR_CONFIG && window.PBR_CONFIG.planos) || [];
    var plano = planos.filter(function (x) { return x && x.id === planoId; })[0];
    if (!plano) return null;
    var n = Number(plano.prazoDias);
    if (plano.prazoDias != null && isFinite(n) && n > 0 && Math.floor(n) === n) return n;
    var m = /(\d+)\s*dias?\s+úte/i.exec(plano.prazo || '');
    return m && +m[1] > 0 ? +m[1] : null;
  }
  // Dias úteis completos desde a data de início (o próprio dia do briefing não conta) até hoje.
  function diasUteisDesde(iso, agora) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return null;
    var fim = new Date(agora || Date.now());
    var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var hoje = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    var n = 0;
    for (var i = 0; i < 4000 && dia < hoje; i++) {
      dia.setDate(dia.getDate() + 1);
      var s = dia.getDay();
      if (s !== 0 && s !== 6) n++;
    }
    return n;
  }
  // Data em que o prazo vence: o N-ésimo dia útil depois do briefing.
  function vencimento(iso, prazo) {
    var d = new Date(iso);
    var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    for (var n = 0; n < prazo;) {
      dia.setDate(dia.getDate() + 1);
      if (dia.getDay() !== 0 && dia.getDay() !== 6) n++;
    }
    return dia;
  }
  // { prazo, decorridos, atraso, vence } para pedido aprovado com briefing ainda não entregue; senão null.
  function situacaoPrazo(p, agora) {
    if (!estado || p.status !== 'aprovado') return null;
    var st = estado.briefings[p.id];
    var desde = estado.briefingDatas && estado.briefingDatas[p.id];
    if (!st || st === 'entregue' || !desde) return null;
    var prazo = prazoDiasDe(p.plano_id);
    if (!prazo) return null;
    var decorridos = diasUteisDesde(desde, agora);
    if (decorridos == null) return null;
    return { prazo: prazo, decorridos: decorridos, atraso: Math.max(0, decorridos - prazo), vence: vencimento(desde, prazo) };
  }
  function atrasado(p, agora) { var s = situacaoPrazo(p, agora); return !!(s && s.atraso > 0); }
  function diasUteisTexto(n) { return n + (n === 1 ? ' dia útil' : ' dias úteis'); }

  // Briefing pendente (melhoria 34): aprovado há mais de 24 horas e o cliente ainda não mandou o briefing.
  // Mesma ideia: o dono abre o WhatsApp com a mensagem pronta; o link de acompanhamento vai SEM o token.
  var BRIEFING_MS = 24 * 60 * 60 * 1000;
  var CHAVE_LEMBRETES = 'pbr-admin-lembrete-briefing';
  function semBriefing(p, agora) {
    var desde = p.pago_em || p.atualizado_em;
    return p.status === 'aprovado' && !!desde && !(estado && estado.briefings[p.id]) &&
      (agora || Date.now()) - new Date(desde).getTime() > BRIEFING_MS;
  }
  // Briefing parado (melhoria 103): o mesmo pedido sem briefing, mas pago há MAIS de 3 dias úteis (mesma conta de dias
  // úteis da melhoria 83: segunda a sexta, o dia do pagamento não conta). Devolve os dias úteis decorridos, ou 0.
  var BRIEFING_PARADO_DIAS = 3;
  function briefingParado(p, agora) {
    if (!semBriefing(p, agora)) return 0;
    var n = diasUteisDesde(p.pago_em || p.atualizado_em, agora);
    return n != null && n > BRIEFING_PARADO_DIAS ? n : 0;
  }
  // Pago sem contato (melhoria 51): aprovado nos últimos 30 dias, site ainda não entregue, e o dono ainda não
  // mandou nenhuma mensagem: nenhuma resposta sua no chat de uma conversa com o mesmo WhatsApp e nenhum WhatsApp
  // aberto por este painel (boas-vindas, lembrete ou recuperação). Sem mudança no banco: só leitura.
  var CONTATO_JANELA_MS = 30 * 24 * 60 * 60 * 1000;
  var CHAVE_BOAS_VINDAS = 'pbr-admin-boas-vindas';
  var CHAVE_DISPENSADOS = 'pbr-admin-contato-dispensado';
  // Mesmo número com ou sem o 55: compara pelos dígitos nacionais (DDD + número).
  function numeroNacional(d) {
    var n = String(d || '').replace(/\D/g, '');
    return n.length >= 12 && n.indexOf('55') === 0 ? n.slice(2) : n;
  }
  function contatadoAqui(p) {
    return ['abandono', 'pix', 'briefing', 'boas-vindas'].some(function (m) { return !!lerChamados(m)[p.id]; }) ||
      !!lerMapa(CHAVE_DISPENSADOS)[p.id];
  }
  function semContato(p, agora) {
    var desde = p.pago_em || p.atualizado_em;
    // Sem a consulta das conversas (erro ou ainda carregando) não há como saber: nada de alarme falso.
    if (!estado || !estado.comMensagem || p.status !== 'aprovado' || !desde) return false;
    if ((agora || Date.now()) - new Date(desde).getTime() > CONTATO_JANELA_MS) return false;
    if (estado.briefings[p.id] === 'entregue') return false;
    if (estado.comMensagem[numeroNacional(p.whatsapp)]) return false;
    return !contatadoAqui(p);
  }

  // Qual aviso o pedido precisa agora: 'pix', 'abandono', 'briefing', 'boas-vindas' ou nenhum.
  function modoAtencao(p, agora) {
    if (pagamentoGerado(p)) return 'pix';
    if (abandonado(p, agora)) return 'abandono';
    if (semBriefing(p, agora)) return 'briefing';
    // Depois de chamar (ou marcar), o bloco continua aberto para mostrar o registro até trocar de pedido.
    if (semContato(p, agora) || (estado && estado.manterBoasVindas === p.id && p.status === 'aprovado')) return 'boas-vindas';
    return '';
  }
  // Lista de verificação do dono por pedido aprovado (melhoria 66): só neste navegador, nada novo no banco.
  // Guarda { idDoPedido: { item: dataISO } }: só o id e a data de cada marcação, nenhum dado do cliente.
  var CHAVE_CHECKLIST = 'pbr-admin-checklist';
  var CHECKLIST = ['briefing', 'dominio', 'versao', 'ajustes', 'publicado'];
  var CHECKLIST_ROTULOS = { briefing: 'Briefing recebido', dominio: 'Domínio', versao: 'Primeira versão', ajustes: 'Ajustes', publicado: 'Publicado' };
  function lerChecklist(id) {
    var v = lerMapa(CHAVE_CHECKLIST)[id];
    return v && typeof v === 'object' ? v : {};
  }
  function contarChecklist(id) {
    var marcas = lerChecklist(id);
    return CHECKLIST.filter(function (k) { return !!marcas[k]; }).length;
  }
  // Devolve false se o navegador não deixou salvar (modo privado, cota cheia).
  function gravarChecklist(id, item, marcado) {
    var mapa = lerMapa(CHAVE_CHECKLIST);
    var marcas = mapa[id] && typeof mapa[id] === 'object' ? mapa[id] : {};
    if (marcado) marcas[item] = new Date().toISOString(); else delete marcas[item];
    if (Object.keys(marcas).length) mapa[id] = marcas; else delete mapa[id];
    try { localStorage.setItem(CHAVE_CHECKLIST, JSON.stringify(mapa)); return true; } catch (e) { return false; }
  }

  function chaveChamados(modo) {
    return modo === 'briefing' ? CHAVE_LEMBRETES : modo === 'boas-vindas' ? CHAVE_BOAS_VINDAS : modo === 'pix' ? CHAVE_PIX : CHAVE_CHAMADOS;
  }
  function lerMapa(chave) {
    try { var v = JSON.parse(localStorage.getItem(chave) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function linkAcompanhar() {
    var site = (window.PBR_CONFIG || {}).site || {};
    return site.url ? site.url.replace(/\/?$/, '/') + 'pedido.html' : '';
  }
  // Link direto do briefing (melhoria 56): só o código do pedido, nunca o token. Sem site.url, usa a origem do painel.
  function linkBriefing(p) {
    var site = (window.PBR_CONFIG || {}).site || {};
    var base = site.url ? site.url.replace(/\/?$/, '/') : new URL('../', location.href).href;
    return base + 'briefing.html?pedido=' + encodeURIComponent(p.codigo);
  }
  function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok, falha) {
      var campo = document.createElement('textarea');
      campo.value = texto;
      campo.setAttribute('readonly', '');
      campo.className = 'visualmente-oculto';
      document.body.appendChild(campo);
      campo.select();
      var feito = false;
      try { feito = document.execCommand('copy'); } catch (e) { feito = false; }
      campo.remove();
      if (feito) ok(); else falha(new Error('cópia indisponível'));
    });
  }
  function mensagemBriefing(p) {
    var site = (window.PBR_CONFIG || {}).site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    var link = linkAcompanhar();
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Obrigado pela compra do plano ' + p.plano_nome + ' (pedido ' + p.codigo + ')! ' +
      'Para começarmos o seu site, falta só o briefing: algumas perguntas sobre o seu negócio, textos e fotos. ' +
      (link ? 'Você pode preencher e acompanhar as etapas em ' + link + '?pedido=' + encodeURIComponent(p.codigo) +
        ' (abra no aparelho em que fez a compra ou pelo link pessoal que enviamos). ' : '') +
      'Se preferir, posso tirar as dúvidas por aqui.';
  }
  // Lembrete do briefing parado: vai direto ao briefing (só o código do pedido, nunca o token).
  function mensagemBriefingParado(p) {
    var site = (window.PBR_CONFIG || {}).site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Passando para lembrar do briefing do seu site (plano ' + p.plano_nome + ', pedido ' + p.codigo + '). ' +
      'Assim que ele chegar, começamos a produção. É só abrir ' + linkBriefing(p) +
      ' no aparelho em que fez a compra (ou usar o link pessoal que enviamos). ' +
      'Se tiver alguma dúvida ou preferir mandar as informações por aqui, é só me responder.';
  }
  function mensagemBoasVindas(p) {
    var site = (window.PBR_CONFIG || {}).site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    var link = linkAcompanhar();
    var temBriefing = !!(estado && estado.briefings[p.id]);
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Obrigado por contratar o plano ' + p.plano_nome + ' (pedido ' + p.codigo + '): o pagamento foi confirmado ' +
      'e vou acompanhar o seu site de perto a partir de agora. ' +
      (temBriefing
        ? 'Já recebemos o seu briefing e vamos analisá-lo para começar a produção. '
        : 'O próximo passo é o briefing: algumas perguntas sobre o seu negócio, textos e fotos.' +
          (link ? ' Você pode preencher e acompanhar as etapas em ' + link + '?pedido=' + encodeURIComponent(p.codigo) +
            ' (abra no aparelho em que fez a compra ou pelo link pessoal que enviamos).' : '') + ' ') +
      'Qualquer dúvida, é só me chamar por aqui.';
  }
  function mensagemPara(p, modo) {
    return modo === 'briefing' ? (briefingParado(p) ? mensagemBriefingParado(p) : mensagemBriefing(p)) : modo === 'boas-vindas' ? mensagemBoasVindas(p)
      : modo === 'pix' ? mensagemPix(p) : mensagemRecuperacao(p);
  }

  // Lembrete do Pix/boleto gerado: sem valor e sem link de novo pagamento (o código gerado continua valendo até vencer;
  // um pedido com pagamento registrado não reabre a preferência, melhoria 100). Acompanhamento só com o código, sem token.
  function mensagemPix(p) {
    var site = (window.PBR_CONFIG || {}).site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    var tipo = tipoGerado(p);
    var meio = tipo === 'Pix' ? 'o Pix' : tipo === 'boleto' ? 'o boleto' : 'o pagamento (Pix ou boleto)';
    var link = linkAcompanhar();
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Vi que ' + meio + ' do seu pedido ' + p.codigo + ' (plano ' + p.plano_nome + ') foi gerado, ' +
      'mas o pagamento ainda não foi confirmado pelo Mercado Pago. ' +
      'Se ainda quiser seguir, é só pagar pelo mesmo código que apareceu na compra; a confirmação chega sozinha. ' +
      (link ? 'Você pode acompanhar em ' + link + '?pedido=' + encodeURIComponent(p.codigo) +
        ' (abra no aparelho em que fez a compra). ' : '') +
      'Se o código venceu ou ficou alguma dúvida, me avise por aqui que eu ajudo.';
  }

  function mensagemRecuperacao(p) {
    var cfg = window.PBR_CONFIG || {};
    var site = cfg.site || {};
    var primeiro = String(p.nome || '').trim().split(/\s+/)[0];
    var link = site.url ? site.url.replace(/\/?$/, '/') + 'planos.html?plano=' + encodeURIComponent(p.plano_id || '') : '';
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Aqui é da ' + (site.nome || 'Portfólio BR') + '. ' +
      'Vi que o seu pedido ' + p.codigo + ' (plano ' + p.plano_nome + ', ' + fReal.format(p.valor_centavos / 100) + ') ' +
      'ficou com o pagamento pendente. Posso ajudar a concluir ou tirar alguma dúvida?' +
      (link ? ' Se preferir, dá para retomar por aqui: ' + link : '');
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  var fReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  var fDia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
  function data(iso) { return iso ? fData.format(new Date(iso)) : '—'; }
  function whatsappFormatado(d) {
    var m = /^(?:55)?(\d{2})(\d{4,5})(\d{4})$/.exec(d || '');
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : d;
  }
  function linkWhatsapp(d) {
    var n = String(d || '').replace(/\D/g, '');
    return 'https://wa.me/' + (n.length <= 11 ? '55' + n : n);
  }
  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var estado = null;

  function iniciar(sb, avisos) {
    if (estado) return;
    estado = { sb: sb, avisos: avisos || {}, pedidos: [], briefings: {}, comMensagem: null, manterBoasVindas: null, filtro: 'todos', busca: '', periodo: 'tudo', origem: '', selecionado: null, canal: null, conhecidos: null, timer: null, relogio: null, chaveAbandono: '' };

    var secao = $('.admin-pedidos');
    var lista = $('[data-lista-pedidos]');
    // Listas longas (melhoria 49): 50 pedidos por vez, os mais recentes primeiro.
    estado.paginacao = window.PBRPaginacao ? window.PBRPaginacao.criar({
      raiz: $('[data-mais="pedidos"]'), nomes: ['pedido', 'pedidos'], lista: lista,
      carregar: function () { return carregar(); }
    }) : null;

    $$('[data-filtro-pedido]').forEach(function (b) {
      b.onclick = function () {
        estado.filtro = b.getAttribute('data-filtro-pedido');
        $$('[data-filtro-pedido]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderizarLista();
      };
    });
    $('[data-busca-pedidos]').oninput = function (e) { estado.busca = normalizar(e.target.value.trim()); renderizarLista(); };
    // Período, origem e exportação (melhoria 20)
    var selPeriodo = $('[data-periodo-pedidos]');
    var selOrigem = $('[data-origem-pedidos]');
    if (selPeriodo) selPeriodo.onchange = function () { estado.periodo = selPeriodo.value; renderizarLista(); };
    if (selOrigem) selOrigem.onchange = function () { estado.origem = selOrigem.value; renderizarLista(); };
    var botaoExportar = $('[data-exportar-pedidos]');
    if (botaoExportar) botaoExportar.onclick = exportar;
    $('[data-pedido-voltar]').onclick = function () {
      secao.classList.remove('mostrando-conversa');
      var item = estado.selecionado && lista.querySelector('[data-id="' + estado.selecionado + '"]');
      if (item) item.focus();
    };

    prepararRecuperacao();
    prepararChecklist();
    // Um pedido vira "abandonado" com o passar do tempo, sem evento no banco: confere a cada minuto.
    estado.relogio = setInterval(function () {
      if (estado && chaveAbandono() !== estado.chaveAbandono) {
        renderizarLista();
        if (estado.selecionado) renderizarDetalhe(false);
        document.dispatchEvent(new CustomEvent('pbr:admin-atrasados', { detail: { atrasados: contarAtrasados() } }));
      }
    }, 60000);

    if (window.PBRAvisos) window.PBRAvisos.acompanharAba('pedidos', contarPagosNaoVistos);
    if (window.PBRTempoReal) window.PBRTempoReal.registrar('pedidos', carregar);
    carregar();
    // Tempo real (RLS do admin); sem conexão, atualiza a cada 30 s.
    estado.canal = sb.channel('painel-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, function () { agendar(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings' }, function () { agendar(); })
      // Resposta do dono no chat tira o pedido de "sem contato".
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: 'autor=eq.admin' }, function () { agendar(); })
      .subscribe(function (status) {
        if (!estado) return; // CLOSED atrasado depois do logout
        if (window.PBRTempoReal) window.PBRTempoReal.informar('pedidos', status);
        clearInterval(estado && estado.timer);
        if (status !== 'SUBSCRIBED' && estado) estado.timer = setInterval(carregar, 30000);
        else if (estado) carregar();
      });
  }

  function chaveAbandono() {
    var agora = Date.now();
    return estado.pedidos.map(function (p) {
      var m = modoAtencao(p, agora);
      return (m ? m + ':' + p.id : '') + (atrasado(p, agora) ? ' atrasado:' + p.id : '');
    }).filter(Boolean).join(',');
  }

  function prepararRecuperacao() {
    var campo = $('[data-recuperar-mensagem]');
    var link = $('[data-recuperar-link]');
    if (!campo || !link) return;
    campo.oninput = function () { atualizarLinkWhats(); };
    $('[data-recuperar-padrao]').onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      campo.value = mensagemPara(p, modoAtencao(p));
      atualizarLinkWhats();
      campo.focus();
    };
    // Abrir o link não envia nada: só registra, neste navegador, que o dono chamou o cliente.
    link.onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      var modo = modoAtencao(p);
      if (modo === 'boas-vindas') estado.manterBoasVindas = p.id;
      marcarChamado(p.id, modo);
      mostrarChamado(p.id, modo);
      renderizarLista();
    };
    var copiar = $('[data-briefing-copiar]');
    if (copiar) copiar.onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      var url = linkBriefing(p);
      var aviso = $('[data-briefing-copiado]');
      aviso.textContent = '';
      copiarTexto(url).then(function () {
        aviso.textContent = 'Link copiado. Cole no WhatsApp, e-mail ou onde preferir.';
      }, function () {
        // Sem área de transferência: seleciona o link para o dono copiar com o teclado.
        var codigo = $('[data-briefing-link-url]');
        var faixa = document.createRange();
        faixa.selectNodeContents(codigo);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(faixa);
        aviso.textContent = 'Não foi possível copiar automaticamente. O link está selecionado: use Ctrl+C (ou toque e segure).';
      });
    };
    // Falou com o cliente por outro caminho (ligação, WhatsApp do celular): tira o aviso, só neste navegador.
    var jaFalei = $('[data-recuperar-contatado]');
    if (jaFalei) jaFalei.onclick = function () {
      var p = pedidoSelecionado();
      if (!p) return;
      estado.manterBoasVindas = p.id;
      marcarEm(CHAVE_DISPENSADOS, p.id);
      jaFalei.hidden = true;
      mostrarChamado(p.id, 'boas-vindas');
      renderizarLista();
      campo.focus();
    };
  }

  function pedidoSelecionado() {
    return estado ? pedidoPorId(estado.selecionado) : undefined;
  }

  function atualizarLinkWhats() {
    var p = pedidoSelecionado();
    var link = $('[data-recuperar-link]');
    if (!p || !link) return;
    link.href = linkWhatsapp(p.whatsapp) + '?text=' + encodeURIComponent($('[data-recuperar-mensagem]').value);
  }

  function mostrarChamado(id, modo) {
    var quando = lerChamados(modo)[id];
    var marcado = modo === 'boas-vindas' && !quando ? lerMapa(CHAVE_DISPENSADOS)[id] : '';
    $('[data-recuperar-chamado]').textContent = quando ? 'Você abriu o WhatsApp para este cliente em ' + data(quando) + '.'
      : marcado ? 'Marcado como já contatado em ' + data(marcado) + '. O aviso saiu da lista.' : '';
  }

  function renderizarRecuperacao() {
    var caixa = $('[data-recuperar]');
    if (!caixa) return;
    var p = pedidoSelecionado();
    var modo = p ? modoAtencao(p) : '';
    if (!modo) { caixa.hidden = true; caixa.removeAttribute('data-pedido'); return; }
    var chave = modo + ':' + p.id;
    var mesmo = caixa.getAttribute('data-pedido') === chave && !caixa.hidden;
    var parado = modo === 'briefing' ? briefingParado(p) : 0;
    // Virar "parado" com o painel aberto troca a mensagem pronta (mudou o texto sugerido, não o que o dono digitou).
    if (parado) chave += ':parado';
    caixa.hidden = false;
    caixa.setAttribute('data-pedido', chave);
    caixa.setAttribute('data-modo', modo);
    $('[data-recuperar-titulo]').textContent = parado ? 'Briefing parado' : modo === 'briefing' ? 'Briefing pendente'
      : modo === 'boas-vindas' ? 'Cliente ainda sem mensagem sua' : modo === 'pix' ? rotuloGerado(p).replace(/^./, function (c) { return c.toUpperCase(); }) + ', pagamento não confirmado'
      : 'Checkout abandonado';
    $('[data-recuperar-texto]').textContent = parado
      ? 'Pago há ' + diasUteisTexto(parado) + ' e o briefing ainda não chegou. Sem ele a produção não começa; ' +
        'a mensagem pronta leva o link direto do briefing (só o código do pedido, sem o token).'
      : modo === 'briefing'
      ? 'Pago há ' + tempoParado(p.pago_em || p.atualizado_em) + ' e o briefing ainda não chegou. ' +
        'Sem ele a produção não começa; um lembrete com o link de acompanhamento costuma resolver.'
      : modo === 'boas-vindas'
        ? 'Pago há ' + tempoParado(p.pago_em || p.atualizado_em) + '. Nenhuma resposta sua no chat de uma conversa com este ' +
          'WhatsApp e nenhum WhatsApp aberto por este painel. Uma mensagem de boas-vindas mostra ao cliente que tem alguém cuidando do pedido.'
        : modo === 'pix'
        ? 'O cliente chegou a gerar o pagamento (pedido criado há ' + tempoParado(p.criado_em) + '), mas o Mercado Pago ainda não confirmou. ' +
          'Quem gera o ' + (tipoGerado(p) || 'Pix ou boleto') + ' costuma querer comprar: um lembrete gentil ajuda. Nada é enviado sozinho.'
        : 'Pagamento pendente há ' + tempoParado(p.criado_em) +
          '. O cliente pode ter desistido ou tido algum problema no checkout; uma mensagem educada costuma ajudar.';
    var jaFalei = $('[data-recuperar-contatado]');
    if (jaFalei) jaFalei.hidden = !(modo === 'boas-vindas' && semContato(p));
    var temWhats = String(p.whatsapp || '').replace(/\D/g, '').length >= 10;
    $('[data-recuperar-whats]').hidden = !temWhats;
    var rotuloLink = $('[data-recuperar-link-texto]');
    if (rotuloLink) rotuloLink.textContent = modo === 'briefing' || modo === 'pix' ? 'Lembrar no WhatsApp' : 'Chamar no WhatsApp';
    $('[data-recuperar-sem]').hidden = temWhats;
    // Preserva o texto que o dono está editando quando a lista recarrega.
    if (temWhats && !mesmo) $('[data-recuperar-mensagem]').value = mensagemPara(p, modo);
    if (temWhats) atualizarLinkWhats();
    mostrarChamado(p.id, modo);
    var caixaLink = $('[data-briefing-link]');
    if (caixaLink) {
      caixaLink.hidden = modo !== 'briefing';
      if (modo === 'briefing') {
        $('[data-briefing-link-url]').textContent = linkBriefing(p);
        if (!mesmo) $('[data-briefing-copiado]').textContent = '';
      }
    }
  }

  var timerRecarga = null;
  function agendar() { clearTimeout(timerRecarga); timerRecarga = setTimeout(carregar, 300); }

  function carregar() {
    if (!estado) return Promise.resolve();
    var briefings = estado.sb.from('briefings').select('id, pedido_id, status, criado_em').then(function (r) {
      var mapa = {};
      var ids = {};
      var datas = {};
      ((r && r.data) || []).forEach(function (b) { mapa[b.pedido_id] = b.status; ids[b.pedido_id] = b.id; datas[b.pedido_id] = b.criado_em; });
      estado.briefingIds = ids;
      estado.briefingDatas = datas;
      return mapa;
    }, function () { return {}; });
    var limite = estado.paginacao ? estado.paginacao.limite() : 500;
    function lerPedidos() {
      return estado.sb.from('pedidos').select(colunas, { count: 'exact' }).order('criado_em', { ascending: false }).range(0, limite - 1).then(function (r) {
        if (r.error && colunas !== COLUNAS && /origem/.test(r.error.message || '')) { colunas = COLUNAS; return lerPedidos(); }
        return r;
      });
    }
    return Promise.all([lerPedidos(), briefings])
      .then(function (res) {
        if (res[0].error) return res;
        return lerContatos(res[0].data || []).then(function (mapa) { res.push(mapa); return res; });
      })
      .then(function (res) {
        var r = res[0];
        if (r.error) throw r.error;
        if (!estado) return;
        estado.briefings = res[1];
        estado.comMensagem = res[2];
        var novos = r.data || [];
        avisarAprovados(novos);
        estado.pedidos = novos;
        if (estado.paginacao) estado.paginacao.atualizar(novos.length, r.count);
        var haMais = estado.paginacao ? estado.paginacao.haMais() : novos.length >= limite;
        document.dispatchEvent(new CustomEvent('pbr:admin-dados', { detail: { tipo: 'pedidos', itens: novos, limiteAtingido: haMais, atrasados: contarAtrasados() } }));
        renderizarLista();
        if (estado.selecionado) renderizarDetalhe(false);
      })
      .catch(function () {
        $('[data-resumo-pedidos]').textContent = 'Não foi possível carregar os pedidos.';
        return false;
      });
  }

  // Números (DDD + número) dos aprovados recentes que já têm resposta do dono no chat.
  // Uma consulta só: conversas com o mesmo WhatsApp e pelo menos uma mensagem de autor "admin" (RLS do admin).
  // Devolve null se falhar, e aí o aviso "sem contato" não aparece (melhor nada do que um alarme falso).
  function lerContatos(pedidos) {
    var agora = Date.now();
    var numeros = {};
    pedidos.forEach(function (p) {
      var desde = p.pago_em || p.atualizado_em;
      if (p.status !== 'aprovado' || !desde || agora - new Date(desde).getTime() > CONTATO_JANELA_MS) return;
      var n = numeroNacional(p.whatsapp);
      if (n.length < 10) return;
      numeros[n] = true;
      numeros['55' + n] = true;
    });
    var lista = Object.keys(numeros);
    if (!lista.length) return Promise.resolve({});
    return estado.sb.from('conversas').select('whatsapp, mensagens!inner(autor)')
      .eq('mensagens.autor', 'admin').in('whatsapp', lista).limit(1000)
      .then(function (r) {
        if (!r || r.error) return null;
        var mapa = {};
        (r.data || []).forEach(function (c) { if (c.whatsapp) mapa[numeroNacional(c.whatsapp)] = true; });
        return mapa;
      }, function () { return null; });
  }

  // Som e título piscando quando um pedido passa a "aprovado" (não na primeira carga).
  function avisarAprovados(novos) {
    var aprovadosAgora = {};
    novos.forEach(function (p) { if (p.status === 'aprovado') aprovadosAgora[p.id] = true; });
    if (estado.conhecidos) {
      var recemPagos = novos.filter(function (p) { return aprovadosAgora[p.id] && !estado.conhecidos[p.id]; });
      if (recemPagos.length) {
        if (estado.avisos.tocarSom) estado.avisos.tocarSom();
        if (estado.avisos.atento && !estado.avisos.atento() && estado.avisos.piscarTitulo) estado.avisos.piscarTitulo();
        if (estado.avisos.notificar) {
          var p0 = recemPagos[0];
          estado.avisos.notificar({
            titulo: recemPagos.length === 1 ? 'Pedido pago!' : recemPagos.length + ' pedidos pagos!',
            corpo: recemPagos.length === 1 ? p0.codigo + ' · ' + (p0.plano_nome || 'plano') + ' · ' + fReal.format(p0.valor_centavos / 100) : 'Veja os pedidos aprovados no painel.',
            aba: 'pedidos',
            tag: 'pbr-pedido-' + p0.id
          });
        }
      }
    }
    estado.conhecidos = aprovadosAgora;
    contarPagosNaoVistos();
  }

  // Contador do título/favicon: pedidos pagos depois da última visita à aba Pedidos.
  function contarPagosNaoVistos() {
    if (!estado || !window.PBRAvisos) return;
    window.PBRAvisos.contarNovos('pedidos',
      estado.pedidos.filter(function (p) { return p.status === 'aprovado'; }),
      function (p) { return p.pago_em || p.atualizado_em; });
  }

  // Quantos pedidos carregados estão atrasados agora (para o Resumo; sem recorte de período/origem).
  function contarAtrasados() {
    if (!estado) return 0;
    var agora = Date.now();
    return estado.pedidos.filter(function (p) { return atrasado(p, agora); }).length;
  }

  function canalDe(p) { return window.PBRExportar ? window.PBRExportar.canal(p.origem) : 'direto'; }

  // Período e origem (sem o status): base dos contadores dos botões e do resumo.
  function noRecorte(p) {
    var X = window.PBRExportar;
    if (X && !X.noPeriodo(p.criado_em, estado.periodo)) return false;
    if (estado.origem && canalDe(p) !== estado.origem) return false;
    return true;
  }

  function filtrados() {
    return estado.pedidos.filter(function (p) {
      if (!noRecorte(p)) return false;
      if (estado.filtro === 'abandonado') { if (!abandonado(p)) return false; }
      else if (estado.filtro === 'pix-gerado') { if (!pagamentoGerado(p)) return false; }
      else if (estado.filtro === 'sem-pagamento') { if (!semPagamento(p)) return false; }
      else if (estado.filtro === 'sem-briefing') { if (!semBriefing(p)) return false; }
      else if (estado.filtro === 'briefing-parado') { if (!briefingParado(p)) return false; }
      else if (estado.filtro === 'sem-contato') { if (!semContato(p)) return false; }
      else if (estado.filtro === 'atrasado') { if (!atrasado(p)) return false; }
      else if (estado.filtro !== 'todos' && p.status !== estado.filtro) return false;
      if (!estado.busca) return true;
      return [p.codigo, p.nome, p.email].some(function (c) { return normalizar(c).indexOf(estado.busca) !== -1; });
    });
  }

  function renderizarLista() {
    var lista = $('[data-lista-pedidos]');
    var itens = filtrados();
    lista.textContent = '';
    $('[data-pedidos-vazio]').hidden = itens.length > 0;

    if (window.PBRExportar) window.PBRExportar.preencherOrigens($('[data-origem-pedidos]'), estado.pedidos.map(canalDe));
    var recorte = estado.pedidos.filter(noRecorte);
    var recortado = recorte.length !== estado.pedidos.length;
    var contagem = { todos: recorte.length };
    var agora = Date.now();
    estado.chaveAbandono = chaveAbandono();
    recorte.forEach(function (p) {
      contagem[p.status] = (contagem[p.status] || 0) + 1;
      if (abandonado(p, agora)) contagem.abandonado = (contagem.abandonado || 0) + 1;
      if (pagamentoGerado(p)) contagem['pix-gerado'] = (contagem['pix-gerado'] || 0) + 1;
      if (semPagamento(p)) contagem['sem-pagamento'] = (contagem['sem-pagamento'] || 0) + 1;
      if (semBriefing(p, agora)) contagem['sem-briefing'] = (contagem['sem-briefing'] || 0) + 1;
      if (briefingParado(p, agora)) contagem['briefing-parado'] = (contagem['briefing-parado'] || 0) + 1;
      if (semContato(p, agora)) contagem['sem-contato'] = (contagem['sem-contato'] || 0) + 1;
      if (atrasado(p, agora)) contagem.atrasado = (contagem.atrasado || 0) + 1;
    });
    var chamados = lerChamados('abandono');
    var pixLembrados = lerChamados('pix');
    var lembrados = lerChamados('briefing');
    $$('[data-filtro-pedido]').forEach(function (b) {
      var f = b.getAttribute('data-filtro-pedido');
      var base = f === 'todos' ? 'Todos' : f === 'abandonado' ? 'Abandonados' : f === 'sem-briefing' ? 'Sem briefing'
        : f === 'pix-gerado' ? 'Pix/boleto gerado' : f === 'sem-pagamento' ? 'Sem pagamento'
        : f === 'briefing-parado' ? 'Briefing parado'
        : f === 'sem-contato' ? 'Sem contato' : f === 'atrasado' ? 'Atrasados' : ROTULOS[f] + 's';
      b.textContent = base + ' (' + (contagem[f] || 0) + ')';
    });
    var aprovados = recorte.filter(function (p) { return p.status === 'aprovado'; });
    var total = aprovados.reduce(function (s, p) { return s + p.valor_centavos; }, 0);
    $('[data-resumo-pedidos]').textContent = (aprovados.length
      ? aprovados.length + (aprovados.length === 1 ? ' pedido aprovado' : ' pedidos aprovados') + ' · ' + fReal.format(total / 100)
      : (recortado ? 'Nenhum pedido aprovado neste período/origem.' : 'Nenhum pedido aprovado ainda.')) +
      (recortado ? ' (de ' + estado.pedidos.length + ' pedidos no total)' : '');
    var botaoExportar = $('[data-exportar-pedidos]');
    if (botaoExportar) {
      botaoExportar.textContent = 'Exportar CSV (' + itens.length + ')';
      botaoExportar.disabled = !itens.length;
    }

    // O selo da aba conta, sem o recorte, os pendentes e os aprovados há mais de 24 h sem briefing.
    var pendentes = estado.pedidos.filter(function (p) { return p.status === 'pendente'; }).length;
    var semBrief = estado.pedidos.filter(function (p) { return semBriefing(p, agora); }).length;
    var atencao = pendentes + semBrief;
    var selo = $('[data-selo-aba="pedidos"]');
    if (selo) {
      selo.hidden = !atencao;
      selo.textContent = atencao ? String(atencao) : '';
      var parados = estado.pedidos.filter(function (p) { return briefingParado(p, agora); }).length;
      selo.title = pendentes + ' pendente(s)' + (semBrief ? ' e ' + semBrief + ' sem briefing há mais de 24 h' : '') +
        (parados ? ' (' + parados + ' parado(s) há mais de ' + diasUteisTexto(BRIEFING_PARADO_DIAS) + ')' : '');
    }

    itens.forEach(function (p) {
      var li = el('li');
      var b = el('button', 'admin-item', null, { type: 'button', 'data-id': p.id });
      if (p.id === estado.selecionado) b.setAttribute('aria-current', 'true');
      var l1 = el('span', 'admin-item__linha');
      l1.appendChild(el('span', 'admin-item__nome', p.codigo + ' · ' + p.nome));
      l1.appendChild(el('time', 'admin-item__hora', data(p.criado_em), { datetime: p.criado_em }));
      var l2 = el('span', 'admin-item__linha');
      l2.appendChild(el('span', 'admin-item__previa', p.plano_nome + ' · ' + fReal.format(p.valor_centavos / 100)));
      l2.appendChild(el('span', 'admin-status admin-status--' + p.status, ROTULOS[p.status] || p.status));
      if (pagamentoGerado(p)) {
        l2.appendChild(el('span', 'admin-item__tag admin-item__tag--aviso', rotuloGerado(p) + (pixLembrados[p.id] ? ' · lembrado' : ''),
          { title: 'Pagamento gerado no Mercado Pago (' + (p.mp_status_detalhe || p.mp_status) + '), ainda não confirmado' +
            (pixLembrados[p.id] ? '; lembrete aberto no WhatsApp em ' + data(pixLembrados[p.id]) : '') }));
      } else if (abandonado(p, agora)) {
        l2.appendChild(el('span', 'admin-item__tag admin-item__tag--alerta', chamados[p.id] ? 'abandonado · chamado' : 'abandonado · ' + tempoParado(p.criado_em)));
      }
      if (p.status === 'aprovado') {
        var temBriefing = !!estado.briefings[p.id];
        var atrasado = semBriefing(p, agora);
        var parado = briefingParado(p, agora);
        if (parado) {
          l2.appendChild(el('span', 'admin-item__tag admin-item__tag--alerta',
            'Briefing parado · ' + (lembrados[p.id] ? 'lembrado' : diasUteisTexto(parado)),
            { title: 'Pago há ' + diasUteisTexto(parado) + ' sem briefing' + (lembrados[p.id] ? '; lembrete aberto no WhatsApp em ' + data(lembrados[p.id]) : '') }));
        } else {
          l2.appendChild(el('span', 'admin-item__tag' + (temBriefing ? ' admin-item__tag--ok' : atrasado ? ' admin-item__tag--aviso' : ''),
            temBriefing ? 'briefing ✓' : atrasado ? (lembrados[p.id] ? 'sem briefing · lembrado' : 'sem briefing · ' + tempoParado(p.pago_em || p.atualizado_em)) : 'sem briefing'));
        }
        if (semContato(p, agora)) l2.appendChild(el('span', 'admin-item__tag admin-item__tag--contato', 'sem contato'));
        var sp = situacaoPrazo(p, agora);
        if (sp && sp.atraso > 0) {
          l2.appendChild(el('span', 'admin-item__tag admin-item__tag--alerta', 'Atrasado · ' + diasUteisTexto(sp.atraso),
            { title: 'Briefing recebido há ' + diasUteisTexto(sp.decorridos) + '; prazo do plano: ' + diasUteisTexto(sp.prazo) }));
        }
        var feitos = contarChecklist(p.id);
        l2.appendChild(el('span', 'admin-item__tag ' + (feitos === CHECKLIST.length ? 'admin-item__tag--ok' : 'admin-item__tag--checklist'),
          'etapas ' + feitos + ' de ' + CHECKLIST.length, { title: 'Lista de verificação: ' + feitos + ' de ' + CHECKLIST.length + ' etapas marcadas' }));
      }
      b.appendChild(l1);
      b.appendChild(l2);
      b.onclick = function () { abrir(p.id); };
      li.appendChild(b);
      lista.appendChild(li);
    });
  }

  // CSV dos pedidos que estão na lista (status + período + origem + busca), montado no navegador.
  function exportar() {
    var X = window.PBRExportar;
    if (!estado || !X) return;
    var itens = filtrados();
    if (!itens.length) return;
    var reais = function (c) { return (c / 100).toFixed(2).replace('.', ','); };
    var colunas = [
      { titulo: 'Código', valor: function (p) { return p.codigo; } },
      { titulo: 'Criado em', valor: function (p) { return data(p.criado_em); } },
      { titulo: 'Status', valor: function (p) { return ROTULOS[p.status] || p.status; } },
      { titulo: 'Plano', valor: function (p) { return p.plano_nome; } },
      { titulo: 'Valor (R$)', valor: function (p) { return reais(p.valor_centavos); } },
      { titulo: 'Cliente', valor: function (p) { return p.nome; } },
      { titulo: 'E-mail', valor: function (p) { return p.email; } },
      { titulo: 'WhatsApp', valor: function (p) { return whatsappFormatado(p.whatsapp); } },
      { titulo: 'Canal de origem', valor: function (p) { return X.rotuloCanal(canalDe(p)); } },
      { titulo: 'Origem (detalhe)', valor: function (p) { return p.origem || ''; } },
      { titulo: 'Pago em', valor: function (p) { return p.pago_em ? data(p.pago_em) : ''; } },
      { titulo: 'Briefing', valor: function (p) { return estado.briefings[p.id] ? 'recebido' : briefingParado(p) ? 'parado' : (p.status === 'aprovado' ? 'não enviado' : ''); } },
      { titulo: 'Atraso (dias úteis)', valor: function (p) { var sp = situacaoPrazo(p); return sp && sp.atraso > 0 ? String(sp.atraso) : ''; } }
    ];
    X.baixar('pedidos-portfolio-br-' + X.hoje() + '.csv', X.csv(colunas, itens));
    var aviso = $('[data-exportado-pedidos]');
    if (aviso) aviso.textContent = itens.length + (itens.length === 1 ? ' pedido exportado.' : ' pedidos exportados.');
  }

  // Pedido aberto de fora (briefing, busca) que ficou além dos carregados: guardado à parte, sem entrar na lista.
  function pedidoPorId(id) {
    return estado.pedidos.filter(function (x) { return x.id === id; })[0] ||
      (estado.avulso && estado.avulso.id === id ? estado.avulso : undefined);
  }

  function buscarAvulso(id) {
    if (!estado || pedidoPorId(id)) return Promise.resolve();
    return estado.sb.from('pedidos').select(colunas).eq('id', id).limit(1).then(function (r) {
      if (estado && !r.error && r.data && r.data[0] && r.data[0].id === id) estado.avulso = r.data[0];
    }, function () {});
  }

  function abrir(id) {
    if (estado.manterBoasVindas !== id) estado.manterBoasVindas = null;
    estado.selecionado = id;
    $('.admin-pedidos').classList.add('mostrando-conversa');
    renderizarLista();
    renderizarDetalhe(true);
  }

  function renderizarDetalhe(focar) {
    var p = pedidoPorId(estado.selecionado);
    $('[data-pedido-vazio]').hidden = !!p;
    $('[data-pedido-detalhe]').hidden = !p;
    if (!p) return;

    $('[data-pedido-titulo]').textContent = p.codigo + ' · ' + p.nome;
    $('[data-pedido-subtitulo]').textContent = 'Plano ' + p.plano_nome + ' · ' + fReal.format(p.valor_centavos / 100) + ' · criado em ' + data(p.criado_em);
    var st = $('[data-pedido-status]');
    st.className = 'admin-status admin-status--' + p.status;
    st.textContent = ROTULOS[p.status] || p.status;

    var dl = $('[data-pedido-dados]');
    dl.textContent = '';
    function linha(rotulo, valor, link) {
      dl.appendChild(el('dt', null, rotulo));
      var dd = el('dd');
      if (link && valor) {
        var a = el('a', null, valor, { href: link });
        if (/^https:/.test(link)) { a.target = '_blank'; a.rel = 'noopener'; }
        dd.appendChild(a);
      } else {
        dd.textContent = valor || '—';
      }
      dl.appendChild(dd);
    }
    renderizarRecuperacao();
    renderizarEtapa(p);
    renderizarChecklist(p);
    linha('Cliente', p.nome);
    linha('E-mail', p.email, 'mailto:' + p.email);
    linha('WhatsApp', whatsappFormatado(p.whatsapp), linkWhatsapp(p.whatsapp));
    if ('origem' in p) linha('Origem', p.origem || 'Direto (sem campanha nem site de referência)');
    linha('Plano', p.plano_nome + ' (' + p.plano_id + ')');
    linha('Valor', fReal.format(p.valor_centavos / 100));
    linha('Status', (ROTULOS[p.status] || p.status) + (p.mp_status_detalhe ? ' — ' + p.mp_status_detalhe : ''));
    linha('Pago em', data(p.pago_em));
    linha('Aceite dos termos', data(p.aceite_termos_em));
    var sp = situacaoPrazo(p);
    if (sp) {
      linha('Prazo de entrega', diasUteisTexto(sp.prazo) + ' após o briefing · vence em ' + fDia.format(sp.vence) + ' · ' +
        (sp.atraso > 0 ? 'atrasado há ' + diasUteisTexto(sp.atraso) : sp.decorridos === sp.prazo ? 'vence hoje' : 'faltam ' + diasUteisTexto(sp.prazo - sp.decorridos)));
    }
    linha('Briefing', estado.briefings[p.id] ? 'Recebido (' + ({ novo: 'novo', em_producao: 'em produção', em_revisao: 'em revisão', entregue: 'entregue' }[estado.briefings[p.id]] || estado.briefings[p.id]) + ')' : (p.status === 'aprovado' ? 'Ainda não enviado' : '—'));
    linha('Pagamento MP', p.mp_payment_id);
    linha('Preferência MP', p.mp_preference_id);
    linha('Atualizado em', data(p.atualizado_em));

    var id = p.id;
    estado.sb.from('pedidos_eventos')
      .select('mp_payment_id, mp_status, mp_status_detalhe, valor_centavos, moeda, resultado, recebido_em')
      .eq('pedido_id', id).order('recebido_em', { ascending: true })
      .then(function (r) {
        if (!estado || estado.selecionado !== id) return;
        var ol = $('[data-pedido-eventos]');
        ol.textContent = '';
        var eventos = (r && r.data) || [];
        $('[data-pedido-sem-eventos]').hidden = eventos.length > 0;
        eventos.forEach(function (ev) {
          var texto = data(ev.recebido_em) + ' · pagamento ' + ev.mp_payment_id + ' · ' + ev.mp_status +
            (ev.mp_status_detalhe ? ' (' + ev.mp_status_detalhe + ')' : '') +
            (ev.valor_centavos != null ? ' · ' + fReal.format(ev.valor_centavos / 100) + ' ' + (ev.moeda || '') : '') +
            ' → ' + ev.resultado.replace(/_/g, ' ');
          ol.appendChild(el('li', 'admin-eventos__item' + (ev.resultado === 'valor_divergente' ? ' admin-eventos__item--alerta' : ''), texto));
        });
      });

    if (focar) $('[data-pedido-titulo]').focus();
  }

  function prepararChecklist() {
    var caixa = $('[data-checklist]');
    if (!caixa) return;
    $$('[data-checklist-item]', caixa).forEach(function (cx) {
      cx.onchange = function () {
        var p = pedidoSelecionado();
        if (!p) return;
        var item = cx.getAttribute('data-checklist-item');
        var salvou = gravarChecklist(p.id, item, cx.checked);
        var aviso = $('[data-checklist-aviso]');
        if (!salvou) {
          cx.checked = !cx.checked;
          aviso.textContent = 'Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio).';
          return;
        }
        renderizarChecklist(p);
        renderizarLista();
        aviso.textContent = (cx.checked ? 'Marcado: ' : 'Desmarcado: ') + CHECKLIST_ROTULOS[item] + '. ' +
          contarChecklist(p.id) + ' de ' + CHECKLIST.length + ' concluídas.';
      };
    });
    // Outra aba do painel mudou a lista: acompanha sem recarregar.
    window.addEventListener('storage', function (e) {
      if (!estado || e.key !== CHAVE_CHECKLIST) return;
      renderizarLista();
      var p = pedidoSelecionado();
      if (p) renderizarChecklist(p);
    });
  }

  function renderizarChecklist(p) {
    var caixa = $('[data-checklist]');
    if (!caixa) return;
    if (caixa.getAttribute('data-pedido') !== p.id) $('[data-checklist-aviso]').textContent = '';
    caixa.setAttribute('data-pedido', p.id);
    caixa.hidden = p.status !== 'aprovado';
    if (caixa.hidden) return;
    var marcas = lerChecklist(p.id);
    CHECKLIST.forEach(function (k) {
      var cx = $('[data-checklist-item="' + k + '"]', caixa);
      var quando = marcas[k];
      cx.checked = !!quando;
      $('[data-checklist-data="' + k + '"]', caixa).textContent = quando ? 'em ' + data(quando)
        : k === 'briefing' && estado.briefings[p.id] ? 'o briefing já chegou pelo site' : '';
    });
    var feitos = contarChecklist(p.id);
    var conta = $('[data-checklist-conta]');
    conta.textContent = feitos + ' de ' + CHECKLIST.length + ' concluídas';
    if (feitos === CHECKLIST.length) conta.setAttribute('data-completo', ''); else conta.removeAttribute('data-completo');
  }

  // Etapa que o cliente vê em pedido.html (melhoria 30). Segue o status do briefing, que o dono muda aqui
  // ou na aba Briefings; sem briefing, a etapa é "pagamento confirmado" (ou o status do pagamento).
  var ETAPA_CLIENTE = {
    novo: 'Briefing recebido (o cliente ainda pode editar)',
    em_producao: 'Em produção',
    em_revisao: 'Em produção: ajustes finais',
    entregue: 'Site entregue'
  };
  function renderizarEtapa(p) {
    var caixa = $('[data-pedido-etapa]');
    if (!caixa) return;
    var erro = $('[data-pedido-etapa-erro]');
    erro.hidden = true;
    caixa.hidden = p.status !== 'aprovado';
    if (caixa.hidden) return;
    var st = estado.briefings[p.id];
    var temBriefing = !!(st && estado.briefingIds && estado.briefingIds[p.id]);
    $('[data-pedido-etapa-texto]').textContent = temBriefing
      ? 'Agora: ' + (ETAPA_CLIENTE[st] || st) + '.'
      : 'Agora: Pagamento confirmado, aguardando o briefing. A etapa pode ser mudada depois que o cliente enviar o briefing.';
    $('[data-pedido-etapa-controle]').hidden = !temBriefing;
    var sel = $('[data-pedido-etapa-select]');
    if (!temBriefing) return;
    sel.value = st;
    sel.onchange = function () {
      var novo = sel.value;
      var id = p.id;
      sel.disabled = true;
      erro.hidden = true;
      estado.sb.from('briefings').update({ status: novo }).eq('id', estado.briefingIds[id]).select('id, status')
        .then(function (r) {
          if (!estado) return;
          if (r.error || !r.data || !r.data.length) throw r.error || new Error('sem permissão');
          estado.briefings[id] = novo;
          renderizarLista();
          if (estado.selecionado === id) renderizarDetalhe(false);
          var aviso = $('[data-pedido-etapa-ok]');
          if (aviso) aviso.textContent = 'Etapa atualizada: ' + (ETAPA_CLIENTE[novo] || novo) + '.';
        })
        .catch(function () {
          if (!estado) return;
          sel.value = estado.briefings[id];
          erro.textContent = 'Não foi possível mudar a etapa. Tente de novo.';
          erro.hidden = false;
        })
        .then(function () { sel.disabled = false; });
    };
  }

  function encerrar() {
    if (!estado) return;
    if (window.PBRTempoReal) window.PBRTempoReal.esquecer('pedidos');
    if (estado.canal) estado.sb.removeChannel(estado.canal);
    clearInterval(estado.timer);
    clearInterval(estado.relogio);
    if (estado.paginacao) estado.paginacao.reiniciar();
    estado = null;
    var lista = $('[data-lista-pedidos]');
    if (lista) lista.textContent = '';
    var det = $('[data-pedido-detalhe]');
    if (det) det.hidden = true;
  }

  // Abre um pedido pelo id (usado pela aba Briefings).
  // semRecarregar: a busca global (melhoria 37) abre com os dados já carregados, sem consulta nova.
  function abrirPorId(id, semRecarregar) {
    if (!estado) return;
    estado.filtro = 'todos';
    estado.busca = '';
    estado.periodo = 'tudo';
    estado.origem = '';
    var selP = $('[data-periodo-pedidos]');
    if (selP) selP.value = 'tudo';
    var selO = $('[data-origem-pedidos]');
    if (selO) selO.value = '';
    var busca = $('[data-busca-pedidos]');
    if (busca) busca.value = '';
    $$('[data-filtro-pedido]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filtro-pedido') === 'todos')); });
    if (semRecarregar) { renderizarLista(); abrir(id); return; }
    // Recarrega antes de abrir: o status do briefing pode ter acabado de mudar.
    carregar().then(function () { return buscarAvulso(id); }).then(function () { if (estado) abrir(id); });
  }

  window.PBRAdminPedidos = {
    iniciar: iniciar, encerrar: encerrar, abrirPorId: abrirPorId,
    // Exposto para testes (melhoria 83): cálculo do prazo em dias úteis.
    prazo: { prazoDiasDe: prazoDiasDe, diasUteisDesde: diasUteisDesde, vencimento: vencimento }
  };
})();
