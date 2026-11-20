/*
 * admin-exportar.js — filtros de período/origem e exportação CSV do painel (melhoria 20).
 * Usado pelas abas Conversas (leads) e Pedidos. Tudo acontece no navegador do dono:
 * o CSV é montado aqui e baixado como arquivo (Blob), sem enviar dados a nenhum serviço.
 *
 *   PBRExportar.canal(texto)          → 'direto' | 'instagram' | 'google.com'… (de pedidos.origem ou conversas.pagina_origem)
 *   PBRExportar.rotuloCanal(canal)    → texto para o select ("Direto", "instagram"…)
 *   PBRExportar.noPeriodo(iso, p)     → p: 'tudo' | 'hoje' | '7' | '30' | 'mes'
 *   PBRExportar.preencherOrigens(select, canais)
 *   PBRExportar.csv(colunas, linhas)  → texto CSV (";" e CRLF, para o Excel em português)
 *   PBRExportar.baixar(nome, texto)
 */
(function () {
  'use strict';

  // Origem gravada por origem.js: "utm: instagram / social / lancamento · ref: l.instagram.com · entrada: /blog/".
  // O canal é a fonte da campanha (utm_source) ou, sem ela, o domínio de referência.
  function canal(texto) {
    var t = String(texto || '');
    var utm = /(?:^|·\s*)utm:\s*([^/·]+)/.exec(t);
    if (utm && utm[1].trim()) return utm[1].trim().toLowerCase();
    var ref = /(?:^|·\s*)ref:\s*([^\s·]+)/.exec(t);
    if (ref) return ref[1].trim().toLowerCase();
    return 'direto';
  }

  function rotuloCanal(c) { return c === 'direto' ? 'Direto (sem campanha)' : c; }

  function noPeriodo(iso, periodo) {
    if (!periodo || periodo === 'tudo') return true;
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return false;
    var agora = new Date();
    var inicio;
    if (periodo === 'hoje') inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    else if (periodo === 'mes') inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    else inicio = new Date(agora.getTime() - Number(periodo) * 24 * 60 * 60 * 1000);
    return t >= inicio.getTime();
  }

  // Recria as opções de origem a partir dos dados carregados, mantendo a escolha atual.
  function preencherOrigens(select, canais) {
    if (!select) return;
    var atual = select.value;
    var contagem = {};
    canais.forEach(function (c) { contagem[c] = (contagem[c] || 0) + 1; });
    var lista = Object.keys(contagem).sort(function (a, b) {
      if (a === 'direto') return -1;
      if (b === 'direto') return 1;
      return contagem[b] - contagem[a] || a.localeCompare(b, 'pt-BR');
    });
    if (atual && lista.indexOf(atual) === -1) lista.push(atual);
    select.textContent = '';
    var todas = document.createElement('option');
    todas.value = '';
    todas.textContent = 'Todas as origens';
    select.appendChild(todas);
    lista.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = rotuloCanal(c) + ' (' + (contagem[c] || 0) + ')';
      select.appendChild(o);
    });
    select.value = atual;
  }

  // Cada campo vira texto entre aspas. Campos que começam com = + - @ (ou tab/CR) ganham um apóstrofo
  // na frente para a planilha não executá-los como fórmula (injeção de CSV).
  function campo(v) {
    var s = v == null ? '' : String(v);
    s = s.replace(/\r\n?/g, '\n');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function csv(colunas, linhas) {
    var saida = [colunas.map(function (c) { return campo(c.titulo); }).join(';')];
    linhas.forEach(function (l) {
      saida.push(colunas.map(function (c) { return campo(c.valor(l)); }).join(';'));
    });
    return saida.join('\r\n') + '\r\n';
  }

  function baixar(nome, texto) {
    // BOM para o Excel reconhecer UTF-8 (acentos).
    var blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function hoje() {
    var d = new Date();
    function dois(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
  }

  window.PBRExportar = {
    canal: canal,
    rotuloCanal: rotuloCanal,
    noPeriodo: noPeriodo,
    preencherOrigens: preencherOrigens,
    csv: csv,
    baixar: baixar,
    hoje: hoje
  };
})();
