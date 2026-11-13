# Licenças dos recursos visuais e de terceiros

## Arte do jogo (tiles, móveis, objetos e avatares)
Toda a pixel art do office-imp é **gerada por código**, em tempo de execução, pelos arquivos de
`apps/web/src/game/art/` (`tiles.ts`, `objects.ts`, `avatar.ts`). Não há pacotes de sprites de
terceiros no repositório. Esse código (e a arte que ele produz) é distribuído sob a AGPL-3.0,
como o restante do projeto.

## Sons
Os sons de aceno, mensagem e aviso de gravação são sintetizados por código (`apps/web/src/office/sounds.ts`).

## Fontes
- **Montserrat** (interface) — SIL Open Font License 1.1, via pacote `@fontsource-variable/montserrat`.
- Fontes do quadro branco (Virgil, Excalifont, Cascadia, Nunito, Lilita One, Comic Shanns, Liberation)
  — distribuídas com o pacote `@excalidraw/excalidraw` (MIT; cada fonte com a sua licença livre: OFL 1.1 ou MIT).

## Bibliotecas principais
| Biblioteca | Licença |
|---|---|
| LiveKit (servidor, egress e SDKs) | Apache-2.0 |
| whisper.cpp | MIT |
| Phaser 3 | MIT |
| Colyseus | MIT |
| Excalidraw | MIT |
| Lucide (desenhos dos ícones 2D que substituem os emojis) | ISC — © Lucide Icons and Contributors |
| Fastify, Drizzle ORM, React, Vite, Tailwind CSS, Zustand, i18next | MIT |
| Electron, electron-builder, electron-updater | MIT |
| PostgreSQL | PostgreSQL License |
| Redis 7 | BSD-3-Clause (até 7.2) |
| Caddy | Apache-2.0 |

## Marca
Os arquivos de `assets/brand/` não são licenciados pela AGPL. Veja [`TRADEMARKS.md`](../TRADEMARKS.md).
