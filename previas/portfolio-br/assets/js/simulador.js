/*
 * simulador.js — "Qual plano é para mim?" (home).
 * As regras ficam em config.simulador (ids de config.planos); a recomendação é o MAIOR plano, na ordem de
 * config.planos, entre as regras que se aplicam. Resultado anunciado numa região aria-live.
 * Sem JavaScript a seção continua oculta (não há como calcular).
 */
(function () {
  'use strict';
  var config = window.PBR_CONFIG;
  var secao = document.querySelector('[data-simulador]');
  if (!config || !secao || !config.simulador || !config.planos || !config.planos.length) return;

  var regras = config.simulador;
  var form = secao.querySelector('[data-sim-form]');
  var espera = secao.querySelector('[data-sim-espera]');
  var caixa = secao.querySelector('[data-sim-recomendacao]');
  var nomePlano = secao.querySelector('[data-sim-plano]');
  var preco = secao.querySelector('[data-sim-preco]');
  var motivos = secao.querySelector('[data-sim-motivos]');
  var cta = secao.querySelector('[data-sim-cta]');
  var exemplo = secao.querySelector('[data-sim-exemplo]');
  var formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var EXEMPLOS = { moda: 'moda', restaurante: 'restaurante', beleza: 'beleza', saude: 'saude', servicos: 'servicos', pet: 'pet' };
  var SEGMENTO = { moda: 'loja', restaurante: 'restaurante', beleza: 'salão de beleza', saude: 'clínica', servicos: 'serviços', pet: 'pet shop' };

  function ordem(id) {
    for (var i = 0; i < config.planos.length; i++) if (config.planos[i].id === id) return i;
    return -1;
  }
  function valor(nome) {
    var r = form.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : '';
  }
  function iconeCheck() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-check');
    svg.appendChild(use);
    return svg;
  }

  // Exportada para testes: recebe as respostas e devolve { plano, motivos }
  function recomendar(r) {
    var candidatos = [];
    var lista = [];
    if (r.paginas && regras.porPaginas[r.paginas]) {
      candidatos.push(regras.porPaginas[r.paginas]);
      if (regras.motivos[r.paginas]) lista.push(regras.motivos[r.paginas]);
    }
    if (r.vende === 'sim' && regras.vendeOnline) {
      candidatos.push(regras.vendeOnline);
      lista.push(regras.motivos.vendeOnline);
    }
    var melhor = null;
    candidatos.forEach(function (id) { if (ordem(id) > ordem(melhor)) melhor = id; });
    if (r.dominio === 'sim') lista.push(regras.motivos.dominioSim);
    else if (r.dominio) lista.push(regras.motivos.dominioNao);
    var plano = config.planos[ordem(melhor)] || null;
    return { plano: plano, motivos: lista.filter(Boolean) };
  }
  window.PBRSimulador = { recomendar: recomendar };

  function atualizar() {
    var r = { tipo: valor('tipo'), vende: valor('vende'), paginas: valor('paginas'), dominio: valor('dominio') };
    var pronto = r.vende && r.paginas;
    var res = pronto ? recomendar(r) : null;
    espera.hidden = !!(res && res.plano);
    caixa.hidden = !(res && res.plano);
    if (!res || !res.plano) return;
    nomePlano.textContent = 'Plano ' + res.plano.nome;
    preco.textContent = formato.format(res.plano.precoCentavos / 100) + ' · pagamento único';
    motivos.textContent = '';
    res.motivos.concat(res.plano.prazo ? [res.plano.prazo + '.'] : []).forEach(function (m) {
      var li = document.createElement('li');
      li.appendChild(iconeCheck());
      var t = document.createElement('span');
      t.textContent = m;
      li.appendChild(t);
      motivos.appendChild(li);
    });
    cta.href = 'planos.html?plano=' + encodeURIComponent(res.plano.id);
    cta.textContent = 'Contratar o plano ' + res.plano.nome;
    if (EXEMPLOS[r.tipo]) {
      exemplo.href = 'exemplos/' + EXEMPLOS[r.tipo] + '.html';
      exemplo.textContent = 'Ver um site de exemplo de ' + SEGMENTO[r.tipo];
      exemplo.hidden = false;
    } else {
      exemplo.hidden = true;
    }
  }

  form.addEventListener('change', atualizar);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  secao.hidden = false;
  atualizar();
})();
