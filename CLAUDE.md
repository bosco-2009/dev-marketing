# Contexto do projeto (para o Claude Code)

Loja "Dev Marketing": vende prompts que geram sites com IA. Dono atende pelo WhatsApp e recebe por Pix.
Idioma do site e das respostas: português do Brasil. Público acessa pelo celular: tudo é mobile-first.

## Arquitetura
- Site estático, sem build. `index.html` tem HTML, CSS e JS juntos. Sem frameworks.
- Externos: Google Fonts (Plus Jakarta Sans) e qrcodejs do cdnjs, carregado só na tela de pagamento.
- Estado em memória (`S`); localStorage só para conveniências (favoritos, carrinho, filtros, tema, pedidos, portão), sempre com try/catch.
- Janelas (sheets) usam o hash `#painel` / `#produto-N` para o botão voltar fechar.
- Preços em reais no catálogo; `totals()` calcula em centavos.
- Pix: `pixCode()` gera o BR Code estático com CRC16 e o código do pedido como txid.

## Regras do negócio que não podem ser quebradas
- Nada de dados inventados: sem avaliações falsas, sem "mais vendidos", sem preço "de/por" fictício. `REVIEWS` vazio oculta a seção.
- Enviar o pedido não conclui a compra: a entrega só acontece após o Pix cair na conta. O site nunca deve sugerir o contrário.
- Os arquivos de prompt (o produto) nunca entram no site nem neste repositório.
- Portão de entrada: maior de 18 (autodeclaração) + aceite dos termos.
- Abertura (`#intro`): tela de marca com três frases, uma vez por visita (sessionStorage), some sozinha em 3,6 s ou ao toque. As frases só podem afirmar o que a loja cumpre.
- Pacotes não entram no combo de 15%; pacote no carrinho substitui os avulsos que ele contém.
- Identidade própria: não copiar marca ou layout de outras empresas.

## Como testar
Abrir `index.html` num navegador em 390×844. Conferir: portão, filtros, produto, carrinho, cupom BEMVINDO10,
pagamento (QR aparece), tela "aguardando pagamento", Meus pedidos, comparar prompts, modo escuro, demos.

## Pendências
1. Dono vai criar conta em plataforma de vendas (Kiwify/Hotmart) e enviar links de checkout → preencher `link` em `PRODUCTS`.
2. Publicação: GitHub Pages a partir da branch `main`, pasta raiz. Endereço esperado: https://bosco-2009.github.io/dev-marketing/ (`STORE.url` já preenchido). O dono precisa tornar o repositório público e ativar o Pages nas configurações.
3. Atualizar Termos e FAQ para entrega automática nos produtos com `link`.
4. Ideias: uma imagem de divulgação por prompt, roteiros de Reels, prompts novos (blog, institucional, convite digital).

## Forma de trabalho combinada
A cada rodada, entregar as mudanças e propor 10 melhorias: 5 ajustes e 5 novidades. Dizer com clareza o que foi testado e o que não foi.
