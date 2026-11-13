# Visual v2 — progresso

Plano: `PROMPT.md`. Decisões: `DECISIONS.md`.

| Fase | Estado | Observações |
|---|---|---|
| 0. Amostras de escala | pronto | Marcelo escolheu manter 32 px e o boneco no formato atual |
| A. Base | pronto | Primitivas, paletas, cor por objeto, `pnpm art:sheet`, `/dev/arte` e testes. Cadeira e sofá já no estilo novo (5 cores). Guia de uso logo abaixo |
| B. Pisos, paredes e exterior | pendente | |
| C1. Mesas e cadeiras | pendente | |
| C2. Setups e objetos de mesa | pendente | |
| C3. Plantas e catálogo antigo | pendente | |
| D. Avatar: mais opções | pendente | |
| E. Cores e setup da mesa | pendente | |
| F. Animações | pendente | |
| G. QA e release | pendente | |

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

## Problemas conhecidos

- A página `/dev/arte` foi conferida só pelo servidor do Vite (os módulos compilam e a rota responde); não havia navegador no ambiente da Fase A para abri-la. As folhas PNG saem do mesmo código (`sheet.ts`).
- Sofá virado para a esquerda ou direita usa o desenho de frente (já era assim na arte antiga). Se a Fase C3 quiser as 4 direções, o `SpritePainter` do sofá recebe `info.o.dir`.
