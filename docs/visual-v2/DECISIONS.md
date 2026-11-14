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
| 14/11/2026 | Cada piso é um padrão de 256×256 px (8×8 blocos) desenhado uma vez e recortado por bloco | Desenhar cada bloco com `fillRect` como antes; um sprite por bloco | Padrão contínuo entre blocos, um canvas por piso (262 KB) e redesenho do mapa com um `drawImage` por bloco (o Mapmaker redesenha o mapa a cada edição) |
| 14/11/2026 | Pisos antigos mantêm id, nome e cor de base; só o traço muda | Trocar cores ou reaproveitar ids | Mapas salvos continuam com o mesmo significado |
| 14/11/2026 | A janela (id 2) adota o acabamento da parede vizinha | Um id de janela para cada acabamento | Um item só na paleta, nenhum id a mais, e as janelas dos mapas antigos (ao lado da parede 1) ficam como eram |
| 14/11/2026 | A janela mostra a paisagem só quando ao norte dela está o exterior; vista de fora mostra vidro (à noite, aceso); entre cômodos, vidro simples | Paisagem em toda janela | A face de uma parede é vista do sul: só nesse caso quem olha está dentro, vendo para fora |
| 14/11/2026 | Topo da parede com 10 px e face com 22 px (antes 12 e 20) | Parede mais alta, invadindo o bloco de cima, como na amostra | Dá 12 px de vista à janela sem mexer no modelo nem na posição de nada |
| 14/11/2026 | A parede atual (ardósia com filete dourado) e a escura mantêm a identidade; a clara da amostra entrou como "Parede lisa clara" | Trocar a parede padrão pela clara | Escritórios existentes não mudam de cara; o dourado é da marca |
| 14/11/2026 | Divisória de vidro translúcida, desenhada sobre o piso | Vidro opaco | Lê como vidro e deixa ver o piso; continua sendo parede na colisão |
| 14/11/2026 | Exterior = todo bloco sem piso nem parede, dentro ou fora do mapa; o vazio interno também vira grama (com árvores se couber) | Deixar o vazio interno escuro | Um pátio ou recorte do prédio passa a ser jardim, sem alterar o mapa. Vazio já era bloqueado na colisão |
| 14/11/2026 | Árvore só entra se o sprite inteiro cair em blocos vazios; o exterior fica sempre atrás do chão | Árvores na frente das paredes, com ordenação por profundidade | Nunca cobre o escritório nem os avatares e não precisa entrar na ordenação dos objetos |
| 14/11/2026 | Grama em `TileSprite` do tamanho da tela + um sprite por árvore, margem de 16 blocos | Blocos pré-renderizados do exterior | Memória de textura constante (padrão de 256 px), qualquer tamanho de tela coberto |
| 14/11/2026 | A câmera não mudou: continua presa aos limites do mapa | Soltar a câmera alguns blocos para mostrar mais exterior | Decisão 1 do plano (não mexer na câmera). Fica como sugestão para o Marcelo |
| 14/11/2026 | Períodos em horários fixos: amanhecer 5h–7h, dia 7h–17h, entardecer 17h–19h, noite 19h–5h | Calcular nascer e pôr do sol por data e latitude | O escritório só tem fuso, não tem localização; horário fixo é previsível e testável |
| 14/11/2026 | Fuso vazio ou inválido cai em `America/Sao_Paulo` | UTC | É o padrão do banco para escritórios |
| 14/11/2026 | O período usa o relógio do servidor (`serverNow()`) | Relógio do computador de cada um | Todos veem o mesmo período, mesmo com relógio errado |
| 14/11/2026 | Transição: a grama nova aparece em 1,5 s; árvores e janelas trocam na hora | Interpolar cores | "Transição simples" do plano; sem gradiente nem iluminação |
| 14/11/2026 | Estrelas e lua ficam no céu da vista das janelas; no exterior visto de cima a noite é só a paleta escura, e as janelas vistas de fora ficam acesas | Estrelas sobre a grama | O exterior é visto de cima: não há céu ali |
| 14/11/2026 | Mapmaker com fundo neutro escuro, sem exterior; janelas sempre de dia | Mostrar o exterior no editor | Para editar, importa ver quais blocos estão vazios |
| 14/11/2026 | Mini-mapa e miniaturas: vazio em verde escuro chapado (`#22382a`), cores novas por piso e parede | Manter preto; desenhar árvores | Combina com o exterior sem poluir uma imagem de poucos pixels por bloco |
| 14/11/2026 | Rótulos de pisos e paredes no Mapmaker por `t()` em `tileLabels.ts` | Usar `FLOOR_LABEL` de `shared` direto | O extrator de i18n só enxerga chamadas `t('chave', 'texto')` |
| 14/11/2026 | Tema de pisos escolhido por `GeneratorMeta.version` (2 nos novos); recepção continua com piso claro | Trocar os pisos em todo gerador; porcelanato também na recepção | Ala nova de escritório antigo combina com o resto; recepção e copa ficam diferentes entre si |
| 14/11/2026 | O gerador não usa as paredes novas (só os pisos) | Variar paredes por cômodo | O pedido da fase eram os pisos; as paredes novas ficam à mão no Mapmaker |
| 14/11/2026 | Página `/dev/cena` e `e2e/dev-shot.mjs` para conferir e tirar prints da cena real | Subir servidor, banco e login para cada print | Mostra a cena do Phaser de verdade em segundos; só existe em desenvolvimento |
