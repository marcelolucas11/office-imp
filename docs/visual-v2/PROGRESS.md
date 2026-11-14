# Visual v2 — progresso

Plano: `PROMPT.md`. Decisões: `DECISIONS.md`.

| Fase | Estado | Observações |
|---|---|---|
| 0. Amostras de escala | pronto | Marcelo escolheu manter 32 px e o boneco no formato atual |
| A. Base | pronto | Primitivas, paletas, cor por objeto, `pnpm art:sheet`, `/dev/arte` e testes. Cadeira e sofá já no estilo novo (5 cores). Guia de uso logo abaixo |
| B. Pisos, paredes e exterior | pronto | 15 pisos (10 redesenhados + 5 novos), 7 paredes (4 novas), janelas com vista, exterior com grama e árvores, dia e noite pelo fuso do escritório, gerador com os pisos novos, `pnpm art:map` e `/dev/cena`. Guia logo abaixo do guia da Fase A |
| C1. Mesas e cadeiras | pendente | |
| C2. Setups e objetos de mesa | pendente | |
| C3. Plantas e catálogo antigo | pendente | |
| D. Avatar: mais opções | pendente | |
| E. Cores e setup da mesa | pendente | |
| F. Animações | pendente | |
| G. QA e release | pendente | |

## Checklist final (andamento)

- [x] Exterior com grama e árvores + dia/noite pelo fuso do escritório (Fase B)
- [ ] Os demais itens do checklist do `PROMPT.md` dependem das fases C1 a G

## Guia da base (Fase A) para as próximas fases

Arquivos novos em `apps/web/src/game/art/`:

| Arquivo | O que tem |
|---|---|
| `prim.ts` | `Sprite` (buffer RGBA, sem canvas) e as funções `shade`, `mix`, `noise`, `rgba`, `hex`, `sprite()` |
| `palette.ts` | `PAL` (16 materiais × 4 tons: `dark`, `base`, `light`, `hi`), `ramp(hex)` e `GOLD` |
| `canvas.ts` | `makeCanvas(w, h)` e `setCanvasFactory(f)` (em Node injeta-se o `@napi-rs/canvas`) |
| `sprites.ts` | Tipos `SpritePainter` e `PaintInfo` (contrato de desenho de um objeto) |
| `seating.ts` | Cadeira e sofá no estilo novo: servem de modelo para os próximos objetos |
| `pixfont.ts` | Fonte de pixels 3×5 (`drawText`, `textWidth`), sem depender de fontes do sistema |
| `sheet.ts` | Monta as folhas de conferência (`artSheets(scale)`), usadas pelo script e pela página |

**Primitivas (`Sprite`).** Coordenadas em pixels inteiros; cor em hex (`#rgb`, `#rrggbb`, `#rrggbbaa`) ou `null` para apagar. As primitivas substituem o pixel; só o `paste` compõe com alfa.

- `px(x, y, c)`, `rect(x, y, w, h, c)`, `rrect(x, y, w, h, c, r = 1)` (cantos em degrau), `ellipse(x, y, w, h, c)`, `line(x0, y0, x1, y1, c)`, `poly([[x, y], …], c)` (vértices inclusive), `clear()`.
- `outline()` faz o contorno Stardew no sprite inteiro; `piece((p) => { … })` desenha uma peça numa camada, contorna só ela e cola por cima. **Use uma `piece` por peça** (base, assento, encosto, monitor…): é assim que peças sobrepostas ficam com contorno separado.
- `paste(outro, x, y)`, `flipX()`, `clone()`, `get(x, y)`, `alpha(x, y)`, `toCanvas()`, `drawTo(ctx, x, y)`, `Sprite.fromCanvas(c)`.
- `shade(c, amt)` é proporcional (`amt` de −1 a 1) e devolve hex. O `shade` de `tiles.ts` é o antigo (aditivo, devolve `rgb()`); não misture os dois.
- `noise(x, y, seed)` é o mesmo de antes (os pisos atuais dependem dele; há teste que trava os valores).
- Deixe **1 px livre** nas bordas do sprite: o contorno não sai do canvas.

**Como redesenhar um objeto.** Escreva um `SpritePainter` (`(s, info) => void`, com `info.w`, `info.h`, `info.top`, `info.o`, `info.color`) e registre em `spritePainters` no `objects.ts` (hoje `{ ...SEATING }`). Quem tem `SpritePainter` ignora o desenho antigo de `painters`; ao migrar um tipo, apague o desenho antigo dele. `objectSprite`, `objectKey`, o cache e a cena do Phaser não precisam mudar.

**Cor por objeto.** Em `packages/shared/src/map.ts`: `ObjectDef.colors?: ObjectColor[]` (a primeira é a padrão), `MapObject.color?: string`, `objColor(o)` (variante válida ou a padrão; `null` se o tipo não tem cores), `objectColors(type)`, `objColorError(o)` e `normalizeObjectColors(map)`. Para dar cores a um tipo, basta pôr `colors` na definição e usar `info.color.hex` no desenho (`ramp(hex)` gera os 4 tons). `objectKey` já inclui a cor; `objectIcon(type, color?)` aceita a variante. Cadeira e sofá usam a lista `UPHOLSTERY` (grafite, azul, verde, vinho, areia).

**`pnpm art:sheet`.** Gera `docs/visual-v2/sheet/{pisos,objetos,avatares}.png` em menos de 2 s, sem navegador (`--scale=4` e `--out=pasta` são opcionais; o padrão é 3×). Percorre `Floor`, `Wall` e `OBJECT_DEFS`: piso, parede, objeto, cor ou direção novos aparecem sozinhos (direções que não mudam o desenho são omitidas; tipos `resizable` saem também num tamanho maior). A folha só usa a fonte de pixels, então sai igual em qualquer máquina: rode e commite os PNGs ao fim de cada fase. A mesma folha abre em `/dev/arte` no `pnpm dev`.

**Testes.** `apps/web` agora tem Vitest (`apps/web/test/`, ambiente Node com `@napi-rs/canvas`): primitivas, sprites de todo o catálogo, contorno dos objetos novos e **regressão do avatar** (40 configurações com hash travado na arte de antes do v2; a Fase D deve manter esses hashes). Ao migrar um tipo para o estilo novo, acrescente-o à lista do teste "objetos redesenhados têm contorno escuro".

**Para a Fase E.** A mensagem `decor:add` do servidor de tempo real ainda cria o objeto sem `color` (nesta fase o tempo real não foi alterado). A aba "Cor" vai precisar de uma mensagem que valide a variante com `objColorError`.

## Guia da Fase B (pisos, paredes, exterior e dia/noite) para as próximas fases

Arquivos novos em `apps/web/src/game/art/`:

| Arquivo | O que tem |
|---|---|
| `floors.ts` | Um **padrão de 256×256 px por piso** (`paintFloorPattern`, `floorPattern`, `drawFloorTile`), `FLOOR_COLOR` (cor chapada do mini-mapa), `cloud()` (ruído suave que dá a volta em 256 px) e `paintGrass` |
| `walls.ts` | `paintWall`/`wallCanvas` (um bloco de parede, com cache), acabamentos em `LOOKS`, janela, divisória de vidro e `WALL_MINI` |
| `exterior.ts` | Paletas por período (`EXTERIOR`), `exteriorGrass`, `decorSprite`, `exteriorDecor` (distribuição das árvores), `drawExterior` e `windowView` (vista das janelas) |
| `tiles.ts` | Continua sendo a porta de entrada: `drawFloor`, `drawStatic(ctx, map, x0, y0, w, h, period)`, `wallTileAt`, `wallStyle`, `windowKind`, `tilesetCanvas` |

**Pisos.** Cada piso é desenhado uma vez num padrão de 8×8 blocos que repete sem emenda; o bloco `(tx, ty)` é o recorte `(tx mod 8, ty mod 8)`. Para criar um piso: id novo **no fim** de `Floor` (em `packages/shared/src/map.ts`), rótulo em `FLOOR_LABEL`, cor em `FLOOR_COLOR`, um `case` em `paintFloorPattern` e o rótulo em `apps/web/src/office/tileLabels.ts` (depois `pnpm i18n:extract`). Tudo o que usa coordenada tem que dar a volta em 256 px (use `wrap`, `hline` e `cloud`). O teste `scenery.test.ts` cobra no máximo 8 cores e contraste baixo. A folha de tiles do Mapmaker tem 16 colunas: **cabem ids até 15**; o piso 16 exige aumentar `TILESET_COLS` e o `tilecount` do `tiled.ts`.

**Paredes.** O modelo não mudou: bloco com parede embaixo mostra só o topo; sem parede embaixo, topo (10 px) + face (22 px). Ids: 1 ardósia (a de sempre), 2 janela, 3 escura, 4 lisa clara, 5 tijolo, 6 painel de madeira, 7 divisória de vidro. A **janela não tem acabamento próprio**: adota o da parede mais próxima (esquerda, direita, cima, baixo) e, conforme a vizinhança, mostra a paisagem (`view`, quando ao norte dela está o exterior), o vidro visto de fora (`outside`, à noite aceso) ou vidro simples (`inner`, entre dois cômodos). Janelas vizinhas se emendam. A divisória de vidro é translúcida (o piso de trás aparece) e bloqueia como qualquer parede.

**Exterior.** É só fundo: nada no JSON do mapa, nada na colisão. "Exterior" é todo bloco sem piso nem parede, dentro ou fora do mapa (`isVoid`). Os blocos estáticos (`drawStatic`) ficam transparentes ali. Na cena do Phaser (`scene.ts`): um `TileSprite` de grama do tamanho da tela, reposicionado em múltiplos de 256 px (`syncGrass`, profundidade −20), e um `Image` por árvore, arbusto, flor ou pedra (`buildExterior`, profundidade −10), numa margem de `EXTERIOR_MARGIN` = 16 blocos. Um elemento só é colocado se o sprite inteiro cair em blocos vazios, por isso nunca cobre parede. Para acrescentar um tipo: `DecorKind`, `DECOR_SIZE`, um `case` em `paintDecor` e a chance em `pickKind`.

**Dia e noite.** `dayPeriod(date, timezone)` em `packages/shared/src/time.ts`: amanhecer 5h–7h, dia 7h–17h, entardecer 17h–19h, noite 19h–5h, no fuso de `Office.timezone` (relógio do servidor, `serverNow()`). A cena reavalia a cada 60 s e na troca: a grama nova aparece por cima da antiga em 1,5 s, as árvores trocam de textura e os blocos estáticos são refeitos se o mapa tem janela. O interior nunca muda. Para forçar um período (prints, testes, Fase F): `forcePeriod('night')` de `scene.ts`, ou `window.__oi.bus.emit('period', 'night')` no console (`null` volta ao automático). Quem animar árvores e nuvens na Fase F deve trocar quadros pré-gerados **por período** (as texturas são `ext:<tipo>:<período>`).

**Gerador.** `GeneratorMeta.version` agora é 2 nos escritórios novos e escolhe o tema de pisos (`FLOOR_THEMES` em `packages/map-engine/src/modules.ts`): recepção piso claro, mesas espinha de peixe, reunião carpete com padrão, copa porcelanato, corredor cimento queimado; auditório, palco e sócios como antes. Escritório com meta na versão 1 que ganha uma ala nova continua no tema antigo. Sem meta (mapa editado à mão), a versão sai da maioria dos pisos do mapa.

**Ferramentas de conferência.**

- `pnpm art:sheet` agora gera também `docs/visual-v2/sheet/exterior.png` (uma salinha de exemplo nos 4 períodos).
- `pnpm art:map [--size=15|small|medium] [--partners=2] [--solo] [--period=day|dawn|dusk|night|all] [--margin=8] [--scale=1] [--theme=1|2] [--json=mapa.json] [--name=rotulo] [--out=pasta]` gera um escritório pelo `map-engine` e salva o mapa inteiro em PNG (padrão: `docs/visual-v2/prints/`). `--theme=1` mostra como fica um escritório já existente; `--json` renderiza um mapa salvo. Roda em Node com `renderScene()` de `render.ts`.
- `/dev/cena` (só no `pnpm dev`): o mesmo escritório gerado, aberto na **cena de verdade** do Phaser sem servidor nem login, com botões de período e mini-mapa. Parâmetros: `?pessoas=15&periodo=night&fuso=America/Sao_Paulo`.
- `node e2e/dev-shot.mjs saida.png "http://localhost:5173/dev/cena?pessoas=7&periodo=night"` tira o print com o Chrome sem janela (`CHROME_PATH` ou `/usr/bin/google-chrome`; não precisa do navegador do Playwright). Serve para os prints da Fase G.

**Testes novos.** `packages/shared/test/dayperiod.test.ts` (faixas, fusos, horário de verão, relógio falso), `apps/web/test/scenery.test.ts` (pisos, paredes, janelas, exterior, cena) e o bloco "pisos do visual v2 no gerador" em `packages/map-engine/test/generate.test.ts`.

## Problemas conhecidos

- A página `/dev/arte` foi conferida só pelo servidor do Vite (os módulos compilam e a rota responde); não havia navegador no ambiente da Fase A para abri-la. As folhas PNG saem do mesmo código (`sheet.ts`).
- Sofá virado para a esquerda ou direita usa o desenho de frente (já era assim na arte antiga). Se a Fase C3 quiser as 4 direções, o `SpritePainter` do sofá recebe `info.o.dir`.
- A câmera continua presa aos limites do mapa (decisão 1 do plano: não mexer na câmera). Por isso o exterior aparece nos vazios do mapa, na faixa de 28 px acima dele e em volta quando o escritório é menor que a tela. Num escritório grande com zoom alto, quem está no meio vê pouco exterior; a vista das janelas aparece sempre.
- Além dos 16 blocos de margem há só grama, sem árvores (aparece em telas muito largas com zoom mínimo e escritório pequeno).
- A lua aparece em uma de cada quatro janelas (a paisagem repete a cada 4 blocos) e pode ficar atrás de um objeto alto encostado na parede.
- Janela num trecho vertical de parede (parede com outra embaixo) vira só um filete de vidro no topo: o modelo de parede não tem face lateral.
- A troca de período refaz os blocos estáticos do mapa de uma vez (4 vezes por dia). Em mapas muito grandes pode custar alguns quadros; a Fase G deve medir.
- `/dev/cena` foi conferida com o Chrome sem janela (WebGL por software); o FPS real fica para a Fase G.
