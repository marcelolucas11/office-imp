# Progresso

Atualizado em 12/11/2026.

## Pronto (código, testes locais passando)

| Fase | Entrega | Verificação |
|---|---|---|
| F1 Esqueleto | Monorepo pnpm + Turborepo, TypeScript estrito, ESLint, i18n pt-BR, tema | `pnpm lint`, `pnpm typecheck`, `pnpm build` |
| F2 Contas e acesso | Papéis, configuração inicial dos Donos, 2FA, troca de senha, convites, auditoria, aviso de transparência | 24 testes de API + E2E |
| F3 Mapa e multiplayer | Phaser, pixel art por código, movimento autoritativo, pathfinding, seguir/liderar, mini-mapa | Testes de sala + E2E |
| F4 Áudio e vídeo | Proximidade, salas privadas, Spotlight, tela, status com atalhos, ausência | Grafo de conexões testado no servidor e no E2E; mídia real só no CI |
| F5 Comunicação | Chat, reações, aceno, mão, participantes, perfil, status personalizado | E2E (chat) |
| F6 Espaço | Gerador (1–10, 11–21, N; sócios), assistente, Mapmaker, Build Tool, mesas, recados, expansão, versões | 15 testes do gerador + E2E |
| F7 Painel | Coleta no servidor, painel ao vivo, períodos, linha do tempo, CSV | Testes de analytics + E2E |
| F8 Rádio e agenda | Canais sincronizados, fila, ducking; Google Calendar | E2E (estado do rádio); agenda sem teste real (precisa de credenciais do Google) |
| F9 Notas de reunião | Egress por participante, Whisper, intercalação por falante, resumo opcional, e-mail, painel | Teste de API com gravador e transcritor simulados |
| F10 Desktop e atualizações | Electron (Mac universal e Windows), bandeja, atalhos, Modo Mini, atualização; serviço `updater` | Tipos e empacotamento local; instaladores só no CI |
| F11 Produção | Compose, `install.sh`, backup/restore/update, exemplos de proxy | Sintaxe local; instalação completa só no CI |
| F12 Docs | README, INSTALL, ADMIN, ARCHITECTURE, DECISIONS, licença e marcas | — |

## Em andamento

- CI no GitHub Actions (testes, E2E com LiveKit real, imagens Docker e instalação de produção).
- Release v1.0.0 com os instaladores.

## Pendente (depende do dono da VPS)

- Criar os registros de DNS e rodar o `install.sh` na VPS (ver `docs/INSTALL.md`).
- Configurar o SMTP e as credenciais do Google Calendar no painel.
