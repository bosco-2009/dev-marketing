# Dev Marketing

Loja de prompts para criar sites com IA. Site estático, feito para celular, em roxo e branco.

- `index.html` — a loja (catálogo, filtros, carrinho, Pix com QR Code, pedido pelo WhatsApp)
- `agencia/` — página de vendas do serviço de lojas virtuais para moda + formulário de entrada
- `moda/` — loja de roupas de demonstração (e modelo para as lojas das clientes)
- `admin/` — painel de gestão interno (clientes, projetos e pagamentos), com login e dados no Supabase
- `demo/` — 9 sites de demonstração, um por prompt
- `divulgacao/` — imagens para Instagram
- `manifest.webmanifest` e ícones — atalho na tela inicial do celular

Os arquivos de prompt vendidos **não ficam neste repositório**.

## Editar
Tudo fica no `index.html`, no bloco "Configuração da loja": `STORE` (WhatsApp, Pix, horário, endereço do site),
`PRODUCTS` (produtos, preços, `link` de checkout da plataforma), `COUPONS`, `COMBO`, `REVIEWS`.

## Publicar
Qualquer hospedagem de site estático serve (GitHub Pages, Netlify, Vercel). Depois de publicar, preencha `STORE.url`.
