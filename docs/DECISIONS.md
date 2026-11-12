# Decisões técnicas

Registro das decisões tomadas durante a construção: o que foi escolhido, o que foi descartado e por quê.

## Diferenças em relação ao plano original

| # | Plano | Decisão | Motivo |
|---|---|---|---|
| 1 | Prisma | **Drizzle ORM** + migrações SQL | Sem binários nativos: imagem Docker menor, build mais simples e testes rodando em um PostgreSQL embutido (PGlite), sem precisar de banco externo. |
| 2 | Serviços `server` e `worker` separados | **Um único container `app`** (API + tempo real + tarefas) | Menos memória em uma VPS que divide espaço com outro sistema. Dá para separar depois com `ROLE=api` / `ROLE=worker`. |
| 3 | Faixa de portas UDP 50000–50200 e TURN em 3478/5349 | **Uma porta UDP (7882) + 7881/tcp**, sem TURN | O LiveKit multiplexa toda a mídia em uma porta: menos regras de firewall e nenhum risco de colisão com outros serviços. O TCP 7881 cobre redes que bloqueiam UDP. Redes que só liberam 443 não conectam (limitação conhecida). |
| 4 | Whisper escolhido uma vez (`small` ou `base`) | **`WHISPER_MODEL=auto`**: `small` com ≥ 3 GB livres, `base` com ≥ 1,2 GB, senão `tiny` | A VPS é compartilhada; o modelo se ajusta à memória disponível na subida. |
| 5 | Deploy por SSH durante a construção | **`infra/install.sh`** rodado pelo dono da VPS | A sessão de construção não tinha acesso à VPS. O instalador faz a descoberta, não toca em nada existente e é testado no CI. |
| 6 | Registro principal com nuvem laranja | **Os dois registros como "DNS only"** (recomendado) | É o caminho mais simples para o HTTPS automático sair de primeira. A nuvem laranja no domínio principal continua funcionando (SSL *Full (strict)*). |
| 7 | Editar o proxy do CRM automaticamente | **Não alterar**: o instalador mostra o que acrescentar e deixa exemplos prontos | Cada proxy (nginx no host, em container, Traefik, painel de hospedagem) é diferente; editar às cegas é o maior risco para o sistema que já está em produção. |
| 8 | Expansão "a leste, depois a sul" | **Sempre a leste** | O corredor central segue em linha reta; a ala nova só abre a parede leste. Mapas de até 300 tiles de largura comportam mais de 100 pessoas. |
| 9 | DMG assinado | **Assinatura ad-hoc** quando não há certificado da Apple | Sem assinatura nenhuma o macOS não abre binários em Apple Silicon. Com os *secrets* da Apple o mesmo fluxo assina e notariza. |
| 10 | `MusicChannel` no banco | **Canais de música em memória** | São efêmeros (somem quando o último ouvinte sai); persistir não traria nada. |

## Decisões de produto

- **Login sem e-mail.** Usuário e senha criados pela administração; 2FA por aplicativo (TOTP) para
  Donos e Admins; recuperação só por redefinição de um Admin/Dono ou pelo comando `setup-owner` na VPS.
- **O link da equipe ativa o acesso.** O Admin atribui a pessoa ao escritório, mas a primeira entrada
  exige abrir o link de convite. Depois de ativado, o escritório aparece na lista da pessoa.
- **Convites guardados com hash.** O link completo só é mostrado na criação.
- **Destinatários das notas são uma lista do escritório**, sem vínculo com contas, para manter a regra
  de não guardar e-mail de ninguém.
- **Gravação visível.** Todos na sala veem o indicador vermelho e ouvem um aviso; quem entra depois
  também. Só áudio.
- **"Em call" = conectado em áudio e vídeo com pelo menos uma pessoa**, por proximidade ou em sala
  privada, medido pelo servidor. Vizinhos de mesa dentro do raio contam como conectados; quem quer
  medir só reuniões pode olhar a coluna de salas.
- **Ocupado** continua conectando por proximidade, mas desliga o microfone ao ser ativado.
  **Não incomodar** tira a pessoa de qualquer sala de mídia e silencia acenos.
- **Aviso de transparência** obrigatório no primeiro acesso (funcionários e convidados), por causa
  do painel de horas.
- **Rádio pelo player do YouTube de cada pessoa.** Retransmitir o áudio violaria os termos do YouTube.
- **Arte gerada por código.** Nenhum pacote de sprites de terceiros: sem risco de licença e sem
  arquivos binários no repositório.
- **Licença AGPL-3.0 + marcas fora da licença.** É a combinação que mais desestimula alguém de fechar
  o código e vender como serviço, mantendo o projeto open source.

## Decisões de implementação

- **Movimento por tiles com previsão no cliente.** O servidor valida cada passo (adjacência,
  colisão e ritmo) e corrige o cliente quando recusa.
- **Uma sala LiveKit por área privada**, com token condicionado à posição confirmada pelo servidor.
- **Textos com `t('chave', 'padrão')`** e catálogo extraído por script: traduzir é copiar um arquivo.
- **Electron em vez de Tauri.** O mesmo Chromium no Mac e no Windows dá WebRTC e compartilhamento de
  tela previsíveis.
- **`electron-updater` empacotado no processo principal** (esbuild), para o instalador não depender
  da estrutura de `node_modules` do pnpm.
- **Atualizador como serviço separado**, com token, versão validada por expressão regular e lista
  fixa de serviços: é a única peça com acesso ao Docker do host.
- **Testes de ponta a ponta com três navegadores** e mídia falsa; no CI, com um LiveKit real.
