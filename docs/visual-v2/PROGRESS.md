# Visual v2 — progresso

Plano: `PROMPT.md`. Decisões: `DECISIONS.md`.

| Fase | Estado | Observações |
|---|---|---|
| 0. Amostras de escala | pronto | Marcelo escolheu manter 32 px e o boneco no formato atual |
| A. Base | pronto | Primitivas, paletas, cor por objeto, `pnpm art:sheet`, `/dev/arte` e testes. Cadeira e sofá já no estilo novo (5 cores). Guia de uso logo abaixo |
| B. Pisos, paredes e exterior | pronto | 15 pisos (10 redesenhados + 5 novos), 7 paredes (4 novas), janelas com vista, exterior com grama e árvores, dia e noite pelo fuso do escritório, gerador com os pisos novos, `pnpm art:map` e `/dev/cena`. Guia logo abaixo do guia da Fase A |
| C1. Mesas e cadeiras | pronto | 8 mesas de trabalho (flag `desk: true`, L com máscara e espelho), 6 assentos com cores, cadeiras de mesa com encosto alto. Guia logo abaixo do guia da Fase B |
| C2. Setups e objetos de mesa | pronto | `MapObject.setup` (7 setups), 13 objetos de mesa, 10 extras (neon com texto editável), paleta do Mapmaker em grupos. Guia logo abaixo |
| C3. Plantas e catálogo antigo | pendente | |
| D. Avatar: mais opções | pendente | |
| E. Cores e setup da mesa | pendente | |
| F. Animações | pendente | |
| G. QA e release | pendente | |

## Checklist final (andamento)

- [x] Exterior com grama e árvores + dia/noite pelo fuso do escritório (Fase B)
- [x] Mesas, cadeiras, setups, objetos de mesa e os 10 extras (Fases C1 e C2; as plantas são da C3)
- [ ] Os demais itens do checklist do `PROMPT.md` dependem das fases C3 a G

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

## Guia das Fases C1 e C2 (mesas, cadeiras, setups e objetos) para as próximas fases

Arquivos novos em `apps/web/src/game/art/`:

| Arquivo | O que tem |
|---|---|
| `desks.ts` | As 8 mesas de trabalho. Medidas comuns: tampo nas linhas `top + 3 … top + 20` do footprint, borda da frente até `top + 23`, pés até `top + 30` |
| `setups.ts` | Os setups (`paintSetup(s, id, spot)`), peças reaproveitáveis (`monitor`, `keyboardPiece`, `mousePiece`, gabinete, notebook) e as cores `RGB` |
| `chairs.ts` | Cadeira gamer, executiva, banqueta, poltrona e pufe (a de escritório e o sofá continuam em `seating.ts`) |
| `deskitems.ts` | Os 13 objetos de mesa |
| `extras.ts` | Os 10 extras |

**Mesa de trabalho é um flag.** `ObjectDef.desk: true` marca o que é mesa (atribuível, com assento, área de conversa, zona de decoração e setup). Nunca compare `type === 'desk'`: use `isDesk(o)`, `isDeskType(type)`, `mapDesks(map)` e `DESK_TYPES`. O tipo `desk` continua sendo a mesa reta 2×1 (mapas salvos não mudam). Assento padrão: `ObjectDef.seat` (relativo ao canto; sem ele, logo abaixo do canto esquerdo) via `defaultDeskSeat(o)`; zona padrão de uma mesa nova: `defaultDeskZone(o)` (linha do tampo + 1 bloco à direita; na L, as duas linhas). Mapas antigos sem `props` seguem com os padrões de antes (`deskSeat`/`deskZone`).

**Footprint que não é retângulo (mesa em L).** `ObjectDef.cells` (`'#'` = sólido) define os blocos que bloqueiam; `objSolidAt(o, dx, dy)` responde por bloco, e `buildCollision`, o mini-mapa e o desenho usam isso. `dir: 'right'` espelha máscara e desenho (`objMirrored`). `objDepthRows(o)` dá as linhas de cima que contam para a ordem de desenho (na L é 1: quem senta no vão fica na frente do tampo). Tipos com `cells` não podem ser `resizable` (há teste).

**Setup da mesa (API).** Em `packages/shared/src/map.ts`:

- `DESK_SETUPS: DeskSetup[]` (`{ id, label }`): `monitor` (padrão), `gamer`, `dual`, `laptop_silver`, `aio`, `laptop`, `none`. `DEFAULT_DESK_SETUP = 'monitor'`.
- `MapObject.setup?: string`. Ausente = padrão. Só mesas de trabalho aceitam.
- `deskSetups(type)`: os setups que o tipo aceita (todos nas mesas, lista vazia nos outros).
- `objSetup(o)`: o setup em uso (o pedido, se existir; senão o padrão); `null` fora de mesa.
- `objSetupError(o)`: mensagem de erro ou `null` (usado por `validateMapShape`, então o servidor recusa setup desconhecido ao validar e publicar).
- `normalizeObjectVariants(map)`: como `normalizeObjectColors`, tira também o `setup` que saiu do catálogo (o servidor usa ao carregar e ao publicar).
- No cliente: `PaintInfo.setup` chega ao desenho; `objectKey` inclui o setup (o padrão dá a mesma chave que a ausência); `objectIcon(type, color?, setup?)`. A exportação do Tiled leva a propriedade `setup`.
- Para criar um setup: id novo **no fim** de `DESK_SETUPS` e uma função em `SETUPS` (`setups.ts`) que desenha sobre o `SetupSpot` (`cx` = centro do assento, `y` = primeira linha do tampo, `x0`/`x1` = limites). O teste cobra que todo setup tem desenho e muda os pixels de toda mesa.
- **Para a Fase E:** a UI do Mapmaker já tem um `Select` simples de cor e de setup no painel do objeto; falta a aba "Cor" com prévia, a mensagem de tempo real para o funcionário trocar o setup da própria mesa, o "Deixar o posto" voltar ao inicial e o sorteio de setups no gerador (`addDesk` em `packages/map-engine/src/modules.ts` cria `desk` sem `setup`).

**Objetos sobre a mesa.** Os objetos de mesa são 1×1, não bloqueiam e estão em `DESK_DECOR_TYPES` (a Build Tool do funcionário já lista todos). São desenhados para "pisar" entre as linhas 14 e 19 do bloco. Um objeto não sólido posto num bloco sólido de móvel é desenhado logo depois desse móvel (`surfaceIndex` e `sortedObjects` em `render.ts`; profundidade equivalente na cena), e `FLAT_ON_SURFACE` (mousepad, post-its) fica por baixo dos outros do mesmo tampo. O setup faz parte do sprite da mesa, então um objeto posto na coluna do setup fica por cima dele; para montar à mão, use o setup "Vazio" com teclado, mouse e mousepad.

**Cadeiras de mesa com encosto alto.** `chair`, `chair_gamer` e `chair_exec` têm `tall: 1`: `tallChair` (em `seating.ts`) desenha a cadeira no bloco e alonga o encosto 10 px repetindo linhas lisas, então o encosto encosta na frente da mesa. Para uma cadeira nova de mesa, escreva o desenho em 32×32 e embrulhe com `tallChair(desenho, linhas)`. Sem `dir`, cadeiras de mesa ficam de costas (como a de escritório) e a poltrona fica de frente (como era).

**Texto no sprite (letreiro neon).** `ObjectDef.text = { max, default }` faz o tipo desenhar `props.text` (`objText(o)` limpa e corta; `objTextError` valida; o Mapmaker mostra o campo "Texto do letreiro"). O texto entra na chave do cache. O neon usa a fonte de pixels em escala 2 quando cabe e em escala 1 quando não (cortando o que não couber na largura); a fonte ganhou `! ? ' " & * ; @ $ % < >`.

**Objetos de parede** (`group: 'wall'`: cortiça, relógio, neon, split): vão no bloco da própria parede e ocupam a face dela (linhas 11 a 30).

**Paleta do Mapmaker.** `ObjectDef.group` / `objectGroup(type)` / `OBJECT_GROUPS`: interativos, estrutura, mesas de trabalho, cadeiras e sofás, mesas e móveis, objetos de mesa, copa e equipamentos, de parede, plantas e decoração (seções recolhíveis; rótulos por `t()`). `category` continua existindo.

**Tipos novos.** Mesas: `desk_wide`, `desk_l`, `desk_standing`, `desk_glass`, `desk_dark`, `desk_gamer`, `desk_bench` (e `desk` redesenhada). Assentos: `chair_gamer`, `chair_exec`, `stool`, `pouf` (e `armchair` redesenhada). Objetos de mesa: `keyboard`, `mousepad`, `mouse`, `mug`, `bottle`, `headphones`, `desk_lamp`, `postits`, `books`, `succulent`, `cactus_small` (e `photo`, `trophy` redesenhados). Extras: `espresso`, `podcast_mic`, `ring_light`, `printer`, `snack_machine`, `aquarium`, `corkboard`, `wall_clock`, `neon`, `split_ac`. Todos com cores em `colors`; `REDESIGNED_TYPES` (de `objects.ts`) lista os tipos com desenho novo, e o teste de contorno percorre todos eles em todas as cores, direções e setups.

**Conferência.** `pnpm art:sheet --only=desk*,chair* --scale=4 --out=/tmp/folha` gera só `recorte.png` com os tipos pedidos ao lado de um avatar (nome exato ou prefixo com `*`). A folha completa mostra cada mesa em cada setup e o neon com um texto de exemplo.

## Problemas conhecidos

- A página `/dev/arte` foi conferida só pelo servidor do Vite (os módulos compilam e a rota responde); não havia navegador no ambiente da Fase A para abri-la. As folhas PNG saem do mesmo código (`sheet.ts`).
- Sofá virado para a esquerda ou direita usa o desenho de frente (já era assim na arte antiga). Se a Fase C3 quiser as 4 direções, o `SpritePainter` do sofá recebe `info.o.dir`.
- `decor:add` (tempo real, não alterado nesta fase) considera "em cima da mesa" só os 2 primeiros blocos (`desk.x + 2`): numa mesa de 3 blocos, o funcionário consegue pôr a planta grande (sólida) no 3º bloco. Corrigir na Fase E com `objSolidAt`.
- Objetos postos na coluna do setup ficam por cima dele (o setup é parte do sprite da mesa): um mousepad ali cobre o teclado do setup.
- Na mesa em L, clicar no vão (onde fica a cadeira) no Mapmaker seleciona a mesa se não houver outro objeto ali; com a cadeira posta depois, a cadeira tem prioridade.
- O relógio de parede é estático (10h10) até a Fase F.
- O letreiro neon redimensionado em altura continua com a placa na primeira linha (só a largura muda o desenho).
- A câmera continua presa aos limites do mapa (decisão 1 do plano: não mexer na câmera). Por isso o exterior aparece nos vazios do mapa, na faixa de 28 px acima dele e em volta quando o escritório é menor que a tela. Num escritório grande com zoom alto, quem está no meio vê pouco exterior; a vista das janelas aparece sempre.
- Além dos 16 blocos de margem há só grama, sem árvores (aparece em telas muito largas com zoom mínimo e escritório pequeno).
- A lua aparece em uma de cada quatro janelas (a paisagem repete a cada 4 blocos) e pode ficar atrás de um objeto alto encostado na parede.
- Janela num trecho vertical de parede (parede com outra embaixo) vira só um filete de vidro no topo: o modelo de parede não tem face lateral.
- A troca de período refaz os blocos estáticos do mapa de uma vez (4 vezes por dia). Em mapas muito grandes pode custar alguns quadros; a Fase G deve medir.
- `/dev/cena` foi conferida com o Chrome sem janela (WebGL por software); o FPS real fica para a Fase G.
