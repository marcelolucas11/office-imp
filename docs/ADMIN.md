# Guia do Painel do ADM

O painel fica em `/admin` (menu **⋯ → Painel do ADM** dentro do escritório, ou o botão na tela inicial).
Só **Donos** e **Admins** entram.

## Papéis e permissões

| Ação | Dono | Admin | Funcionário | Convidado |
|---|:-:|:-:|:-:|:-:|
| Criar escritório | ✅ | ✅ | — | — |
| Excluir escritório | ✅ | — | — | — |
| Criar, editar e remover pessoas; redefinir senha | ✅ todas | ✅ só Funcionários dos escritórios dele | — | — |
| Promover a Admin/Dono ou rebaixar | ✅ | — | — | — |
| Gerar e revogar links de convite | ✅ | ✅ | — | — |
| Mapmaker e aprovar expansão | ✅ | ✅ | — | — |
| Decorar a própria mesa (Build Tool) | ✅ | ✅ | ✅ | — |
| Falar no palco (Spotlight) | ✅ | ✅ | — | — |
| Painel em tempo real e notas de reunião | ✅ | ✅ nos escritórios dele | — | — |
| Configurar SMTP, Google e destinatários | ✅ | ✅ | — | — |
| Atualizar o servidor | ✅ | — | — | — |
| "Atualizar todos agora" e modo de atualização | ✅ | ✅ | — | — |
| Andar, falar, chat, status, reações, ouvir o rádio | ✅ | ✅ | ✅ | ✅ |
| Abrir canal de música (DJ), ter mesa, usar a agenda | ✅ | ✅ | ✅ | — |
| Entrar em áreas "Somente equipe" | ✅ | ✅ | ✅ | — |

O Dono enxerga todos os escritórios. Admins e Funcionários, só aqueles aos quais foram atribuídos.

## Painel em tempo real

Uma linha por pessoa (Donos e Admins incluídos), atualizada ao vivo:

- **Online** — tempo dentro do escritório. **Ativo** — online menos o tempo ausente.
- **Status** — barra com o tempo em Disponível (verde), Ocupado (amarelo), Não incomodar (vermelho)
  e Ausente (cinza). A pessoa vira "Ausente" depois de 10 minutos sem teclado, mouse ou movimento
  (o prazo é configurável por escritório).
- **Em call** — tempo conectada em áudio e vídeo com pelo menos uma pessoa, por proximidade ou na
  mesma sala privada. **Com quem** — as cinco pessoas com mais tempo, e em quais salas.
- **Agora** — status e local atuais.

Troque o período (hoje ao vivo, um dia, 7 ou 30 dias), clique em uma pessoa para ver a **linha do
tempo do dia** e use **Exportar CSV**. O "dia" segue o fuso horário do escritório.

Todos os horários são registrados pelo servidor. No primeiro acesso, cada pessoa lê e aceita o
**aviso de transparência** dizendo o que é registrado; o texto é editável pelo Dono em
*Escritórios → Configurações*.

## Escritórios

- **Criar escritório** — o assistente pergunta o nome, o tamanho (1–10, 11–21 ou personalizado),
  quantos sócios e se eles dividem a sala, e mostra a pré-visualização.

  | Módulo | 1–10 | 11–21 | Personalizado (N) |
  |---|---|---|---|
  | Recepção | 1 | 1 | 1 |
  | Blocos de 6 mesas | 2 | 4 | ⌈N/6⌉ |
  | Salas de reunião (privadas, 8 lugares) | 1 | 2 | ⌈N/10⌉ |
  | Copa com mesas de conversa privadas | 1 | 1 | 1 + ⌊N/25⌋ |
  | Auditório com palco | — | 1 | se N > 10 |
  | Sala dos Sócios | conforme a resposta | idem | idem |

- **Expansão** — quando as mesas chegam a 90% de ocupação, ou quando os "funcionários previstos"
  passam da capacidade, o painel sugere uma nova ala. Você vê a pré-visualização e escolhe
  **Aprovar e criar a ala** (anexada a leste, sem alterar o que existe) ou **Criar manualmente no
  Mapmaker** (o mapa cresce com uma área em branco). Nada é expandido sem aprovação.
- **Mesas** — atribua ou libere mesas. Quando alguém é removido, a mesa fica livre e os objetos dela
  vão para **Achados e perdidos**. Nenhuma área do mapa é apagada.
- **Configurações** — nome, fuso, prazo de ausência, retenção do chat (90 dias) e dos áudios
  (30 dias; o texto das notas não expira), quem pode iniciar notas e quem recebe o e-mail.

## Mapmaker e Build Tool

Dentro do escritório: **⋯ → Mapmaker e Build Tool**.

- **Objetos** — escolha e clique no mapa. Interativos: quadro branco, site, TV (YouTube), pôster,
  jogo e placa. Selecione um objeto para editar título, endereço, imagem ou texto. `R` gira, `Delete` apaga.
- **Chão e paredes** — pintar, preencher, apagar, marcar os pontos de entrada e mudar o tamanho do mapa.
- **Áreas** — arraste um retângulo para criar uma **área privada** (sala, mesa de conversa) ou um
  **palco**. Defina nome, capacidade, "sala de reunião" (permite notas) e "somente equipe".
- **Portal** — coloque o objeto, selecione e clique em "Clicar no destino".
- **Pré-visualizar** esconde as marcações. **Validar** confere se tudo é alcançável.
  **Publicar** envia a nova versão para todos na hora. Em **Versões** dá para restaurar qualquer
  versão anterior e exportar para o Tiled.

Cada funcionário decora a própria mesa em **⋯ → Minha mesa → Decorar**.

## Pessoas e links de convite

- **Pessoas** — crie a conta com usuário e senha temporária (a troca é obrigatória no primeiro
  login). Não há e-mail nem "esqueci a senha": quem redefine é o Admin ou o Dono.
- **Link da equipe** — um por escritório, permanente. O funcionário abre o link, faz login e o acesso
  é ativado. Gerar de novo invalida o link anterior (quem já ativou continua entrando).
- **Link de convidado** — sem validade ou com data e hora de expiração, e limite de usos opcional.
  O convidado só digita um nome. Ao expirar ou ser revogado, quem entrou por ele é desconectado na hora.
- O link completo aparece **uma vez**, na criação. Se perder, gere outro.

## Notas de reunião, Configurações, Atualizações e Auditoria

- **Notas de reunião** — lista com busca no texto; cada reunião tem a transcrição, o áudio por
  pessoa, o status do e-mail e o download em `.md`.
- **Configurações** — SMTP (com teste de envio) e credenciais do Google Calendar.
  O passo a passo está em [INSTALL.md](INSTALL.md).
- **Atualizações** — versão instalada e disponível, **Atualizar servidor** (Dono),
  **Atualizar automaticamente ao abrir** e **Atualizar todos agora**.
- **Auditoria** — quem criou, removeu ou promoveu quem; convites gerados e revogados; mapas
  publicados; mudanças de configuração.
