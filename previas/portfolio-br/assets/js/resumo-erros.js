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
 *
 * Erro de cada campo (melhoria 102): PBRResumoErros.marcarCampo(entrada, alvo, mensagem, opcoes)
 *   - mensagem vazia: tira aria-invalid, esvazia e esconde a mensagem (nada sobra na descrição acessível:
 *     o Chromium lê um elemento oculto quando ele é citado direto por aria-describedby);
 *   - com mensagem: aria-invalid="true" e "Erro: " (só para leitor de tela) + a mensagem, ligada por aria-describedby;
 *   - opcoes.anunciar (ao sair do campo): anuncia UMA vez numa região polite própria do formulário, e só se a
 *     mensagem é nova; no envio não se anuncia nada (o foco vai para o resumo, que já é lido), para não repetir.
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

  // Garante que o id da mensagem esteja em aria-describedby (sem duplicar nem tirar as dicas que já estão lá).
  function ligarDescricao(entrada, id) {
    var ids = (entrada.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.indexOf(id) === -1) { ids.push(id); entrada.setAttribute('aria-describedby', ids.join(' ')); }
  }

  // Uma região de anúncio por formulário, criada vazia na primeira chamada (antes de receber texto).
  function regiaoDe(entrada) {
    var form = entrada.form || entrada.closest('form') || document.body;
    var r = form.querySelector('[data-anuncio-erro-campo]');
    if (!r) {
      r = document.createElement('p');
      r.className = 'visualmente-oculto';
      r.setAttribute('aria-live', 'polite');
      r.setAttribute('aria-atomic', 'true');
      r.setAttribute('data-anuncio-erro-campo', '');
      form.appendChild(r);
    }
    return r;
  }

  function anunciar(regiao, texto) {
    regiao.textContent = '';
    // Troca no quadro seguinte: o mesmo texto anunciado de novo (outro campo) também é lido.
    setTimeout(function () { regiao.textContent = texto; }, 60);
  }

  function marcarCampo(entrada, alvo, mensagem, opcoes) {
    opcoes = opcoes || {};
    var anterior = alvo.hidden ? '' : (alvo.getAttribute('data-mensagem') || '');
    var regiao = opcoes.anunciar ? regiaoDe(entrada) : null;
    if (mensagem) {
      entrada.setAttribute('aria-invalid', 'true');
      alvo.textContent = '';
      var prefixo = document.createElement('span');
      prefixo.className = 'visualmente-oculto';
      prefixo.textContent = 'Erro: ';
      alvo.appendChild(prefixo);
      alvo.appendChild(document.createTextNode(mensagem));
      alvo.setAttribute('data-mensagem', mensagem);
      alvo.hidden = false;
      ligarDescricao(entrada, alvo.id);
      if (regiao && anterior !== mensagem) anunciar(regiao, (opcoes.rotulo ? 'Erro em ' + opcoes.rotulo + ': ' : 'Erro: ') + mensagem);
    } else {
      entrada.removeAttribute('aria-invalid');
      alvo.textContent = '';
      alvo.removeAttribute('data-mensagem');
      alvo.hidden = true;
    }
    return !mensagem;
  }

  window.PBRResumoErros = { criar: criar, marcarCampo: marcarCampo };
})();
