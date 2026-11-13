# Visual v2 — decisões

| Data | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| 13/11/2026 | Manter 32×32 px por bloco | Subir para 48 ou 64 px | Escolha do Marcelo depois de ver as amostras. O detalhe extra vem do traço de 1 px |
| 13/11/2026 | Boneco mantém o formato quadrado atual; avatar salvo renderiza idêntico | Avatar redesenhado como nas amostras | Pedido do Marcelo ("o boneco quadrado igual está agora") |
| 13/11/2026 | A sombra do boneco fica, apesar do "tudo chapado" | Tirar a sombra | "Igual está agora" é a instrução mais recente e mais específica |
| 13/11/2026 | Personalização nova do avatar entra só como opções a mais, com padrão = visual atual | Não mexer em nada do avatar | Ele pediu acessórios múltiplos, 16 cores e mais itens; isso cabe sem mudar o formato |
| 13/11/2026 | Notebook prata e all-in-one genéricos, sem logos | Desenhar a maçã | Não reproduzimos marcas de terceiros |
| 13/11/2026 | Sem animação de sentar nem de digitar | — | Resposta à pergunta 10 |
| 13/11/2026 | Estampas de roupa incluídas (lisa, listras, xadrez, logo Impera) | Sem estampas | Pergunta 9 ficou sem resposta; segue a sugestão |
| 13/11/2026 | Primitivas desenham num buffer RGBA próprio (`Sprite`) e só viram canvas no fim | Desenhar com `arc`/`fill` do canvas 2D | O canvas suaviza bordas; no buffer o pixel é sempre inteiro, e o código roda igual no navegador, em Node e nos testes |
| 13/11/2026 | `shade` novo é proporcional e devolve hex; o `shade` antigo (aditivo) fica em `tiles.ts` até a arte antiga sumir | Trocar o `shade` antigo | Trocar mudaria os pixels de todo o catálogo antigo antes da hora |
| 13/11/2026 | `color` inválido vindo do cliente é **recusado** na validação; `color` inválido já gravado é **normalizado** (volta à cor padrão) ao carregar e ao publicar | Só recusar, ou só normalizar | Recusar dá erro claro no Mapmaker; normalizar garante que restaurar uma versão antiga nunca quebra se uma cor sair do catálogo |
| 13/11/2026 | Ids de cor em inglês e estáveis (`graphite`, `blue`…); rótulo em pt-BR na definição, como os rótulos dos objetos | Ids em português | Segue o padrão dos tipos de objeto (`chair`, `sofa`). Não renomear nem remover ids já lançados |
| 13/11/2026 | Cadeira e sofá ganharam as mesmas 5 cores de estofado; grafite é a padrão | Cores diferentes por móvel | A padrão fica próxima da cor antiga, então escritórios existentes mudam de traço, não de cor |
| 13/11/2026 | Cadeira e sofá continuam com o mesmo tamanho (1×1 e 2×1, sem `tall`) | Cadeira mais alta que o bloco, como na amostra | Mexer em `tall` muda a posição do sprite no mapa; fica para a Fase C1, junto com as outras cadeiras |
| 13/11/2026 | `pnpm art:sheet` usa `@napi-rs/canvas` com `tsx` e uma fonte de pixels 3×5 própria | Navegador headless; fontes do sistema | Roda em menos de 2 s sem navegador, e o PNG sai idêntico em qualquer máquina (bom para commitar) |
| 13/11/2026 | Vitest configurado em `apps/web`, com teste de regressão do avatar por hash | Testar as primitivas em outro pacote | Os testes ficam ao lado da arte, e o "avatar idêntico" passa a ser cobrado pelo CI já agora |
| 13/11/2026 | O servidor de tempo real não foi tocado: `decor:add` segue criando objetos sem `color` | Aceitar `color` no `decor:add` já | A regra da fase é não mexer no tempo real; a Fase E faz isso junto com a aba "Cor" |
| 13/11/2026 | A exportação para o Tiled leva a propriedade `color` quando o objeto tem | Deixar de fora | Evita perder a cor num mapa exportado; mapas sem cor exportam igual a antes |
