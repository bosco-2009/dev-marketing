/*
 * admin-resumo.js — aba "Resumo" do painel (melhoria 32).
 * Cartões do mês escolhido (conversas novas, leads, pedidos pagos, valor recebido e conversão do checkout),
 * comparados ao mês anterior. Tudo é calculado no navegador a partir dos dados que as abas Conversas e Pedidos
 * já carregaram (evento "pbr:admin-dados"): nenhuma consulta nova ao banco, nenhuma tabela nova.
 *
 * Cada cartão tem um texto completo ("2 a mais que em outubro (3)") — a seta é só decoração (aria-hidden).
 *
 * Melhoria 70: cartão "De onde vieram os pedidos" — conversas e pedidos do mês agrupados pelo conteúdo (artigo do blog
 * ou página de segmento) que levou o visitante aos planos. Lê o "cta: blog/..." / "cta: segmento/..." que o origem.js
 * (melhoria 65) põe no fim de conversas.pagina_origem e de pedidos.origem. Também só com os dados já carregados.
 *
 * Melhoria 83: cartão "Pedidos atrasados" — contagem de agora enviada pela aba Pedidos (evento pbr:admin-dados).
 *
 * Melhoria 88: cartões "Primeira resposta" — mediana e percentil 90 do tempo entre a 1ª mensagem do visitante e a 1ª
 * resposta do dono, nas conversas cuja 1ª mensagem do visitante caiu no mês. Usa só os horários que a lista de conversas
 * já traz (primeira_visitante / primeira_resposta, admin.js); com menos de 5 conversas respondidas, "sem dados suficientes".
 *
 * Melhoria 76: botão "Baixar CSV" — os cartões do mês escolhido (com o mês anterior ao lado) e a tabela "De onde vieram
 * os pedidos", montados no navegador com o PBRExportar.csv (mesmo escape contra fórmulas). Só contagens e valores:
 * nenhum nome, e-mail, WhatsApp, código de pedido ou texto digitado por visitante entra no arquivo.
 */
(function () {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var fReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fNum = new Intl.NumberFormat('pt-BR');
  var fPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  var dados = { conversas: null, pedidos: null, limiteConversas: false, limitePedidos: false, atrasados: null };
  var mesEscolhido = null; // { ano, mes } (mês 0–11), hora local do navegador

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, classe, texto, attrs) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // ------------------------------------------------------------------ cálculo (funções puras)
  function chaveMes(ano, mes) { return ano + '-' + (mes < 9 ? '0' : '') + (mes + 1); }
  function mesAnterior(m) { return m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ano: m.ano, mes: m.mes - 1 }; }
  function noMes(iso, m) {
    if (!iso) return false;
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return false;
    return d.getFullYear() === m.ano && d.getMonth() === m.mes;
  }
  function nomeMes(m, comAno) { return MESES[m.mes] + (comAno ? ' de ' + m.ano : ''); }

  function metricas(m) {
    var conversas = (dados.conversas || []).filter(function (c) { return noMes(c.criado_em, m); });
    var leads = conversas.filter(function (c) { return !!(c.nome || c.whatsapp); });
    var pedidos = dados.pedidos || [];
    // Pago no mês: status aprovado, contado pela data do pagamento (reembolsados não entram no valor recebido).
    var pagos = pedidos.filter(function (p) { return p.status === 'aprovado' && noMes(p.pago_em || p.atualizado_em, m); });
    var valor = pagos.reduce(function (s, p) { return s + (Number(p.valor_centavos) || 0); }, 0);
    // Conversão do checkout: dos pedidos iniciados no mês, quantos estão pagos.
    var iniciados = pedidos.filter(function (p) { return noMes(p.criado_em, m); });
    var iniciadosPagos = iniciados.filter(function (p) { return p.status === 'aprovado'; });
    return {
      conversas: conversas.length,
      leads: leads.length,
      pagos: pagos.length,
      valor: valor,
      iniciados: iniciados.length,
      iniciadosPagos: iniciadosPagos.length,
      taxa: iniciados.length ? (iniciadosPagos.length / iniciados.length) * 100 : null
    };
  }

  // ------------------------------------------------------------------ tempo de primeira resposta (melhoria 88)
  var MINIMO_RESPOSTAS = 5;
  function horario(lista) {
    var iso = lista && lista[0] && lista[0].criado_em;
    if (!iso) return null;
    var t = new Date(iso).getTime();
    return isFinite(t) ? t : null;
  }
  // Os horários extras existem? (servidor que recusou a consulta estendida → a lista vem sem eles)
  function temHorarios() {
    var c = dados.conversas || [];
    return !c.length || c.some(function (x) { return Object.prototype.hasOwnProperty.call(x, 'primeira_visitante'); });
  }
  // Percentil pelo posto mais próximo (sempre um tempo que aconteceu de verdade); mediana par = média dos dois do meio.
  function percentil(ordenados, p) {
    if (!ordenados.length) return null;
    return ordenados[Math.max(0, Math.ceil(p * ordenados.length) - 1)];
  }
  function mediana(ordenados) {
    var n = ordenados.length;
    if (!n) return null;
    return n % 2 ? ordenados[(n - 1) / 2] : (ordenados[n / 2 - 1] + ordenados[n / 2]) / 2;
  }
  function temposResposta(m) {
    var duracoes = [];
    var semResposta = 0;
    (dados.conversas || []).forEach(function (c) {
      var inicio = horario(c.primeira_visitante);
      if (inicio == null || !noMes(new Date(inicio).toISOString(), m)) return;
      var resposta = horario(c.primeira_resposta);
      if (resposta == null || resposta < inicio) { semResposta++; return; }
      duracoes.push(resposta - inicio);
    });
    duracoes.sort(function (a, b) { return a - b; });
    var suficiente = duracoes.length >= MINIMO_RESPOSTAS;
    return {
      respondidas: duracoes.length,
      semResposta: semResposta,
      suficiente: suficiente,
      mediana: suficiente ? mediana(duracoes) : null,
      p90: suficiente ? percentil(duracoes, 0.9) : null
    };
  }
  // 45 s → "menos de 1 min"; 12 min; 2 h 5 min; 3 d 4 h (arredonda para o minuto mais próximo).
  function duracao(ms) {
    if (ms == null) return '—';
    if (ms < 60000) return 'menos de 1 min';
    var min = Math.round(ms / 60000);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
    var d = Math.floor(h / 24);
    return d + ' d' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
  }
  // Para o tempo, menor é melhor: a seta aponta a direção do número; a cor diz se melhorou.
  function compararTempo(atual, antes, mesAntes) {
    var nome = nomeMes(mesAntes);
    if (atual == null) return { seta: '', texto: antes == null ? 'Sem dados suficientes em ' + nome + ' para comparar' : 'Em ' + nome + ': ' + duracao(antes) };
    if (antes == null) return { seta: '', texto: 'Sem dados suficientes em ' + nome + ' para comparar' };
    var d = Math.round(atual / 60000) - Math.round(antes / 60000);
    if (d === 0) return { seta: '=', texto: 'Igual a ' + nome + ' (' + duracao(antes) + ')' };
    return {
      seta: d > 0 ? '▲' : '▼',
      direcao: d > 0 ? 'pior' : 'melhor',
      texto: duracao(Math.abs(d) * 60000) + (d > 0 ? ' mais lento que em ' : ' mais rápido que em ') + nome + ' (' + duracao(antes) + ')'
    };
  }

  // "… · cta: blog/site-ou-instagram" → "blog/site-ou-instagram". O origem.js sempre põe o cta por último;
  // exigir o fim do texto descarta um cta cortado no meio pelo limite de tamanho do campo.
  function ctaDe(texto) {
    var m = /(?:^|· )cta: ((?:blog|segmento|exemplo|home|erro)\/[a-z0-9-]+)$/.exec(String(texto || '').trim());
    return m ? m[1] : '';
  }

  // "blog/site-ou-instagram" → { tipo: 'Artigo do blog', nome: 'Site ou instagram' }
  // Atalhos fixos (melhoria 110): planos e simulador da home e planos da página 404.
  var CTAS_FIXOS = {
    'home/planos': { tipo: 'Página inicial', nome: 'Planos' },
    'home/simulador': { tipo: 'Página inicial', nome: 'Simulador' },
    'erro/404': { tipo: 'Página de erro', nome: 'Página não encontrada' }
  };
  function rotuloCta(cta) {
    if (CTAS_FIXOS[cta]) return { tipo: CTAS_FIXOS[cta].tipo, nome: CTAS_FIXOS[cta].nome };
    var p = cta.split('/');
    var nome = p[1].replace(/-/g, ' ');
    if (p[0] !== 'blog') nome = nome.replace(/^saude$/, 'saúde').replace(/^servicos$/, 'serviços');
    var tipo = { blog: 'Artigo do blog', exemplo: 'Site de exemplo', home: 'Página inicial', erro: 'Página de erro' }[p[0]] || 'Página de segmento';
    return { tipo: tipo, nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
  }

  // Linhas por conteúdo no mês: conversas iniciadas, pedidos iniciados e, destes, os pagos (como na conversão).
  function porConteudo(m) {
    var mapa = {};
    function linha(cta) {
      if (!mapa[cta]) mapa[cta] = { cta: cta, conversas: 0, pedidos: 0, pagos: 0 };
      return mapa[cta];
    }
    var totais = { conversas: 0, pedidos: 0, pagos: 0, conversasMes: 0, pedidosMes: 0 };
    (dados.conversas || []).forEach(function (c) {
      if (!noMes(c.criado_em, m)) return;
      totais.conversasMes++;
      var cta = ctaDe(c.pagina_origem);
      if (!cta) return;
      linha(cta).conversas++;
      totais.conversas++;
    });
    (dados.pedidos || []).forEach(function (p) {
      if (!noMes(p.criado_em, m)) return;
      totais.pedidosMes++;
      var cta = ctaDe(p.origem);
      if (!cta) return;
      var l = linha(cta);
      l.pedidos++;
      totais.pedidos++;
      if (p.status === 'aprovado') { l.pagos++; totais.pagos++; }
    });
    var linhas = Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
      return (b.pagos - a.pagos) || (b.pedidos - a.pedidos) || (b.conversas - a.conversas) || (a.cta < b.cta ? -1 : 1);
    });
    return { linhas: linhas, totais: totais };
  }

  // Texto de comparação com o mês anterior, sempre em palavras.
  function comparar(atual, antes, mesAntes, formato, tipo) {
    var nome = nomeMes(mesAntes);
    if (tipo === 'taxa') {
      if (atual == null || antes == null) {
        return { seta: '', texto: antes == null ? 'Sem pedidos em ' + nome + ' para comparar' : 'Em ' + nome + ': ' + formato(antes) };
      }
      var dp = Math.round((atual - antes) * 10) / 10;
      if (dp === 0) return { seta: '=', texto: 'Igual a ' + nome + ' (' + formato(antes) + ')' };
      var pontos = fPct.format(Math.abs(dp)) + (Math.abs(dp) === 1 ? ' ponto percentual ' : ' pontos percentuais ');
      return { seta: dp > 0 ? '▲' : '▼', texto: pontos + (dp > 0 ? 'acima de ' : 'abaixo de ') + nome + ' (' + formato(antes) + ')' };
    }
    var d = atual - antes;
    if (d === 0) return { seta: '=', texto: 'Igual a ' + nome + ' (' + formato(antes) + ')' };
    return { seta: d > 0 ? '▲' : '▼', texto: formato(Math.abs(d)) + (d > 0 ? ' a mais que em ' : ' a menos que em ') + nome + ' (' + formato(antes) + ')' };
  }

  // ------------------------------------------------------------------ interface
  function opcoesDeMes(select) {
    var agora = new Date();
    var m = { ano: agora.getFullYear(), mes: agora.getMonth() };
    var atual = select.value;
    select.textContent = '';
    for (var i = 0; i < 12; i++) {
      var rotulo = nomeMes(m, true);
      if (i === 0) rotulo += ' (este mês)';
      var o = el('option', null, rotulo.charAt(0).toUpperCase() + rotulo.slice(1), { value: chaveMes(m.ano, m.mes) });
      select.appendChild(o);
      m = mesAnterior(m);
    }
    if (atual) select.value = atual;
    if (!select.value) select.selectedIndex = 0;
  }

  function lerSelect(select) {
    var p = String(select.value || '').split('-');
    return { ano: Number(p[0]), mes: Number(p[1]) - 1 };
  }

  function cartao(lista, rotulo, valor, detalhe, comp) {
    var li = el('li', 'admin-kpi');
    li.appendChild(el('h3', 'admin-kpi__rotulo', rotulo));
    li.appendChild(el('p', 'admin-kpi__valor', valor));
    if (detalhe) li.appendChild(el('p', 'admin-kpi__detalhe', detalhe));
    var p = el('p', 'admin-kpi__comparacao');
    if (comp.seta) {
      var s = el('span', 'admin-kpi__seta', comp.seta, { 'aria-hidden': 'true' });
      if (comp.direcao) s.setAttribute('data-direcao', comp.direcao);
      else if (comp.seta === '▲') s.setAttribute('data-direcao', 'sobe');
      else if (comp.seta === '▼') s.setAttribute('data-direcao', 'desce');
      p.appendChild(s);
      p.appendChild(document.createTextNode(' '));
    }
    p.appendChild(document.createTextNode(comp.texto));
    li.appendChild(p);
    lista.appendChild(li);
  }

  function renderizar() {
    var secao = $('[data-aba="resumo"]');
    if (!secao) return;
    var select = $('[data-resumo-mes]');
    var lista = $('[data-resumo-cartoes]');
    var estadoTexto = $('[data-resumo-estado]');
    var aviso = $('[data-resumo-limite]');
    if (!select.options.length) opcoesDeMes(select);
    mesEscolhido = lerSelect(select);

    lista.textContent = '';
    var botaoBaixar = $('[data-resumo-baixar]');
    var carregado = dados.conversas != null || dados.pedidos != null;
    if (botaoBaixar) botaoBaixar.disabled = !carregado || !window.PBRExportar;
    if (!carregado) {
      var blocoConteudos = $('[data-resumo-conteudos]');
      if (blocoConteudos) blocoConteudos.hidden = true;
      estadoTexto.textContent = 'Carregando os dados do painel…';
      estadoTexto.hidden = false;
      aviso.hidden = true;
      return;
    }
    estadoTexto.hidden = true;

    var m = mesEscolhido;
    var a = mesAnterior(m);
    var hoje = metricas(m);
    var antes = metricas(a);
    var inteiro = function (n) { return fNum.format(n); };
    var real = function (c) { return fReal.format(c / 100); };
    var pct = function (t) { return t == null ? '—' : fPct.format(t) + '%'; };

    if (dados.conversas != null) {
      cartao(lista, 'Conversas novas', inteiro(hoje.conversas), null, comparar(hoje.conversas, antes.conversas, a, inteiro));
      cartao(lista, 'Leads', inteiro(hoje.leads), 'Conversas com nome ou WhatsApp', comparar(hoje.leads, antes.leads, a, inteiro));
    }
    if (dados.pedidos != null) {
      cartao(lista, 'Pedidos pagos', inteiro(hoje.pagos), 'Pela data do pagamento', comparar(hoje.pagos, antes.pagos, a, inteiro));
      cartao(lista, 'Valor recebido', real(hoje.valor), 'Pedidos aprovados (sem reembolsados)', comparar(hoje.valor, antes.valor, a, real));
      cartao(lista, 'Conversão do checkout', pct(hoje.taxa),
        hoje.iniciados ? inteiro(hoje.iniciadosPagos) + ' de ' + inteiro(hoje.iniciados) + (hoje.iniciados === 1 ? ' pedido iniciado foi pago' : ' pedidos iniciados foram pagos') : 'Nenhum pedido iniciado no mês',
        comparar(hoje.taxa, antes.taxa, a, pct, 'taxa'));
      // Melhoria 83: situação de agora (não do mês escolhido), sem comparação.
      if (dados.atrasados != null) {
        cartao(lista, 'Pedidos atrasados', inteiro(dados.atrasados), 'Agora: briefing recebido há mais dias úteis que o prazo do plano',
          { seta: '', texto: dados.atrasados ? 'Veja na aba Pedidos, filtro Atrasados' : 'Nenhum site passou do prazo' });
      }
    }
    // Melhoria 88: depois dos cartões de pedidos (a ordem dos anteriores não muda).
    if (dados.conversas != null) cartoesResposta(lista, m, a);

    renderizarConteudos(m);

    var partes = [];
    if (dados.limiteConversas) partes.push('as ' + fNum.format(dados.conversas.length) + ' conversas mais recentes');
    if (dados.limitePedidos) partes.push('os ' + fNum.format(dados.pedidos.length) + ' pedidos mais recentes');
    aviso.hidden = !partes.length;
    aviso.textContent = partes.length ? 'O painel carrega só ' + partes.join(' e ') + '; meses mais antigos podem aparecer incompletos.' : '';
  }

  function cartoesResposta(lista, m, a) {
    if (!temHorarios()) {
      cartao(lista, 'Primeira resposta', 'Indisponível', 'O servidor não enviou os horários das mensagens',
        { seta: '', texto: 'Atualize a página para tentar de novo' });
      return;
    }
    var t = temposResposta(m);
    var t0 = temposResposta(a);
    var conta = function (n, um, varios) { return fNum.format(n) + ' ' + (n === 1 ? um : varios); };
    var base = conta(t.respondidas, 'conversa respondida', 'conversas respondidas') +
      (t.semResposta ? ' · ' + conta(t.semResposta, 'sem resposta', 'sem resposta') : '');
    var falta = 'Sem dados suficientes: ' + conta(t.respondidas, 'conversa respondida', 'conversas respondidas') +
      ' (mínimo ' + MINIMO_RESPOSTAS + ')' + (t.semResposta ? ' · ' + conta(t.semResposta, 'sem resposta', 'sem resposta') : '');
    cartao(lista, 'Primeira resposta (mediana)', t.suficiente ? duracao(t.mediana) : '—',
      t.suficiente ? 'Metade respondida nesse tempo · ' + base : falta, compararTempo(t.mediana, t0.mediana, a));
    cartao(lista, 'Primeira resposta (90%)', t.suficiente ? duracao(t.p90) : '—',
      t.suficiente ? '9 em cada 10 respondidas em até esse tempo' : 'Aparece com 5 ou mais conversas respondidas no mês',
      compararTempo(t.p90, t0.p90, a));
  }

  // ------------------------------------------------------------------ CSV (melhoria 76)
  // Números como a planilha em português entende: vírgula decimal, sem separador de milhar.
  function reaisCsv(c) { return (c / 100).toFixed(2).replace('.', ','); }
  function pctCsv(t) { return t == null ? '' : (Math.round(t * 10) / 10).toFixed(1).replace('.', ','); }
  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  // Linhas do arquivo (função pura sobre os dados carregados). Devolve null enquanto nada foi carregado.
  function linhasCsv(m) {
    if (dados.conversas == null && dados.pedidos == null) return null;
    var X = window.PBRExportar;
    var a = mesAnterior(m);
    var hoje = metricas(m);
    var antes = metricas(a);
    var nomeAtual = maiuscula(nomeMes(m, true));
    var nomeAntes = maiuscula(nomeMes(a, true));
    var cartoes = [];
    function linha(rotulo, chave, formato) { cartoes.push([rotulo, formato(hoje[chave]), formato(antes[chave])]); }
    var inteiro = function (n) { return String(n); };
    if (dados.conversas != null) {
      linha('Conversas novas', 'conversas', inteiro);
      linha('Leads (conversas com nome ou WhatsApp)', 'leads', inteiro);
    }
    if (dados.pedidos != null) {
      linha('Pedidos pagos (pela data do pagamento)', 'pagos', inteiro);
      linha('Valor recebido (R$, aprovados sem reembolsados)', 'valor', reaisCsv);
      linha('Pedidos iniciados', 'iniciados', inteiro);
      linha('Pedidos iniciados que foram pagos', 'iniciadosPagos', inteiro);
      linha('Conversão do checkout (%)', 'taxa', pctCsv);
    }
    if (dados.conversas != null && temHorarios()) {
      // Melhoria 88: minutos com uma casa (vazio quando há menos de 5 conversas respondidas).
      var t = temposResposta(m);
      var t0 = temposResposta(a);
      var minutos = function (ms) { return ms == null ? '' : (Math.round(ms / 6000) / 10).toFixed(1).replace('.', ','); };
      cartoes.push(['Primeira resposta, mediana (min)', minutos(t.mediana), minutos(t0.mediana)]);
      cartoes.push(['Primeira resposta, 90% em até (min)', minutos(t.p90), minutos(t0.p90)]);
      cartoes.push(['Conversas respondidas', String(t.respondidas), String(t0.respondidas)]);
      cartoes.push(['Conversas sem resposta', String(t.semResposta), String(t0.semResposta)]);
    }
    var col = function (i) { return function (l) { return l[i]; }; };
    var partes = [X.csv([
      { titulo: 'Resumo do mês', valor: col(0) },
      { titulo: nomeAtual, valor: col(1) },
      { titulo: nomeAntes + ' (mês anterior)', valor: col(2) }
    ], cartoes)];

    var r = porConteudo(m);
    var conteudos = r.linhas.map(function (l) {
      var rot = rotuloCta(l.cta);
      return [rot.nome, rot.tipo, String(l.conversas), String(l.pedidos), String(l.pagos)];
    });
    conteudos.push(['Total', '', String(r.totais.conversas), String(r.totais.pedidos), String(r.totais.pagos)]);
    if (dados.conversas != null) conteudos.push(['Todas as conversas do mês', '', String(r.totais.conversasMes), '', '']);
    if (dados.pedidos != null) conteudos.push(['Todos os pedidos do mês', '', '', String(r.totais.pedidosMes), '']);
    partes.push(X.csv([
      { titulo: 'De onde vieram os pedidos — ' + nomeMes(m, true), valor: col(0) },
      { titulo: 'Tipo', valor: col(1) },
      { titulo: 'Conversas', valor: col(2) },
      { titulo: 'Pedidos', valor: col(3) },
      { titulo: 'Pagos', valor: col(4) }
    ], conteudos));

    var avisos = [];
    var limite = $('[data-resumo-limite]');
    if (limite && !limite.hidden && limite.textContent) avisos.push([limite.textContent]);
    avisos.push(['Calculado no painel em ' + X.hoje() + '. Datas no fuso deste navegador.']);
    partes.push(X.csv([{ titulo: 'Observações', valor: col(0) }], avisos));
    return partes.join('\r\n');
  }

  function baixarCsv() {
    var X = window.PBRExportar;
    var status = $('[data-resumo-baixado]');
    if (!X || !mesEscolhido) return;
    var texto = linhasCsv(mesEscolhido);
    if (texto == null) return;
    X.baixar('resumo-portfolio-br-' + chaveMes(mesEscolhido.ano, mesEscolhido.mes) + '.csv', texto);
    if (status) status.textContent = 'Resumo de ' + nomeMes(mesEscolhido, true) + ' baixado em CSV.';
  }

  function celula(tr, tag, texto, attrs) { var c = el(tag, null, texto, attrs); tr.appendChild(c); return c; }

  function renderizarConteudos(m) {
    var bloco = $('[data-resumo-conteudos]');
    if (!bloco) return;
    var tabela = $('[data-resumo-conteudos-tabela]', bloco);
    var vazio = $('[data-resumo-conteudos-vazio]', bloco);
    var corpo = $('tbody', tabela);
    var pe = $('tfoot', tabela);
    var nota = $('[data-resumo-conteudos-nota]', bloco);
    var r = porConteudo(m);
    var inteiro = function (n) { return fNum.format(n); };
    bloco.hidden = false;
    $('[data-resumo-conteudos-mes]', bloco).textContent = nomeMes(m, true);
    corpo.textContent = '';
    pe.textContent = '';
    if (!r.linhas.length) {
      tabela.hidden = true;
      nota.hidden = true;
      vazio.hidden = false;
      vazio.textContent = 'Nenhuma conversa ou pedido de ' + nomeMes(m, true) + ' passou por um atalho para os planos (blog, segmentos, exemplos, simulador ou planos da página inicial).';
      return;
    }
    tabela.hidden = false;
    nota.hidden = false;
    vazio.hidden = true;
    r.linhas.forEach(function (l) {
      var rot = rotuloCta(l.cta);
      var tr = el('tr');
      var th = celula(tr, 'th', null, { scope: 'row' });
      th.appendChild(el('span', 'admin-conteudos__nome', rot.nome));
      th.appendChild(document.createTextNode(' ')); // "Moda Página de segmento" também para leitores de tela
      th.appendChild(el('span', 'admin-conteudos__tipo', rot.tipo));
      celula(tr, 'td', inteiro(l.conversas));
      celula(tr, 'td', inteiro(l.pedidos));
      celula(tr, 'td', inteiro(l.pagos));
      corpo.appendChild(tr);
    });
    var t = r.totais;
    var tr = el('tr');
    celula(tr, 'th', 'Total', { scope: 'row' });
    celula(tr, 'td', inteiro(t.conversas));
    celula(tr, 'td', inteiro(t.pedidos));
    celula(tr, 'td', inteiro(t.pagos));
    pe.appendChild(tr);
    // Para comparar: quanto do mês passou por um conteúdo (o resto veio por outros caminhos).
    var partes = [];
    if (dados.conversas != null) partes.push(inteiro(t.conversas) + ' de ' + inteiro(t.conversasMes) + (t.conversasMes === 1 ? ' conversa' : ' conversas'));
    if (dados.pedidos != null) partes.push(inteiro(t.pedidos) + ' de ' + inteiro(t.pedidosMes) + (t.pedidosMes === 1 ? ' pedido' : ' pedidos'));
    nota.textContent = 'No mês, ' + partes.join(' e ') + ' passaram por um desses conteúdos.';
  }

  document.addEventListener('pbr:admin-dados', function (e) {
    var d = e.detail || {};
    if (d.tipo === 'limpar') {
      dados = { conversas: null, pedidos: null, limiteConversas: false, limitePedidos: false, atrasados: null };
      var status = $('[data-resumo-baixado]');
      if (status) status.textContent = '';
    } else if (d.tipo === 'conversas') {
      dados.conversas = d.itens || [];
      dados.limiteConversas = !!d.limiteAtingido;
    } else if (d.tipo === 'pedidos') {
      dados.pedidos = d.itens || [];
      dados.limitePedidos = !!d.limiteAtingido;
      dados.atrasados = typeof d.atrasados === 'number' ? d.atrasados : null;
    } else return;
    renderizar();
  });

  // O relógio da aba Pedidos avisa quando um pedido passa do prazo sem mudança no banco.
  document.addEventListener('pbr:admin-atrasados', function (e) {
    if (dados.pedidos == null || !e.detail || typeof e.detail.atrasados !== 'number') return;
    dados.atrasados = e.detail.atrasados;
    renderizar();
  });

  function iniciar() {
    var select = $('[data-resumo-mes]');
    if (!select) return;
    opcoesDeMes(select);
    select.addEventListener('change', function () {
      var status = $('[data-resumo-baixado]');
      if (status) status.textContent = '';
      renderizar();
    });
    var botaoBaixar = $('[data-resumo-baixar]');
    if (botaoBaixar) botaoBaixar.addEventListener('click', baixarCsv);
    renderizar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Exposto para testes.
  window.PBRAdminResumo = { comparar: comparar, renderizar: renderizar, ctaDe: ctaDe, rotuloCta: rotuloCta, linhasCsv: linhasCsv,
    duracao: duracao, mediana: mediana, percentil: percentil, compararTempo: compararTempo };
})();
