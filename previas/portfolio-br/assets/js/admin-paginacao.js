/*
 * admin-paginacao.js — listas longas do painel em páginas de 50 (melhoria 49).
 *
 * Conversas, pedidos e briefings pedem ao banco só os N mais recentes (range + count exato) e mostram
 * "Mostrando X de Y" com o botão "Carregar mais", que aumenta N em 50 e recarrega. O tempo real recarrega
 * com o mesmo N, então nada some da tela. Busca, filtros, resumo e exportação valem para o que já foi
 * carregado; o rodapé avisa isso quando há mais itens no banco. Sem mudança no banco.
 */
(function () {
  'use strict';

  var POR_PAGINA = 50;
  var fNum = new Intl.NumberFormat('pt-BR');

  function paraTexto(n, nomes) { return fNum.format(n) + ' ' + (n === 1 ? nomes[0] : nomes[1]); }

  /*
   * Cria o controle de uma lista. opcoes:
   *   raiz: elemento com [data-mais-conta], [data-mais-botao] e [data-mais-aviso]
   *   nomes: ['conversa', 'conversas'], feminino: true quando o nome é feminino
   *   lista: <ul> da lista (para levar o foco ao primeiro item novo)
   *   carregar: function () -> Promise (recarrega com o limite atual)
   */
  function criar(opcoes) {
    var raiz = opcoes.raiz;
    var limite = POR_PAGINA;
    var carregados = 0;
    var total = null;
    var ocupado = false;
    if (!raiz) return { limite: function () { return limite; }, atualizar: function () {}, reiniciar: function () {}, haMais: function () { return false; } };

    var conta = raiz.querySelector('[data-mais-conta]');
    var botao = raiz.querySelector('[data-mais-botao]');
    var aviso = raiz.querySelector('[data-mais-aviso]');

    function desenhar() {
      if (total == null || total === 0) { raiz.hidden = true; return; }
      raiz.hidden = false;
      var mais = carregados < total;
      conta.textContent = 'Mostrando ' + fNum.format(carregados) + ' de ' + paraTexto(total, opcoes.nomes) +
        (mais ? '. Filtros, busca e exportação valem para ' + (opcoes.feminino ? 'as carregadas.' : 'os carregados.') : '.');
      botao.hidden = !mais;
      if (!ocupado) {
        var falta = Math.min(POR_PAGINA, total - carregados);
        botao.textContent = 'Carregar mais ' + fNum.format(falta);
      }
    }

    // onclick (e não addEventListener): o painel pode iniciar de novo depois de sair e entrar.
    botao.onclick = function () {
      if (ocupado) return;
      ocupado = true;
      var antes = carregados;
      var vistos = {};
      if (opcoes.lista) opcoes.lista.querySelectorAll('[data-id]').forEach(function (b) { vistos[b.getAttribute('data-id')] = true; });
      limite += POR_PAGINA;
      botao.setAttribute('data-carregando', '');
      botao.setAttribute('aria-disabled', 'true');
      botao.textContent = 'Carregando…';
      Promise.resolve(opcoes.carregar()).then(function (resultado) {
        // carregar() devolve false quando a consulta falhou (o módulo já mostrou o erro na lista).
        if (resultado === false) {
          limite -= POR_PAGINA;
          aviso.textContent = 'Não foi possível carregar mais. Tente de novo.';
          botao.focus();
          return;
        }
        var novos = carregados - antes;
        aviso.textContent = novos > 0
          ? paraTexto(novos, opcoes.nomes) + ' a mais. Mostrando ' + fNum.format(carregados) + ' de ' + fNum.format(total) + '.'
          : 'Nada novo para carregar.';
        // Leva o foco ao primeiro item novo (se estiver visível com os filtros atuais); senão fica no botão.
        var alvo = null;
        if (novos > 0 && opcoes.lista) {
          alvo = Array.prototype.filter.call(opcoes.lista.querySelectorAll('[data-id]'), function (b) { return !vistos[b.getAttribute('data-id')]; })[0];
        }
        if (alvo) alvo.focus();
        else if (!botao.hidden) botao.focus();
      }, function () {
        limite -= POR_PAGINA;
        aviso.textContent = 'Não foi possível carregar mais. Tente de novo.';
      }).then(function () {
        ocupado = false;
        botao.removeAttribute('data-carregando');
        botao.removeAttribute('aria-disabled');
        desenhar();
      });
    };

    return {
      limite: function () { return limite; },
      // Depois de cada carga: quantos vieram e o total no banco (null se o servidor não informou).
      atualizar: function (n, t) {
        carregados = n;
        total = typeof t === 'number' ? Math.max(t, n) : n;
        desenhar();
      },
      haMais: function () { return total != null && carregados < total; },
      reiniciar: function () { limite = POR_PAGINA; carregados = 0; total = null; aviso.textContent = ''; raiz.hidden = true; }
    };
  }

  window.PBRPaginacao = { POR_PAGINA: POR_PAGINA, criar: criar };
})();
