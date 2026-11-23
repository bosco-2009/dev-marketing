/*
 * supabase-client.js — carrega a biblioteca supabase-js (CDN com versão fixa + SRI) sob demanda
 * e devolve um cliente único por página.
 *
 *   PBRSupabase.configurado()           -> true se config.js tiver supabase.url e supabase.anonKey
 *   PBRSupabase.cliente(opcoes) : Promise<SupabaseClient>
 *   PBRSupabase.aquecer()               -> começa a baixar a biblioteca (sem criar cliente nem abrir conexão);
 *                                          usado quando o visitante demonstra intenção (ex.: passa o dedo/mouse no chat)
 *
 * Só a URL do projeto e a chave pública (anon/publishable) ficam no front.
 */
(function () {
  'use strict';

  // Atualizar versão e hash juntos. Hash: openssl dgst -sha384 -binary supabase.js | base64
  var BIBLIOTECA = {
    url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js',
    integridade: 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK'
  };

  var carregamento = null;
  var instancia = null;

  function dados() {
    var c = window.PBR_CONFIG;
    return (c && c.supabase) || {};
  }

  function configurado() {
    var s = dados();
    // HTTPS obrigatório; http só para desenvolvimento local (localhost / 127.0.0.1).
    return typeof s.url === 'string' && /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?)$/.test(s.url) &&
      typeof s.anonKey === 'string' && s.anonKey.length > 20;
  }

  function carregarBiblioteca() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (carregamento) return carregamento;
    carregamento = new Promise(function (resolver, rejeitar) {
      var s = document.createElement('script');
      s.src = BIBLIOTECA.url;
      s.integrity = BIBLIOTECA.integridade;
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = function () {
        if (window.supabase && window.supabase.createClient) resolver(window.supabase);
        else rejeitar(new Error('supabase-js carregou sem createClient'));
      };
      s.onerror = function () {
        carregamento = null;
        s.remove();
        rejeitar(new Error('Falha ao carregar supabase-js'));
      };
      document.head.appendChild(s);
    });
    return carregamento;
  }

  function cliente(opcoes) {
    if (!configurado()) return Promise.reject(new Error('Supabase não configurado'));
    if (instancia) return Promise.resolve(instancia);
    return carregarBiblioteca().then(function (lib) {
      if (!instancia) instancia = lib.createClient(dados().url, dados().anonKey, opcoes || {});
      return instancia;
    });
  }

  // Só baixa o arquivo (fica no cache da página); erros são ignorados e o próximo cliente() tenta de novo.
  function aquecer() {
    if (!configurado()) return;
    carregarBiblioteca().catch(function () { /* tenta de novo ao abrir */ });
  }

  window.PBRSupabase = { configurado: configurado, cliente: cliente, aquecer: aquecer };
})();
