/*
 * admin-resumo.js — aba "Resumo" do painel (melhoria 32).
 * Cartões do mês escolhido (conversas novas, leads, pedidos pagos, valor recebido e conversão do checkout),
 * comparados ao mês anterior. Tudo é calculado no navegador a partir dos dados que as abas Conversas e Pedidos
 * já carregaram (evento "pbr:admin-dados"): nenhuma consulta nova ao banco, nenhuma tabela nova.
 *
 * Cada cartão tem um texto completo ("2 a mais que em outubro (3)") — a seta é só decoração (aria-hidden).
 */
(function () {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var fReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fNum = new Intl.NumberFormat('pt-BR');
  var fPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  var dados = { conversas: null, pedidos: null, limiteConversas: false, limitePedidos: false };
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
      if (comp.seta === '▲') s.setAttribute('data-direcao', 'sobe');
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
    if (dados.conversas == null && dados.pedidos == null) {
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
    }

    var partes = [];
    if (dados.limiteConversas) partes.push('as ' + fNum.format(dados.conversas.length) + ' conversas mais recentes');
    if (dados.limitePedidos) partes.push('os ' + fNum.format(dados.pedidos.length) + ' pedidos mais recentes');
    aviso.hidden = !partes.length;
    aviso.textContent = partes.length ? 'O painel carrega só ' + partes.join(' e ') + '; meses mais antigos podem aparecer incompletos.' : '';
  }

  document.addEventListener('pbr:admin-dados', function (e) {
    var d = e.detail || {};
    if (d.tipo === 'limpar') {
      dados = { conversas: null, pedidos: null, limiteConversas: false, limitePedidos: false };
    } else if (d.tipo === 'conversas') {
      dados.conversas = d.itens || [];
      dados.limiteConversas = !!d.limiteAtingido;
    } else if (d.tipo === 'pedidos') {
      dados.pedidos = d.itens || [];
      dados.limitePedidos = !!d.limiteAtingido;
    } else return;
    renderizar();
  });

  function iniciar() {
    var select = $('[data-resumo-mes]');
    if (!select) return;
    opcoesDeMes(select);
    select.addEventListener('change', renderizar);
    renderizar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Exposto para testes.
  window.PBRAdminResumo = { comparar: comparar, renderizar: renderizar };
})();
