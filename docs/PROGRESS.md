# Progresso

Atualizado em 12/11/2026. Versão 1.0.0.

## Pronto e verificado

| Fase | Entrega | Como foi verificado |
|---|---|---|
| F1 Esqueleto | Monorepo pnpm + Turborepo, TypeScript estrito, ESLint, i18n pt-BR, tema | CI: lint, tipos, build |
| F2 Contas e acesso | Papéis, configuração inicial dos Donos, 2FA, troca de senha, convites, auditoria, aviso de transparência | 24 testes de API + E2E |
| F3 Mapa e multiplayer | Phaser, pixel art por código, movimento autoritativo, pathfinding, seguir/liderar, mini-mapa | Testes de sala + E2E com 3 navegadores |
| F4 Áudio e vídeo | Proximidade, salas privadas, Spotlight, tela, status com atalhos, ausência | E2E com LiveKit real: microfone e câmera publicados, perto conecta, longe desconecta, sala privada isola |
| F5 Comunicação | Chat, reações, aceno, mão, participantes, perfil, status personalizado | E2E (chat) |
| F6 Espaço | Gerador (1–10, 11–21, N; sócios), assistente, Mapmaker, Build Tool, mesas, recados, expansão, versões | 15 testes do gerador + E2E (assistente, Mapmaker, expansão) |
| F7 Painel | Coleta no servidor, painel ao vivo, períodos, linha do tempo, CSV | Testes de analytics + E2E |
| F8 Rádio e agenda | Canais sincronizados, fila, ducking; Google Calendar | E2E (estado do rádio sincronizado) |
| F9 Notas de reunião | Egress por participante, Whisper, intercalação por falante, resumo opcional, e-mail, painel | E2E com Egress, Whisper e SMTP reais: duas pessoas falam, cada uma vira uma faixa de áudio, a transcrição sai intercalada por falante, o e-mail chega e a nota fica no painel |
| F10 Desktop e atualizações | Electron (Mac universal e Windows), bandeja, atalhos, Modo Mini, atualização; serviço `updater` | CI: instalador `.dmg` universal (assinatura ad-hoc conferida com `codesign`) e `.exe` gerados; 3 testes do atualizador |
| F11 Produção | Compose, `install.sh`, backup/restore/update, exemplos de proxy | CI: as três imagens são construídas, o `install.sh` roda do zero numa máquina limpa e o `smoke.sh` confere configuração inicial, serviços, atualizador, ffmpeg, Whisper, backup e restauração |
| F12 Docs | README, INSTALL, ADMIN, ARCHITECTURE, DECISIONS, licença e marcas | — |

## Não verificado (só dá para conferir no ambiente real)

| Item | Por quê | Como conferir |
|---|---|---|
| Instalação na VPS da Contabo, ao lado do CRM | O CI instala numa máquina limpa, sem o proxy e os serviços que já existem na VPS | Rodar o `install.sh` e seguir o roteiro de `docs/INSTALL.md` |
| Áudio e vídeo pela internet (NAT, 4G, redes de empresa) | No CI o navegador e o LiveKit estão na mesma máquina | Entrar com duas pessoas em redes diferentes; se alguém não conectar, ver "Problemas comuns" no INSTALL |
| Envio pelo SMTP escolhido (Gmail, Brevo etc.) | O teste usa um servidor SMTP local, sem TLS nem senha | Painel do ADM → Configurações → "Enviar e-mail de teste" |
| Google Calendar | Precisa de um OAuth Client do Google | Criar as credenciais (INSTALL, seção 7) e conectar uma conta |
| App de desktop em uso (bandeja, Modo Mini, atualização automática, aviso do Gatekeeper no Mac) | O CI gera e confere os instaladores, mas não abre o app | Instalar no Mac e no Windows e seguir o roteiro do INSTALL |
| Transcrição em português com o modelo escolhido pela memória da VPS | O teste transcreve uma fala em inglês com o modelo `tiny` | Fazer uma reunião curta com as notas ligadas |
| Carga com 10 pessoas de câmera ligada | Os testes usam 3 pessoas | Acompanhar `docker stats` na primeira reunião cheia |

## Depende do dono da VPS

- Criar os dois registros de DNS e rodar o `install.sh` (ver `docs/INSTALL.md`).
- Configurar o SMTP e, se quiser, as credenciais do Google Calendar no painel.
