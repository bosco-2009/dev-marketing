/*
 * config.js — ÚNICO lugar com textos, preços e contatos que dependem de decisão do dono.
 *
 * Tudo marcado com [PROVISÓRIO] precisa ser revisado/preenchido antes da publicação (ver PUBLICAR.md).
 * Para encontrar todos: procure por "[PROVISÓRIO]" neste arquivo.
 *
 * Regras:
 * - Nunca coloque depoimentos, números ou clientes que não sejam reais.
 * - Listas vazias escondem a seção correspondente no site (ex.: portfolio.projetos).
 * - Campos de contato vazios ('') escondem o link correspondente.
 * - Nada secreto aqui: este arquivo é público. Chaves do Mercado Pago ficam só no Supabase.
 *
 * Exceção conhecida: a URL do site também aparece nas tags <link rel="canonical"> e Open Graph
 * do <head> de cada página, porque robôs de redes sociais não executam JavaScript.
 * Ao trocar `site.url`, troque também nessas tags (procure por "bosco-2009.github.io").
 */
(function () {
  'use strict';

  var config = {
    // Enquanto true: mostra a faixa "rascunho" no topo das páginas.
    // Mudar para false só ao publicar, junto com a remoção do <meta name="robots" content="noindex"> (ver PUBLICAR.md).
    rascunho: true,

    // Supabase (Fase 2). Só a URL do projeto e a chave PÚBLICA (anon ou publishable "sb_publishable_...").
    // NUNCA coloque aqui a service_role/secret key nem o token do Mercado Pago.
    // Com url/anonKey vazios, o chat ao vivo fica oculto e o painel /admin/ mostra um aviso.
    supabase: {
      url: 'https://mqjpccrxsyajcgbdifld.supabase.co',
      anonKey: 'sb_publishable_Vbab8OYKOwI9st4UfW45Xg_3FojwOXj' // chave publicável (pública por definição)
    },

    site: {
      nome: 'Portfólio BR',
      url: 'https://bosco-2009.github.io/empresa-jp/' // [PROVISÓRIO] trocar se houver domínio próprio
    },

    empresa: {
      razaoSocial: '', // [PROVISÓRIO] razão social que aparece no rodapé (vazio = oculto)
      cnpj: '', // [PROVISÓRIO] ex.: '00.000.000/0001-00' (vazio = oculto)
      cidade: '' // [PROVISÓRIO] ex.: 'São Paulo/SP' (vazio = oculto)
    },

    contato: {
      instagram: 'portifolio_br',
      whatsapp: '', // [PROVISÓRIO] só dígitos com DDI e DDD, ex.: '5511999999999' (vazio = oculto)
      whatsappMensagem: 'Olá! Vim pelo site da Portfólio BR e quero saber mais sobre os sites.', // [PROVISÓRIO]
      email: '' // [PROVISÓRIO] ex.: 'contato@seudominio.com.br' (vazio = oculto)
    },

    // Usado pelo chat ao vivo (Fase 2): fora deste horário, o widget oferece o WhatsApp.
    atendimento: {
      fusoHorario: 'America/Sao_Paulo',
      // 0 = domingo ... 6 = sábado. Horários no formato 'HH:MM'.
      horarios: [ // [PROVISÓRIO]
        { dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00' },
        { dias: [6], inicio: '09:00', fim: '13:00' }
      ],
      textoHorario: 'Segunda a sexta, das 9h às 18h, e sábado, das 9h às 13h.' // [PROVISÓRIO]
    },

    pagamento: {
      // [PROVISÓRIO] confirmar condições de parcelamento configuradas na conta do Mercado Pago.
      textoParcelamento: 'Pix, boleto ou cartão em até 12x pelo Mercado Pago.'
    },

    // [PROVISÓRIO] nomes, preços, itens, prazos e número de ajustes de TODOS os planos.
    // ATENÇÃO: o valor COBRADO vem da tabela public.planos do Supabase (o front nunca define o preço).
    // Ao mudar id, nome ou precoCentavos aqui, mude também no banco (ver supabase/README.md).
    // O teste testes/funcoes/precos.test.mjs falha se os dois ficarem diferentes.
    planos: [
      {
        id: 'essencial',
        nome: 'Essencial',
        resumo: 'Uma página completa para colocar seu negócio na internet.',
        precoCentavos: 49700,
        destaque: false,
        prazo: 'Entrega em até 7 dias úteis após o briefing',
        itens: [
          'Página única (landing page) com até 6 seções',
          'Design sob medida, pensado para o celular',
          'Botão de WhatsApp, Instagram e mapa do Google',
          'SEO básico para aparecer no Google',
          'Publicação do site inclusa',
          '1 rodada de ajustes'
        ]
      },
      {
        id: 'profissional',
        nome: 'Profissional',
        resumo: 'Site com várias páginas para apresentar tudo o que você faz.',
        precoCentavos: 99700,
        destaque: true,
        selo: 'Mais indicado',
        prazo: 'Entrega em até 15 dias úteis após o briefing',
        itens: [
          'Tudo do plano Essencial',
          'Até 5 páginas (ex.: início, sobre, serviços, galeria, contato)',
          'Formulário de contato',
          'Galeria de fotos dos seus trabalhos',
          '2 rodadas de ajustes'
        ]
      },
      {
        id: 'premium',
        nome: 'Premium',
        resumo: 'Para quem quer mostrar produtos ou um cardápio completo.',
        precoCentavos: 179700,
        destaque: false,
        prazo: 'Entrega em até 20 dias úteis após o briefing',
        itens: [
          'Tudo do plano Profissional',
          'Até 10 páginas',
          'Catálogo de produtos ou cardápio online com pedido pelo WhatsApp',
          'Textos revisados para venda',
          '3 rodadas de ajustes'
        ]
      }
    ],

    // [PROVISÓRIO] confirmar cada garantia/política antes de publicar.
    garantias: [
      {
        titulo: 'Pagamento seguro',
        texto: 'Você paga pelo Mercado Pago. Não pedimos nem guardamos os dados do seu cartão.'
      },
      {
        titulo: 'Você aprova antes de publicar',
        texto: 'O site só vai ao ar depois que você vê a versão final e aprova.'
      },
      {
        titulo: 'Ajustes inclusos',
        texto: 'Cada plano já inclui rodadas de ajustes para deixar o site do seu jeito.'
      },
      {
        titulo: 'Direito de arrependimento',
        texto: 'Desistiu em até 7 dias da compra? Devolvemos o valor pago integralmente, como prevê o Código de Defesa do Consumidor.'
      }
    ],

    // [PROVISÓRIO] revisar todas as respostas (dependem de políticas da empresa).
    faq: [
      {
        pergunta: 'Quanto tempo leva para meu site ficar pronto?',
        resposta: 'Depende do plano: de 7 a 20 dias úteis, contados a partir do envio do briefing completo, com textos e fotos.'
      },
      {
        pergunta: 'O que eu preciso enviar?',
        resposta: 'Depois do pagamento, você preenche um briefing simples: nome do negócio, serviços, contatos, logo (se tiver) e fotos. Se não tiver fotos ou logo, a gente orienta.'
      },
      {
        pergunta: 'O domínio (www.seunegocio.com.br) está incluso?',
        resposta: 'Ajudamos você a registrar o domínio no seu próprio nome, no Registro.br. O valor anual do domínio é pago diretamente ao Registro.br.'
      },
      {
        pergunta: 'Tem mensalidade?',
        resposta: 'O valor do plano é pago uma única vez. Manutenção e alterações depois da entrega podem ser contratadas à parte, se você quiser.'
      },
      {
        pergunta: 'Meu site vai aparecer no Google?',
        resposta: 'Todos os planos incluem SEO básico: títulos, descrições e estrutura que o Google entende. A posição nos resultados depende de vários fatores e ninguém pode garantir o primeiro lugar.'
      },
      {
        pergunta: 'Quais as formas de pagamento?',
        resposta: 'Pix, boleto ou cartão de crédito, tudo pelo Mercado Pago.'
      },
      {
        pergunta: 'Atendem qualquer cidade?',
        resposta: 'Sim. O atendimento é 100% online, para pequenos negócios de todo o Brasil.'
      }
    ],

    // Simulador "Qual plano é para mim?" da home. Usa os ids de config.planos.
    // A recomendação é o MAIOR plano (na ordem de config.planos) entre as regras que se aplicam.
    simulador: { // [PROVISÓRIO] confirmar as regras de recomendação
      porPaginas: { uma: 'essencial', ate5: 'profissional', mais: 'premium', naoSei: 'profissional' },
      vendeOnline: 'premium', // precisa de catálogo/cardápio com pedido online
      motivos: {
        uma: 'Uma página completa já apresenta bem o seu negócio.',
        ate5: 'Até 5 páginas para apresentar serviços, galeria e contato com calma.',
        mais: 'Mais de 5 páginas para organizar bastante conteúdo.',
        naoSei: 'Na dúvida, um site com algumas páginas dá espaço para crescer.',
        vendeOnline: 'Inclui catálogo de produtos ou cardápio com pedido pelo WhatsApp.',
        dominioSim: 'Usamos o domínio que você já tem.',
        dominioNao: 'Ajudamos você a registrar o domínio no seu nome (o valor anual é pago ao Registro.br).'
      }
    },

    // Usado em termos.html e privacidade.html. Revisar com um(a) advogado(a) antes de publicar.
    legal: {
      atualizadoEm: '19/11/2026', // [PROVISÓRIO] data da última revisão dos termos e da política
      retencaoChatMeses: 12, // [PROVISÓRIO] conversas do chat são apagadas X meses após a última mensagem
      retencaoBriefingMeses: 12, // [PROVISÓRIO] briefing e arquivos apagados X meses após a entrega do site
      retencaoPedidosAnos: 5, // [PROVISÓRIO] registros de venda (obrigações fiscais/contábeis; confirmar com o contador)
      suportePosEntregaDias: 30, // [PROVISÓRIO] correção de erros sem custo após a publicação
      respostaClienteDias: 15, // [PROVISÓRIO] prazo para o cliente responder/aprovar antes de o projeto ser pausado
      pausaInatividadeDias: 90, // [PROVISÓRIO] projeto parado por falta de retorno do cliente pode ser encerrado
      // [PROVISÓRIO] política de cancelamento depois dos 7 dias do direito de arrependimento
      cancelamentoApos7Dias: 'Depois desse prazo, o cancelamento pode ser pedido a qualquer momento antes da entrega. Nesse caso, devolvemos o valor pago descontada a parte proporcional ao trabalho já realizado, que informaremos por escrito antes do reembolso.'
    },

    // Só projetos REAIS e autorizados pelo cliente. Lista vazia = seção oculta.
    // Formato: { nome, segmento, url, imagem, alt }
    portfolio: {
      projetos: []
    },

    // Só depoimentos REAIS e autorizados. Lista vazia = seção oculta.
    // Formato: { nome, negocio, texto }
    depoimentos: []
  };

  function congelar(obj) {
    Object.keys(obj).forEach(function (chave) {
      var valor = obj[chave];
      if (valor && typeof valor === 'object') congelar(valor);
    });
    return Object.freeze(obj);
  }

  window.PBR_CONFIG = congelar(config);
})();
