/* Portfólio BR — Resumo de erros dos formulários (melhoria 59)
 * Padrão GOV.UK: ao tentar avançar com erros, um resumo "Corrija N campos" aparece no topo do formulário,
 * recebe o foco (o leitor de tela lê o título e a lista) e cada item é um link que leva ao campo.
 * Cada campo continua com a própria mensagem ligada por aria-describedby (feito no HTML/JS de cada página).
 * Usado por planos.js e briefing.js. Sem dados externos: textos só por textContent.
 *
 * Uso:
 *   var resumo = PBRResumoErros.criar({ id: 'checkout-resumo-erros', antesDe: elemento });
 *   resumo.mostrar([{ campo: input, mensagem: 'Informe seu nome.', rotulo: 'Nome' }]); // foca o resumo
 *   resumo.remover(input);   // o campo ficou certo: some da lista (o resumo some quando zera)
 *   resumo.esconder();
 */
(function () {
  'use strict';

  function rolagemSuave() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function tituloPara(n) {
    return n === 1 ? 'Corrija 1 campo para continuar' : 'Corrija ' + n + ' campos para continuar';
  }

  // Leva ao campo: o rótulo fica visível acima dele (como no GOV.UK), e o foco vai para a entrada.
  function irParaCampo(campo) {
    var alvo = (campo.labels && campo.labels[0] && !campo.labels[0].classList.contains('visualmente-oculto'))
      ? campo.labels[0] : campo;
    // Caixa de seleção: o rótulo fica ao lado; rolar o próprio campo basta.
    if (campo.type === 'checkbox' || campo.type === 'radio') alvo = campo;
    campo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: 'start', behavior: rolagemSuave() });
  }

  function criar(opcoes) {
    var id = opcoes.id;
    var caixa = document.createElement('div');
    caixa.className = 'resumo-erros';
    caixa.id = id;
    caixa.setAttribute('role', 'group');
    caixa.setAttribute('aria-labelledby', id + '-titulo');
    caixa.setAttribute('tabindex', '-1');
    caixa.setAttribute('data-resumo-erros', '');
    caixa.hidden = true;

    var titulo = document.createElement('h2');
    titulo.className = 'resumo-erros__titulo';
    titulo.id = id + '-titulo';
    caixa.appendChild(titulo);

    var lista = document.createElement('ul');
    lista.className = 'resumo-erros__lista';
    caixa.appendChild(lista);

    opcoes.antesDe.parentNode.insertBefore(caixa, opcoes.antesDe);

    var itens = []; // [{ campo, li }]

    function atualizarTitulo() { titulo.textContent = tituloPara(itens.length); }

    function mostrar(erros, naoFocar) {
      lista.textContent = '';
      itens = [];
      erros.forEach(function (e) {
        if (!e.campo.id) return;
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + e.campo.id;
        a.textContent = e.rotulo ? e.rotulo + ': ' + e.mensagem : e.mensagem;
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          irParaCampo(e.campo);
        });
        li.appendChild(a);
        lista.appendChild(li);
        itens.push({ campo: e.campo, li: li });
      });
      if (!itens.length) { esconder(); return; }
      atualizarTitulo();
      caixa.hidden = false;
      if (!naoFocar) {
        caixa.focus({ preventScroll: true });
        caixa.scrollIntoView({ block: 'start', behavior: rolagemSuave() });
      }
    }

    // Um campo corrigido sai da lista na hora; o título acompanha a contagem.
    function remover(campo) {
      if (caixa.hidden) return;
      itens = itens.filter(function (it) {
        if (it.campo !== campo) return true;
        it.li.remove();
        return false;
      });
      if (!itens.length) esconder(); else atualizarTitulo();
    }

    function esconder() {
      caixa.hidden = true;
      lista.textContent = '';
      itens = [];
    }

    return { mostrar: mostrar, remover: remover, esconder: esconder, elemento: caixa };
  }

  window.PBRResumoErros = { criar: criar };
})();
