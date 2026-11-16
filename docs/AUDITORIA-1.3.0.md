# Auditoria de performance e segurança — 1.3.0 (16/11/2026)

Escopo: servidor (`apps/server`), cliente web (`apps/web`), app desktop (`apps/desktop`),
atualizador (`apps/updater`) e a instalação (`infra`). O que foi corrigido já está nesta versão; o
que ficou como recomendação está no fim, com o motivo.

## Performance

| # | Achado | Impacto | O que foi feito |
|---|---|---|---|
| P1 | O app não comprimia nada e o Traefik do Easypanel (rota por arquivo) também não. O código do escritório ia com 2,3 MB; o dist inteiro, 10,9 MB. | Entrada lenta no escritório, principalmente em 4G e na primeira abertura do app. | O build gera `.br` e `.gz` (`apps/web/scripts/compress.mjs`) e o servidor entrega o comprimido a quem aceita (`preCompressed`). Escritório: **2,35 MB → 472 KB** (brotli). Dist: 10,9 MB → 3,0 MB. Sem CPU extra por acesso e sem depender do proxy. |
| P2 | Arquivos com hash no nome tinham cache de 1 hora. | Depois de 1 hora, cada abertura revalidava todos os arquivos. | `/assets/*` com `max-age=1 ano, immutable`; `index.html` com `no-cache` (versão nova aparece na hora); o resto, 1 dia. |
| P3 | App desktop: `backgroundThrottling: false` (necessário para a call continuar) fazia o Chromium achar que a página estava sempre visível. O mapa (Phaser/WebGL) era redesenhado ~60 vezes por segundo com a janela escondida, minimizada ou no Modo Mini. | CPU, GPU e bateria gastos o dia inteiro sem ninguém ver o mapa. | O app avisa a página quando a janela some ou volta (`window-visible`) e o loop do Phaser dorme e acorda. No navegador o próprio Phaser já pausava com a aba em segundo plano. |
| P4 | Mensagens do tempo real sem limite por pessoa. | Um cliente com defeito em loop (chat, recados, decoração) gravava no banco a cada mensagem e repassava a todos. | Limite por pessoa e por tipo (balde de fichas), bem acima do uso normal; o excesso é descartado. |

Conferido e sem mudança:

- **Servidor:** o tick de 20 Hz só recalcula as conexões de áudio e vídeo quando alguém se move ou
  muda de estado; a colisão e as áreas são índices por tile; as tabelas que crescem (chat,
  presença, status, chamadas, auditoria) têm índice por escritório e data.
- **Cliente:** o JS inicial é de 143 KB (gzip); o escritório (Phaser, LiveKit, Colyseus), o
  Mapmaker e o quadro branco (Excalidraw) carregam à parte, só quando usados. A interface React
  recebe as posições a cada 200 ms e os retratos ficam em cache (melhorias da 1.1).
- **Limite conhecido:** o FPS em placa de vídeo de verdade não dá para medir aqui (só WebGL por
  software). Se o escritório não ficar fluido em algum computador, "Reduzir animações" ajuda.

## Segurança

| # | Achado | Gravidade | O que foi feito |
|---|---|---|---|
| S1 | `trustProxy: true`: o app aceitava o `X-Forwarded-For` de qualquer um. Com a porta do app acessível de fora (instalação com `BIND_ADDR` diferente de 127.0.0.1 e sem firewall), dava para forjar o IP e escapar do limite de tentativas de login. | Alta (depende da instalação) | Só proxies da própria máquina ou de rede privada são confiáveis por padrão; `TRUST_PROXY` permite outra lista. |
| S2 | O limite de login era por usuário+IP: com vários IPs, a força bruta numa conta não tinha teto. | Média | Teto extra por usuário (25 falhas em 15 min, de qualquer IP). Senhas continuam com Argon2id e Donos/Admins com 2FA. |
| S3 | Tempo real sem limite de mensagens (ver P4). | Média | Limite por pessoa e por tipo. |
| S4 | Dependências: `pnpm audit` de produção com **45 alertas (18 altos)** — nodemailer 6, @fastify/static 8 (bypass de rota/travessia de caminho), drizzle-orm 0.39 (injeção em identificadores), zod 3, lodash-es/katex/nanoid indiretos. | Alta | nodemailer 10, @fastify/static 10, drizzle-orm 0.45, zod 4 e overrides para os indiretos. Sobra só o nanoid 2.1.11 dentro do Colyseus: os alertas dele são de tamanhos negativos/zero/fracionados, e o Colyseus usa tamanho fixo. Todos os testes passam com as versões novas. |
| S5 | Pôster da mesa do funcionário aceitava qualquer link https. | Baixa | Na mesa do funcionário, só imagem enviada ao próprio servidor (um link externo registraria o IP de todo mundo que olha o pôster). O Mapmaker (Dono/Admin) continua aceitando link. |
| S6 | Funcionário podia pegar uma mesa da sala dos sócios. | Baixa | Só Dono e Admin pegam essas mesas. |
| S7 | O atualizador comparava o token com `!==`. | Baixa (rede interna) | Comparação em tempo constante. |

Funcionário fora da própria mesa: todas as mensagens do tempo real que mudam o mapa foram revistas.
Decorar (`decor:*`) exige mesa própria e posição dentro da área dela; o look da mesa (modelo, cor,
setup, cadeira, tapete) só na própria mesa, e o modelo só troca por outro do mesmo tamanho; o
Mapmaker e todas as rotas do mapa exigem Dono/Admin do escritório. Há teste de servidor para cada caso.

Conferido e sem mudança: sessões e convites guardados só como hash; Argon2id; segredos com
AES-256-GCM; 2FA obrigatório para Dono e Admin; cookie `HttpOnly`/`SameSite=Lax` e checagem de
origem nas requisições que mudam dados; CSP; upload com conferência do tipo real do arquivo e nome
aleatório; token do LiveKit só para quem o servidor confirma dentro da sala; app desktop com
`contextIsolation`, `sandbox`, sem Node na página, navegação presa ao servidor, permissões de
câmera/microfone só para a própria origem e IPC conferindo o remetente; atualizador só com versão
`X.Y.Z` e lista fixa de serviços; portas do app e do LiveKit ligadas em 127.0.0.1 por padrão.

## Recomendações (não aplicadas nesta versão)

1. **Atualizar o Electron (34 → 42).** O 34 está fora de suporte e acumula correções do Chromium
   (alertas altos no `pnpm audit` completo). É a recomendação mais importante, mas são 8 versões
   de uma vez num app que se atualiza sozinho: um app quebrado no Mac ou no Windows pode também
   quebrar a atualização automática. Fazer numa versão própria, com o instalador de teste
   (`release-test/**`) aberto no Mac e no Windows antes de publicar. O `electron-builder` 25 → 26
   (alertas só no build) vai junto.
2. **CSP mais fechada.** Hoje o `connect-src` aceita qualquer `ws:`/`wss:` e o `frame-src` qualquer
   `https:` (por causa dos sites que o Admin coloca no mapa). Dá para listar só o servidor do
   LiveKit e os domínios usados.
3. **Código de 2FA de uso único.** O mesmo código vale dentro da janela de 90 s. Guardar o último
   contador usado por conta impede reaproveitar um código visto por alguém.
4. **Dependências de desenvolvimento** (vitest 3, drizzle-kit/esbuild) têm alertas, mas não vão
   para o servidor nem para o app: atualizar quando for conveniente.
