# Visual v2 — progresso

Plano: `PROMPT.md`. Decisões: `DECISIONS.md`.

| Fase | Estado | Observações |
|---|---|---|
| 0. Amostras de escala | pronto | Marcelo escolheu manter 32 px e o boneco no formato atual |
| A. Base | pronto | Primitivas, paletas, cor por objeto, `pnpm art:sheet`, `/dev/arte` e testes. Cadeira e sofá já no estilo novo (5 cores). Guia de uso logo abaixo |
| B. Pisos, paredes e exterior | pronto | 15 pisos (10 redesenhados + 5 novos), 7 paredes (4 novas), janelas com vista, exterior com grama e árvores, dia e noite pelo fuso do escritório, gerador com os pisos novos, `pnpm art:map` e `/dev/cena`. Guia logo abaixo do guia da Fase A |
| C1. Mesas e cadeiras | pronto | 8 mesas de trabalho (flag `desk: true`, L com máscara e espelho), 6 assentos com cores, cadeiras de mesa com encosto alto. Guia logo abaixo do guia da Fase B |
| C2. Setups e objetos de mesa | pronto | `MapObject.setup` (7 setups), 13 objetos de mesa, 10 extras (neon com texto editável), paleta do Mapmaker em grupos. Guia logo abaixo |
| C3. Plantas e catálogo antigo | pronto | 8 plantas novas + `plant`/`plant_small` redesenhadas (grupo "Plantas"), o resto do catálogo redesenhado com cores, desenho antigo removido de `objects.ts`, gerador com as plantas novas. Guia logo abaixo do guia das Fases C1 e C2 |
| D. Avatar: mais opções | pronto | `AvatarConfig` v2 (acessórios múltiplos, 16 cores por peça, 15 cabelos, barba, roupa de cima, estampa, roupa de baixo, calçado, cor dos acessórios), regras de exclusão, editor com abas e prévia nas 4 direções, folha `avatares.png` em seções. Os 40 hashes dos avatares antigos não mudaram. Guia logo abaixo do guia da Fase C3 |
| E. Cores e setup da mesa | pronto | Aba "Cor" (com "Setup" nas mesas) no Mapmaker e na Build Tool, cor e setup da própria mesa por cima do mapa publicado (`desks.look`, migração `0001_desk_look`), `decor:color`, `desk:look`, "Deixar o posto" e remoção voltam ao inicial, `decor:add` com cor e tampo real, objetos de parede só na parede, gerador com setups e cadeiras variados (versão 2+), E2E do fluxo. Guia logo abaixo do guia da Fase D |
| F. Animações | pendente | |
| G. QA e release | pendente | |

## Checklist final (andamento)

- [x] Arte de cenário e objetos refeita com traço de 1 px, nenhum sprite antigo sobrando (Fase C3; o avatar fica como é, pela decisão 2)
- [x] Exterior com grama e árvores + dia/noite pelo fuso do escritório (Fase B)
- [x] Todas as mesas, cadeiras, plantas, setups, objetos de mesa e os 10 extras (Fases C1, C2 e C3)
- [x] Mapas e avatares antigos funcionando sem migração manual; avatar antigo idêntico (mapas nas Fases A a C3; avatares na Fase D, com os 40 hashes de antes)
- [x] Avatar com acessórios múltiplos e 16 cores por peça (Fase D)
- [x] Aba "Cor" por objeto, sem objetos duplicados por cor (Fase E)
- [x] Setup da própria mesa + "Deixar o posto" volta ao inicial (Fase E)
- [ ] Os demais itens do checklist do `PROMPT.md` dependem das fases F e G

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

**Como desenhar um objeto.** Escreva um `SpritePainter` (`(s, info) => void`, com `info.w`, `info.h`, `info.top`, `info.o`, `info.color`) no arquivo da família e registre em `spritePainters` no `objects.ts`. (Até a Fase C2 havia também o desenho antigo, `painters`; a C3 o removeu.) `objectSprite`, `objectKey`, o cache e a cena do Phaser não precisam mudar.

**Cor por objeto.** Em `packages/shared/src/map.ts`: `ObjectDef.colors?: ObjectColor[]` (a primeira é a padrão), `MapObject.color?: string`, `objColor(o)` (variante válida ou a padrão; `null` se o tipo não tem cores), `objectColors(type)`, `objColorError(o)` e `normalizeObjectColors(map)`. Para dar cores a um tipo, basta pôr `colors` na definição e usar `info.color.hex` no desenho (`ramp(hex)` gera os 4 tons). `objectKey` já inclui a cor; `objectIcon(type, color?)` aceita a variante. Cadeira e sofá usam a lista `UPHOLSTERY` (grafite, azul, verde, vinho, areia).

**`pnpm art:sheet`.** Gera `docs/visual-v2/sheet/{pisos,objetos,avatares}.png` em menos de 2 s, sem navegador (`--scale=4` e `--out=pasta` são opcionais; o padrão é 3×). Percorre `Floor`, `Wall` e `OBJECT_DEFS`: piso, parede, objeto, cor ou direção novos aparecem sozinhos (direções que não mudam o desenho são omitidas; tipos `resizable` saem também num tamanho maior). A folha só usa a fonte de pixels, então sai igual em qualquer máquina: rode e commite os PNGs ao fim de cada fase. A mesma folha abre em `/dev/arte` no `pnpm dev`.

**Testes.** `apps/web` agora tem Vitest (`apps/web/test/`, ambiente Node com `@napi-rs/canvas`): primitivas, sprites de todo o catálogo, contorno dos objetos novos e **regressão do avatar** (40 configurações com hash travado na arte de antes do v2; a Fase D deve manter esses hashes). Ao migrar um tipo para o estilo novo, acrescente-o à lista do teste "objetos redesenhados têm contorno escuro".

**Para a Fase E** (feito: ver o guia da Fase E). A mensagem `decor:add` do servidor de tempo real ainda cria o objeto sem `color` (nesta fase o tempo real não foi alterado). A aba "Cor" vai precisar de uma mensagem que valide a variante com `objColorError`.

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
- **Para a Fase E** (feito: ver o guia da Fase E)**:** a UI do Mapmaker já tinha um `Select` simples de cor e de setup no painel do objeto; falta a aba "Cor" com prévia, a mensagem de tempo real para o funcionário trocar o setup da própria mesa, o "Deixar o posto" voltar ao inicial e o sorteio de setups no gerador (`addDesk` em `packages/map-engine/src/modules.ts` cria `desk` sem `setup`).

**Objetos sobre a mesa.** Os objetos de mesa são 1×1, não bloqueiam e estão em `DESK_DECOR_TYPES` (a Build Tool do funcionário já lista todos). São desenhados para "pisar" entre as linhas 14 e 19 do bloco. Um objeto não sólido posto num bloco sólido de móvel é desenhado logo depois desse móvel (`surfaceIndex` e `sortedObjects` em `render.ts`; profundidade equivalente na cena), e `FLAT_ON_SURFACE` (mousepad, post-its) fica por baixo dos outros do mesmo tampo. O setup faz parte do sprite da mesa, então um objeto posto na coluna do setup fica por cima dele; para montar à mão, use o setup "Vazio" com teclado, mouse e mousepad.

**Cadeiras de mesa com encosto alto.** `chair`, `chair_gamer` e `chair_exec` têm `tall: 1`: `tallChair` (em `seating.ts`) desenha a cadeira no bloco e alonga o encosto 10 px repetindo linhas lisas, então o encosto encosta na frente da mesa. Para uma cadeira nova de mesa, escreva o desenho em 32×32 e embrulhe com `tallChair(desenho, linhas)`. Sem `dir`, cadeiras de mesa ficam de costas (como a de escritório) e a poltrona fica de frente (como era).

**Texto no sprite (letreiro neon).** `ObjectDef.text = { max, default }` faz o tipo desenhar `props.text` (`objText(o)` limpa e corta; `objTextError` valida; o Mapmaker mostra o campo "Texto do letreiro"). O texto entra na chave do cache. O neon usa a fonte de pixels em escala 2 quando cabe e em escala 1 quando não (cortando o que não couber na largura); a fonte ganhou `! ? ' " & * ; @ $ % < >`.

**Objetos de parede** (`group: 'wall'`: cortiça, relógio, neon, split): vão no bloco da própria parede e ocupam a face dela (linhas 11 a 30).

**Paleta do Mapmaker.** `ObjectDef.group` / `objectGroup(type)` / `OBJECT_GROUPS`: interativos, estrutura, mesas de trabalho, cadeiras e sofás, mesas e móveis, objetos de mesa, copa e equipamentos, de parede, plantas e decoração (seções recolhíveis; rótulos por `t()`). `category` continua existindo.

**Tipos novos.** Mesas: `desk_wide`, `desk_l`, `desk_standing`, `desk_glass`, `desk_dark`, `desk_gamer`, `desk_bench` (e `desk` redesenhada). Assentos: `chair_gamer`, `chair_exec`, `stool`, `pouf` (e `armchair` redesenhada). Objetos de mesa: `keyboard`, `mousepad`, `mouse`, `mug`, `bottle`, `headphones`, `desk_lamp`, `postits`, `books`, `succulent`, `cactus_small` (e `photo`, `trophy` redesenhados). Extras: `espresso`, `podcast_mic`, `ring_light`, `printer`, `snack_machine`, `aquarium`, `corkboard`, `wall_clock`, `neon`, `split_ac`. Todos com cores em `colors`; `REDESIGNED_TYPES` (de `objects.ts`) lista os tipos com desenho novo, e o teste de contorno percorre todos eles em todas as cores, direções e setups.

**Conferência.** `pnpm art:sheet --only=desk*,chair* --scale=4 --out=/tmp/folha` gera só `recorte.png` com os tipos pedidos ao lado de um avatar (nome exato ou prefixo com `*`). A folha completa mostra cada mesa em cada setup e o neon com um texto de exemplo.

## Guia da Fase C3 (plantas e catálogo antigo) para as próximas fases

Arquivos novos em `apps/web/src/game/art/`:

| Arquivo | O que tem |
|---|---|
| `plants.ts` | As 10 plantas: `plant` (planta de folhagem) e `plant_small` (vaso pequeno, jiboia) redesenhadas, `monstera`, `snake_plant`, `cactus` (mandacaru), `succulent_bowl`, `palm`, `tall_vase` (vaso alto com plumas), `hanging_fern` e `wall_garden` (as duas de parede). Peças reaproveitáveis: `pot` (quadrado, afunilado, redondo), `basket`, `frond` (folha em pente: palmeira e samambaia), `monsteraLeaf`, `sword`, `rosette`, `leafCluster` |
| `furniture.ts` | Mesa de reunião (redimensionável), mesa redonda, balcão (redimensionável), estante, armário, luminária de chão, púlpito, tapete (redimensionável), tapete com logo (coroa Impera em dourado) e quadro |
| `appliances.ts` | Máquina de café, bebedouro e geladeira |
| `interactive.ts` | Quadro branco, TV, quiosque, fliperama, pôster e nota (só o desenho mudou; `interact` e `props` iguais) |
| `structure.ts` | Porta aberta (`door`), porta fechada (`paintDoorClosed`) e portal |

**Um caminho só.** `objects.ts` não tem mais o desenho antigo (`painters`, retângulos no canvas): todo tipo de `OBJECT_DEFS` tem um `SpritePainter` em `spritePainters`, e `REDESIGNED_TYPES` é o catálogo inteiro. O teste "nenhum tipo do catálogo usa o desenho antigo" falha se um tipo novo ficar sem desenho (nesse caso, o objeto cai num bloco contornado na cor da variante, para não sumir). O `r` e o `shade` aditivo de `tiles.ts` ficam só para o avatar, que tem que sair pixel a pixel igual.

**Medidas das plantas.** As de chão com `tall: 1` apoiam o vaso no fim do bloco (`top + 13 … top + 29`) e sobem para o bloco de cima, como a planta de antes; são sólidas e ocupam um bloco, então trocar uma pela outra não muda a colisão. As de parede (`hanging_fern`, `wall_garden`) vão no bloco da própria parede e ocupam a face (linhas 10 a 30), como o relógio e a cortiça. O pôster agora também cabe na face da parede (linhas 7 a 29) e continua funcionando no chão. A cor das plantas é a do vaso (`POTS`, com `potsWith(id)` para escolher a padrão de cada tipo: branco na costela-de-adão, preto na espada-de-são-jorge, cesto de palha na palmeira); no jardim vertical, a da moldura.

**Cores novas** (a primeira de cada lista é a mais próxima da cor antiga, então mapas salvos mudam de traço, não de cor): mesa de reunião e mesa redonda (`TOPS`), balcão, estante e púlpito (`CABINET_WOODS`), armário, luminária (cúpula), quadro (`FRAMES`), tapetes (`RUGS`), máquina de café, bebedouro, geladeira, porta, portal, fliperama, pôster e nota. Quadro branco, TV e quiosque não têm cores.

**Porta fechada.** Não é um tipo: `doorClosedSprite(o)` desenha a folha na cor da porta e `doorClosedKey(o)` dá o nome da textura (`door:closed:<cor>`), uma por variante. A cena cria a textura de cada porta ao montar o mapa e troca entre `obj:<chave>` (aberta, no chão) e `doorClosedKey(o)` (fechada, na altura dos avatares). A `/dev/cena` abre todas as portas; para ver fechadas: `node e2e/dev-shot.mjs saida.png "http://localhost:5173/dev/cena?pessoas=15" 1920 1080 1500 "const g=window.__oi.game; const ids=Object.keys(g.getState().doors); g.setState({doors:{}}); ids.forEach(id=>window.__oi.bus.emit('doors',{id}))"`.

**Paleta do Mapmaker.** Grupo novo `plants` ("Plantas", `mm.grpPlants`) antes de `decor`, que passou a se chamar "Decoração". As plantas de parede também ficam em "Plantas" (o rótulo diz "(parede)").

**Gerador.** `buildChunk(spec, side, theme, version)` troca cada `plant` do cômodo por `plantFor(version, kind, x, y, w, h)`: na versão 1, sempre `plant`; da 2 em diante, o par de `PLANT_PAIRS` do tipo de cômodo, alternado em diagonal pelos quadrantes (na recepção, costela-de-adão e espada-de-são-jorge se cruzam nos cantos; copa com cacto e palmeira; reunião e auditório com palmeira; sócios com vaso alto). Posições, tamanho e colisão são os mesmos de antes (há teste). Mapas salvos não mudam; a ala nova de um escritório da versão 1 continua com `plant`. O ASCII mostra toda planta como `p`.

**Conferência.** `pnpm art:map --json=docs/visual-v2/catalogo-c3.json --margin=3 --scale=2` gera `prints/mapa-catalogo-c3-day.png`, uma sala com todo o catálogo da C3 (plantas, móveis, copa, interativos, decoração de parede, portas e portal). `prints/cena-15p-portas-fechadas.png` é a cena real com as portas fechadas.

## Guia da Fase D (avatar) para as próximas fases

Arquivos:

| Arquivo | O que tem |
|---|---|
| `packages/shared/src/avatar.ts` | `AvatarConfig` v2, `LegacyAvatarConfig`, `DEFAULT_AVATAR`, `AVATAR_OPTIONS` (paletas e listas), `AVATAR_ACCESSORIES` e `ACC` (ids), `accessoriesConflict`, `accessoryBlockers`, `toggleAccessory`, `sanitizeAccessories`, `sanitizeAvatar`, `avatarConfigKey` (saiu de `types.ts`; o `index.ts` exporta tudo) |
| `apps/web/src/game/art/avatar.ts` | `paintAvatarFrame` (um quadro), `avatarSheet` (4 direções × 3 quadros), `avatarKey`, `avatarPortrait(cfg, escala, direção, quadro)` |
| `apps/web/src/office/AvatarEditor.tsx` | O editor (`AvatarModal`), que saiu de `Modals.tsx` |
| `apps/web/src/office/avatarLabels.ts` | Rótulos das opções pelo i18n |

**Formato.** `{ skin, hair, hairColor, shirt, pants, accessories: number[], beard?, top?, pattern?, bottom?, shoes?, shoeColor?, accColor? }`. `shirt` e `pants` continuam sendo a cor da roupa de cima e de baixo (nomes de antes). Campo opcional ausente ou 0 = visual de antes, e `sanitizeAvatar` omite os que estão no padrão. `sanitizeAvatar` aceita qualquer coisa: formato antigo (`accessory` 1 a 4 vira `[n]`, 0 vira `[]`), formato novo (vale `accessories` se vierem os dois), índice inválido vira 0, id de acessório desconhecido ou repetido sai, conflito fica com o primeiro da lista, e a lista sai em ordem crescente. O servidor normaliza ao entrar na sala, no `/api/auth/me` e na mensagem `avatar`; o banco guarda o JSON normalizado (sem migração: o que está salvo no formato antigo é convertido ao ler). `avatarSheet`/`avatarKey` também normalizam, então o formato antigo desenha igual.

**Acessórios (ids estáveis).** 1 óculos, 2 boné, 3 fones, 4 gravata (os 4 de antes, com o mesmo número), 5 óculos escuros, 6 óculos redondos, 7 chapéu, 8 headset gamer, 9 relógio, 10 brinco, 11 crachá Impera. Regras: um óculos só; boné ou chapéu; fones ou headset; chapéu não combina com fones nem headset; brinco não combina com fones nem headset; gravata, relógio e crachá combinam com tudo (boné + fones e boné + headset podem). A regra mora em `slot`/`excludes` de `AVATAR_ACCESSORIES`; o editor e o `sanitizeAvatar` usam a mesma função. `accColor` (0 = cor original de cada um) vale para boné, chapéu, gravata e o detalhe do headset (`colorable`).

**Para acrescentar uma opção.** Cor: no fim da paleta (nunca no meio: os índices são gravados). Estilo de cabelo: id novo no fim de `hairStyles`, um `case` em `paintHair` (frente, lado com `s` e costas) e o rótulo em `avatarLabels.ts` (`pnpm i18n:extract`). Acessório: id novo em `ACC` e `AVATAR_ACCESSORIES` (com `slot`/`excludes` se precisar), desenho no fim de `paintAvatarFrame` e rótulo. Campo novo: em `AvatarConfig`, `AVATAR_EXTRA_FIELDS` e `AVATAR_EXTRA_OPTIONS` (o `sanitizeAvatar` e a chave já o tratam). O teste `apps/web/test/avatar.test.ts` cobra que toda opção desenha nas 4 direções e 3 quadros, sem vazar dos 32×48, e que cada uma muda o desenho; ele percorre as listas sozinho.

**Desenho.** O caminho de antes (`r` e o `shade` aditivo de `tiles.ts`) ficou intacto: as camadas novas só desenham quando escolhidas. Ordem: sombra, pernas (bermuda põe pele abaixo do joelho, saia deixa a perna de fora e vem por cima), calçados, tronco com estampa e acabamento da roupa (antes do braço, no lado), braços, gola de antes, gravata, crachá, relógio, cabeça, barba, cabelo (recortado debaixo do chapéu; debaixo do boné, só os cabelos novos), brinco, óculos, boné/chapéu, fones/headset. Os desenhos de lado são escritos olhando para a esquerda (`s`) e espelhados (`32 − x − w`), como os de antes. Cores novas usam `prim.ts` (`tint`, `mix`); não passe a saída do `shade` antigo (`rgb()`) para elas.

**Conferência.** `pnpm art:sheet` gera `avatares.png` em seções: formato antigo (os 10 de antes), cabelos, barbas, roupa de cima × estampa, roupa de baixo e calçados andando (3 quadros), acessórios sozinhos e em combinações, e as paletas de 16. `/dev/arte?editor=1` abre o editor sem servidor (o "Salvar" não faz nada ali). Prints do editor em `prints/editor-avatar-*.png`.

**Testes novos.** `packages/shared/test/avatar.test.ts` (conversão, cores nos mesmos índices, objeto vazio, índices fora da lista, exclusões, `toggleAccessory`), `apps/web/test/avatar.test.ts` (todas as opções, quadro de 32×48, formato antigo = novo) e "avatar: aceita o formato antigo e o novo…" em `apps/server/test/api.test.ts`. O teste de regressão de `objects.test.ts` agora congela as 40 configurações antigas (com as listas de antes) e as passa por `sanitizeAvatar`; os hashes são os mesmos.

## Guia da Fase E (cores e setup da mesa) para as próximas fases

Arquivos novos ou com mudança grande:

| Arquivo | O que tem |
|---|---|
| `packages/shared/src/map.ts` | `DeskLook`, `sanitizeDeskLook`, `applyDeskLooks`, `deskLooksKey`, `deskTopAt`, `ObjectDef.wallOnly` e `wallMountError`, `GeneratorMeta.seed`, plantas de chão novas em `DESK_DECOR_TYPES` |
| `apps/server/drizzle/0001_desk_look.sql` | `ALTER TABLE desks ADD COLUMN look jsonb` (aplicada sozinha no start pelo `migrate()` de sempre) |
| `apps/server/src/realtime/office-room.ts` | Mensagens `desk:look` e `decor:color`; `decor:add` com `color` e tampo real; `desk:claim`/`desk:release` apagam o look |
| `apps/web/src/office/ColorTab.tsx` | A aba "Cor" (e "Setup" nas mesas): amostras com a miniatura do sprite em cada variante |
| `apps/web/src/office/groupLabels.ts` | Rótulos dos grupos da paleta (Mapmaker e Build Tool) |
| `packages/map-engine/src/modules.ts` | `SETUP_WEIGHTS`, `CHAIR_COLOR_WEIGHTS`, `hash32`, `pickWeighted`, `setupFor`, `chairColorFor` |

**Look da mesa (cor e setup do ocupante).** A planta (mapa publicado) não muda: a escolha do funcionário fica no registro da mesa, coluna `desks.look` (`{ color?, setup? }`), e chega aos clientes em `DeskInfo.look` (no `init`, no `desks` e também no `POST /api/offices/:slug/enter`). O mapa que o escritório vê é `applyDeskLooks(mapaPublicado, desks)`. `sanitizeDeskLook(mesa, look)` guarda só o que existe no tipo da mesa e difere da planta (escolher o que a planta já tem tira o campo); look inválido para o tipo (a mesa mudou de tipo no Mapmaker) é ignorado ao aplicar. O look é do ocupante: some em "Deixar o posto" (`desk:release`), ao pegar outra mesa (`desk:claim` limpa a antiga e a nova), na atribuição pelo admin para outra pessoa e em `releaseDesksOf` (remoção do funcionário ou do escritório dele). Mesa livre nunca tem look (o padrão dela se muda no Mapmaker). Publicar ou restaurar uma versão do mapa não mexe nos looks (as mesas que continuam no mapa mantêm o delas).

**Mensagens de tempo real novas** (tudo validado no servidor):

- `desk:look { deskId?, color?, setup?, reset? }`: sem `deskId`, a própria mesa. Campo string = escolhe (validado com `objColorError`/`objSetupError` contra o tipo da mesa), `null` ou `''` = volta ao da planta, `reset: true` = apaga o look. Quem pode: a dona da mesa (`build.ownDesk`) ou Dono/Admin (`map.edit`) em qualquer mesa **ocupada**. A gravação só vale se a mesa ainda é do mesmo dono. Resposta: `desks` para todos; erro: `notice { code: 'desk_look_invalid' }`.
- `decor:color { id, color }`: troca a cor de uma decoração que a pessoa pôs na própria mesa (mesmas checagens do `decor:add`/`decor:remove`: `build.ownDesk` e `ownerDeskId === deskId`); `null`/padrão tira o campo. Resposta: `map:patch { add: [obj], remove: [id] }`; erro: `decor_invalid`.
- `decor:add` aceita `color` (variante inválida = `decor_invalid`; a padrão não é gravada) e passou a usar o footprint real (`deskTopAt` → `objSolidAt`): os 3 blocos da mesa grande e o retorno da L são tampo, então objeto sólido (planta grande) não vai neles.

**Cliente.** `useGame` tem `baseMap` (mapa publicado, é o que o **Mapmaker** edita) e `map` (o visto, com os looks: cena, mini-mapa, painéis). `net.ts` refaz o `map` quando chega mapa novo, `map:patch` ou um `desks` com look diferente (`deskLooksKey`) e então emite `map` no barramento. `buildColor` é a cor do objeto que a Build Tool vai colocar (vai no `decor:add`).

**Aba "Cor".** `<ColorTab type color setup onColor onSetup note onHide testid>` mostra as variantes com `objectIcon(type, cor, setup, 48, true)` (o `crop` recorta a parte visível do sprite e amplia em pixels inteiros: uma caneca enche a amostra); o rótulo PT-BR vem no hover (`title`) e embaixo ("Cor: Nogueira"). `hasVariants(type)` diz se há o que escolher. Onde aparece:

- **Mapmaker:** no canto de cima à direita do mapa (recolhível): edita o objeto selecionado; sem seleção, a ferramenta "Colocar" mostra o item da paleta e a escolha vale para os próximos daquele tipo (`placeColors`/`placeSetups`, o ícone da paleta mostra a cor escolhida). Clicar na paleta tira a seleção. Os `Select` de cor e setup da Fase C2 saíram. Mesa com look do ocupante mostra um aviso no painel do objeto.
- **Build Tool** ("Minha mesa" → "Decorar"): à direita, para a própria mesa (cor e setup, `desk:look`, com "Voltar ao padrão da mesa"), para um objeto já posto (`decor:color`, muda na hora) ou para o item da paleta antes de colocar. Durante a colocação, a aba fica no canto de baixo à esquerda da tela. A paleta é agrupada como no Mapmaker (cada tipo uma vez). O antigo "Liberar esta mesa" virou **"Deixar o posto"** (`data-testid="leave-desk"`); os objetos continuam na mesa, como antes.

**Objetos de parede.** `ObjectDef.wallOnly` (cortiça, relógio, neon, split, samambaia pendurada e jardim vertical) + `wallMountError(map, o)`: cada bloco da linha de cima do footprint tem que ser parede com chão logo abaixo (face à mostra). O Mapmaker não deixa colocar fora disso (aviso em toast) nem arrastar para fora; a validação do mapa só dá **aviso** (mapas salvos com esses objetos no chão continuam publicáveis). Quadro decorativo e pôster continuam livres (já estavam na decoração da mesa, no chão).

**Build Tool: plantas.** `DESK_DECOR_TYPES` ganhou `succulent_bowl`, `monstera`, `snake_plant`, `cactus`, `palm` e `tall_vase` (todas 1×1 de chão, mesma colisão da `plant`, que já estava). As de parede ficam de fora.

**Gerador.** `GeneratorMeta.seed` sai da entrada do assistente (`officeSeed`: nome sem espaços nas pontas e em minúsculas, tamanho, quantidade, sócios). Da versão 2 em diante, `placeChunk` sorteia o setup de cada mesa pelo número dela (`setupFor(seed, n, sócio)`; pesos em `SETUP_WEIGHTS`: monitor 10, notebook prata 3, dois monitores 3, all-in-one 2, gamer 1, notebook 1; sócios: dois monitores 2, all-in-one 2, notebook prata 1, monitor 1) e uma cor de cadeira por cômodo (`chairColorFor(seed, ox, oy)`, grafite 4, azul 2, verde, vinho e areia 1). O monitor e o grafite (padrões) não são gravados. A versão 1 não muda, nem a ala nova dela; mapa sem seed usa 0. A cor das mesas não é sorteada (fica a da planta). `pnpm art:map --size=40` mostra o resultado (`prints/mapa-40p-fase-e-day.png`).

**Conferência.** `/dev/cena?abrir=mapmaker` abre o Mapmaker e `/dev/cena?abrir=mesa` abre a Build Tool (com a primeira mesa sua, uma caneca dourada e um vaso), sem servidor; `net.send` não faz nada ali. Prints em `prints/fase-e-*.png` (aba "Cor" e "Setup" na Build Tool, objeto posto, item da paleta e mesa selecionada no Mapmaker).

**Testes novos.** `packages/shared/test/looks.test.ts` (look, `applyDeskLooks`, tampo da L e da mesa grande, objetos de parede, paleta sem repetição), "aba Cor" em `apps/web/test/objects.test.ts`, "setups e cadeiras do visual v2 no gerador (Fase E)" em `generate.test.ts`, e em `apps/server/test/api.test.ts`: "Build Tool: cor da decoração e look da própria mesa…" (inclui o 3º bloco da mesa grande e "Deixar o posto"), "look da mesa: Dono e Admin…" e a remoção do funcionário devolvendo o setup inicial. E2E: "Build Tool: a funcionária troca a cor de um objeto e o setup da mesa; “Deixar o posto” volta ao inicial" em `e2e/tests/office.spec.ts` (rodado aqui com o Chrome do sistema: `CHROME_PATH=/usr/bin/google-chrome pnpm e2e`, depois de `pnpm build`; o servidor do teste usa PGlite, sem Postgres nem Redis).

## Problemas conhecidos

- A página `/dev/arte` foi conferida só pelo servidor do Vite (os módulos compilam e a rota responde); não havia navegador no ambiente da Fase A para abri-la. As folhas PNG saem do mesmo código (`sheet.ts`).
- Sofá virado para a esquerda ou direita usa o desenho de frente (já era assim na arte antiga). A Fase C3 manteve: o sofá é 2×1 fixo, e um sofá de lado precisaria de um footprint 1×2 (mudaria a colisão de mapas salvos).
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
- Pôsteres postos sobre um bloco de chão ficam com o desenho um pouco mais baixo que antes (o pôster agora cabe na face da parede).
- Avatar: um cliente aberto numa versão anterior à Fase D (aba antiga, app desktop sem atualizar) desenha os avatares novos sem acessórios, porque só conhece o campo `accessory`. Some quando o cliente atualiza; o servidor aceita os dois formatos.
- Avatar: a saia não balança ao andar (só as pernas animam, como a calça); a gravata aparece só de frente (como antes); o relógio aparece nos dois lados de perfil.
- Avatar: o topete (cabelo 4) continua aparecendo acima do boné e os fones de antes, de perfil, continuam com a concha na frente do rosto: é o desenho de antes, que não pode mudar. Os cabelos novos ficam recortados debaixo do boné.
- Avatar: com a cor do acessório igual à da roupa (ex.: gravata azul em camisa azul) a gravata some; o editor não impede.
- Fase E: objetos de parede já postos no chão em mapas salvos continuam onde estão (a validação só avisa); o Mapmaker só impede colocar e arrastar para fora da parede.
- Fase E: um cliente aberto numa versão anterior à Fase E (aba antiga, app desktop sem atualizar) não conhece o look e mostra as mesas como no mapa publicado, até atualizar.
- Fase E: a aba "Cor" do Mapmaker fica por cima do canto de cima à direita do mapa (dá para recolher com "–"; volta pelo botão "🎨 Cor").
- Fase E: só a dona da mesa vê a aba da própria mesa na Build Tool; Dono e Admin mudam o look de outra mesa ocupada pela mensagem `desk:look` (o servidor aceita), mas não há tela para isso: para eles, o caminho é o Mapmaker (que muda o padrão da mesa).
- Fase E: no E2E rodado aqui (Chrome com WebGL por software, três páginas com a cena aberta) a suíte inteira passou (18 de 18, 6,8 min), mas o teste do convidado chega perto do limite de 60 s para entrar e falhou uma vez por tempo numa rodada anterior. O teste novo leva de 50 s a 2 min nesse ambiente (limite de 5 min).
