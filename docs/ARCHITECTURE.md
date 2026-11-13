# Arquitetura

```
 navegador / app desktop (Electron)
   │  HTTPS: páginas, API REST (/api), tempo real (/rt, WebSocket)
   ▼
 proxy reverso (Caddy próprio ou o que já existe na VPS)
   ├── office-impera.…      →  app:3000
   └── rtc-office-impera.…  →  livekit:7880 (sinalização)
                                livekit 7881/tcp e 7882/udp (mídia, direto)

 app ── postgres   dados
     ── redis      fila de tarefas (BullMQ) e mensageria do LiveKit/Egress
     ── livekit    emite tokens, remove participantes, inicia gravações
     ── egress     grava o áudio das reuniões em /data/meetings
     ── whisper    transcreve (HTTP interno)
     ── updater    troca a versão das imagens (acionado pelo Dono)
```

## Pacotes

| Pacote | Papel |
|---|---|
| `packages/shared` | Tipos, permissões, catálogo de tiles e objetos, proximidade, pathfinding, fuso e cálculo do painel. Usado pelo servidor e pelo cliente. |
| `packages/map-engine` | Gerador determinístico de escritórios (módulos encaixados em um corredor), expansão e validação. |
| `packages/ui` | Componentes e tema (preto, dourado `#d7b870`, Montserrat). |
| `apps/server` | Fastify (API), Colyseus (tempo real), BullMQ (tarefas), Drizzle (PostgreSQL). |
| `apps/web` | React + Phaser 3. A pixel art é gerada por código (`src/game/art`). |
| `apps/desktop` | Electron: carrega o cliente web do servidor e acrescenta a caixinha da barra de menus/bandeja (`assets/tray.html`), atalhos, Modo Mini e atualização. O Modo Mini é uma janela transparente aberta pela própria página (`window.open` com o nome `oi-mini`), onde o cliente web desenha as câmeras por React portal (`apps/web/src/office/MiniMode.tsx`): a conexão de áudio e vídeo é a mesma da janela principal, que fica escondida. No navegador, o mesmo componente usa o Document Picture-in-Picture quando existe. |
| `apps/updater` | Serviço HTTP mínimo com acesso ao Docker; só aceita `X.Y.Z` e só age nos serviços do office-imp. |

## Tempo real (servidor autoritativo)

Cada escritório é uma sala Colyseus (`apps/server/src/realtime/office-room.ts`). O cliente envia a
**intenção** (`step`, `teleport`, `status`, `chat`…); o servidor valida (colisão, adjacência, ritmo
dos passos, capacidade e restrição das áreas) e transmite o resultado. O cliente anima o próprio
passo na hora e é corrigido se o servidor recusar.

A cada mudança o servidor recalcula o **grafo de conexões**: quem está no raio de quem
(o raio de um par é o menor dos dois), quem divide uma área privada e quem está no palco. Cada
cliente recebe só a própria visão (`av`): em qual sala de mídia deve estar e com quem.

## Áudio e vídeo (LiveKit)

- **Área aberta:** uma sala LiveKit por escritório. O cliente entra sem assinar ninguém e assina
  apenas as faixas das pessoas que o servidor listou; o volume acompanha a distância.
- **Área privada:** uma sala LiveKit **separada** por área. O token só é emitido se o servidor
  confirmar que a pessoa está dentro dela, e ela é removida da sala ao sair. É isolamento real,
  não visual.
- **Palco (Spotlight):** quem está na área aberta assina o palestrante; quem está em sala privada
  abre uma segunda conexão, só de escuta.
- **Não incomodar:** a pessoa não entra em nenhuma sala de mídia.
- A mídia vai direto do navegador para o LiveKit (7882/udp, com 7881/tcp de reserva). O `app` não
  transporta áudio nem vídeo.

## Painel (analytics)

O servidor grava três tipos de intervalo, sempre com o próprio relógio: presença
(`presence_sessions`), status (`status_intervals`) e chamadas (`call_segments`, um por **par** de
pessoas, abertos e fechados conforme o grafo de conexões muda). O painel soma os intervalos
recortados pelo período, no fuso do escritório; o tempo "em call" de uma pessoa é a **união** dos
segmentos (três pessoas na mesma conversa não contam em dobro). Se o servidor cair, os intervalos
abertos são fechados na próxima subida.

## Notas de reunião

1. Em uma sala de reunião, alguém inicia as notas; o servidor pede ao **Egress** uma gravação só de
   áudio por participante (OGG) e avisa todos na sala.
2. Ao parar, uma tarefa converte cada faixa para WAV (ffmpeg), envia ao **whisper.cpp** e recebe os
   trechos com horário.
3. Os trechos de todas as faixas são intercalados pelo horário, com o nome de quem falou.
4. Opcional: um modelo de linguagem (endpoint compatível com OpenAI/Ollama em `SUMMARY_LLM_URL`) gera
   resumo, decisões e próximos passos.
5. O resultado é salvo, enviado por SMTP aos destinatários do escritório e listado no painel.

As tarefas rodam uma por vez e o Whisper com prioridade baixa de CPU, para não disputar com outros
sistemas da mesma VPS.

## Rádio

O servidor guarda só o estado do canal (vídeo atual, fila, posição e horário da última mudança).
Cada cliente toca o vídeo no **próprio** player do YouTube e corrige a posição quando a diferença
passa de 2 segundos. O áudio nunca passa pelo servidor.

## Dados e segredos

- PostgreSQL com migrações SQL versionadas (`apps/server/drizzle`), aplicadas na subida.
- Arquivos em `/data`: `meetings/` (áudios) e `uploads/` (imagens de pôsteres).
- Senhas com Argon2id; tokens de sessão e de convite guardados com hash; senha de SMTP, credenciais
  e autorizações do Google criptografadas com AES-256-GCM (`APP_ENCRYPTION_KEY`).
- Nenhum e-mail de usuário é armazenado.

## Atualização

Uma tag `vX.Y.Z` dispara o GitHub Actions, que publica três imagens no GHCR (`office-imp`,
`office-imp-whisper`, `office-imp-updater`), os instaladores de Mac e Windows e a release.
O botão do painel chama o `updater`, que faz backup, troca `OFFICE_IMP_VERSION` no `.env`, baixa e
sobe as imagens, confere a saúde e desfaz se algo falhar. O app desktop usa o `electron-updater`
contra as releases do GitHub.
