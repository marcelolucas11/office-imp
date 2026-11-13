# Plano de execução: visual v2 do office-imp

Atualizado em 13/11/2026 com as decisões finais do Marcelo. Este arquivo é a fonte de verdade do trabalho; o andamento fica em `PROGRESS.md` e as decisões em `DECISIONS.md`.

## Decisões finais (valem sobre qualquer versão anterior deste plano)

1. **Escala: 32×32 px por bloco, como hoje.** Não muda `TILE`, zoom, câmera, chunks nem o Mapmaker. O ganho de detalhe vem de desenhar com traços de **1 px** (a arte antiga usava "pixels duplos" de 2×2 e retângulos grandes). Referência: `amostras/amostra-32px.png`.
2. **Boneco: o formato quadrado atual fica igual** (32×48, mesma silhueta, mesmas proporções, mesma animação de caminhada, mesma sombra). Um avatar já salvo tem que renderizar **pixel a pixel igual** ao de hoje. As novidades de personalização são só opções a mais dentro desse formato.
3. **Sem supervisão:** ninguém aprova nada. Tomar decisões razoáveis, registrar em `DECISIONS.md` e seguir. Nunca perguntar.
4. **Não mexer na VPS.** O Marcelo atualiza servidor e apps pelos botões do próprio app.

## Missão

Refazer a arte de cenário e objetos do office-imp com mais detalhe, mais objetos e mais variações, e ampliar a personalização do avatar. A mudança é **somente estética**: grade lógica, colisão, áreas, mesas, mapas salvos, permissões e tempo real continuam exatamente como hoje. Mapas e avatares existentes continuam válidos sem migração manual.

## Como o trabalho roda

- O coordenador executa **uma fase por vez** com um agente (Fable 5.2; se falhar por limite ou indisponibilidade, repete a mesma fase com o Opus 5.5). O agente novo lê este plano, o `PROGRESS.md` e o `git log` e continua de onde parou.
- Retomada automática agendada para logo depois de cada reset de limite (a cada 5 h) e uma reserva no reset semanal (sábado 23:05, America/Santiago). Ao terminar tudo, os agendamentos são apagados.
- Ao fim de cada fase: `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes; commit em Conventional Commits (`feat(art): …`); **push direto na `main`**; `PROGRESS.md` atualizado.
- Conferência visual obrigatória: gerar a folha de sprites em PNG (`pnpm art:sheet`, criado na Fase A) e **olhar a imagem** antes de dar a fase como pronta.

## Regras de arte

- **32 px por bloco.** Objetos altos usam `tall` como hoje.
- **Contorno automático estilo Stardew** em objetos: pixel transparente vizinho de um opaco recebe a cor vizinha misturada ~78% com `#1d1519`. Peças sobrepostas são contornadas separadamente.
- **Paleta livre, mas coerente:** 3 a 4 tons por material (madeira, metal, tecido, planta). Nada de arco-íris. Cor forte só onde faz sentido (RGB do PC gamer, post-its, neon).
- **Chapado:** sem sombra projetada de objetos, sem brilho de tela, sem iluminação dinâmica. (A sombra do boneco fica, por causa da decisão 2.)
- **Traços finos sempre com 1 px.**
- **Determinístico:** mesma entrada, mesmo pixel (`noise()` com seed, nunca `Math.random` no desenho).
- **Assets:** só arte desenhada por código. **Nenhuma marca de terceiros** (sem maçã, sem logos de fabricantes). O "MacBook" é um notebook prata genérico; o "iMac" é um all-in-one genérico. A marca Impera (dourado `#d7b870`) pode aparecer.

## Fases

| Fase | Entregas | Pronto quando |
|---|---|---|
| **A. Base** | Primitivas de desenho em TS (`apps/web/src/game/art/`): `px`/`rect`/`rrect`/`ellipse`/`poly`, contorno automático, `shade`/`mix`/`noise`, paletas por material, cache de sprite por chave (tipo + cor + tamanho + direção). Campo opcional **`color`** no objeto do mapa e `colors` na definição do objeto (`packages/shared`), validado no servidor; mapa antigo usa a cor padrão. Script **`pnpm art:sheet`** que renderiza em Node (sem navegador) uma folha PNG com todos os pisos, paredes, objetos (em todas as cores) e avatares de exemplo, para conferência visual. Página `/dev/arte` só em dev | testes unitários das primitivas e do `color`; folha gerada |
| **B. Pisos, paredes e exterior** | Pisos atuais redesenhados + **porcelanato, cimento queimado, espinha de peixe, carpete com padrão, grama sintética**. Paredes **lisa, tijolo aparente, painel de madeira, divisória de vidro**. Janelas com vista. **Exterior ao redor do escritório: grama e árvores** (gerado nas bordas, sem alterar colisão). **Dia/noite** pelo horário no fuso do escritório: amanhecer, dia, entardecer e noite como paletas chapadas, com estrelas e lua à noite | escritórios existentes abrem com exterior e vista; período testado com relógio falso |
| **C1. Mesas e cadeiras** | **Mesas:** reta 2×1 (redesenho da atual) e 3×1, em L 3×2, standing desk, de vidro, de madeira escura, gamer, bancada compartilhada. **Cadeiras:** escritório, gamer, executiva de couro, banqueta, poltrona, pufe. Cada um com suas variantes de cor (`colors`) | todas no Mapmaker, colisão e áreas de mesa corretas |
| **C2. Setups e objetos de mesa** | "Setup" da mesa (o que fica em cima): PC gamer (gabinete RGB + ultrawide), 2 monitores, notebook prata, all-in-one, notebook comum, só monitor (o atual). Objetos pequenos: teclado mecânico, mousepad grande, mouse, caneca, garrafa, fone, luminária de mesa, porta-retrato, post-its, livros, troféu, suculenta, cacto de mesa. **10 extras:** cafeteira expresso com moedor, microfone de podcast com braço, ring light no tripé, impressora multifuncional, máquina de snacks, quadro de cortiça, relógio de parede (hora real do escritório), letreiro neon com texto editável, aquário, ar-condicionado split | todos na paleta e na folha |
| **C3. Plantas e catálogo antigo** | Costela-de-adão, espada-de-são-jorge, cacto, suculenta, palmeira, samambaia pendurada, vaso alto, planta de parede. Redesenho do resto do catálogo (sofá, poltrona, estante, armário, cafeteira, bebedouro, geladeira, luminária, quadros, troféu, tapetes, tapete com logo, púlpito, porta, portal, quadro branco, TV, quiosque, fliperama, pôster, nota, mesa de reunião, mesa redonda, balcão) | nenhum sprite no estilo antigo sobrando |
| **D. Avatar: mais opções, mesmo formato** | Sem mudar silhueta nem tamanho. **Acessórios com seleção múltipla** (`accessories: number[]`; o `accessory` antigo é convertido): óculos (2 ou 3 modelos), boné, chapéu, fones, headset gamer, gravata, relógio, brinco, crachá Impera; o editor impede combinações impossíveis. **Cores: paleta fixa de 16 por peça** (as cores atuais continuam nos mesmos índices). Mais cabelos, barba/bigode, tipo de roupa de cima (camiseta, social, moletom, blazer), de baixo (calça, bermuda, saia), calçado e estampa (lisa, listras, xadrez, logo Impera), tudo como opção com padrão = visual de hoje. Editor com prévia nas 4 direções | teste de regressão: avatares antigos renderizam idênticos; `sanitizeAvatar` aceita o formato antigo e o novo |
| **E. Cores e setup da mesa** | **Cada objeto aparece uma vez só na paleta.** Ao selecionar um objeto (Mapmaker e Build Tool), aparece no canto a **aba "Cor"** com as variantes dele. **Setup da própria mesa:** o funcionário troca o setup e as cores da mesa dele. **"Deixar o posto"** (e remoção do funcionário) devolve a mesa ao setup inicial. O gerador sorteia setups variados de forma determinística | testes de servidor + E2E do fluxo |
| **F. Animações de contexto** | Leves: RGB dos fans e do teclado, tela do monitor, vapor do café, peixes do aquário, ponteiros do relógio, neon, LED do PC, árvores e nuvens do lado de fora. Troca de quadros pré-gerados (4 a 8), nunca redesenhar canvas por frame. Opção "Reduzir animações" + `prefers-reduced-motion` | sem queda de FPS |
| **G. QA e release** | Prints antes/depois em `docs/visual-v2/prints/` (escritório padrão e gerados de 7, 15 e 40 pessoas), medição de FPS e memória de texturas, README e CHANGELOG, versão **v1.1.0** com tag (o `release.yml` gera os instaladores) | release publicada |

## Checklist final (preencher no PROGRESS.md)

- [ ] Arte de cenário e objetos refeita com traço de 1 px, nenhum sprite antigo sobrando
- [ ] Mapas e avatares antigos funcionando sem migração manual; avatar antigo idêntico
- [ ] Exterior com grama e árvores + dia/noite pelo fuso do escritório
- [ ] Todas as mesas, cadeiras, plantas, setups, objetos de mesa e os 10 extras
- [ ] Aba "Cor" por objeto (sem objetos duplicados por cor)
- [ ] Setup da própria mesa + "Deixar o posto" volta ao inicial
- [ ] Avatar com acessórios múltiplos e 16 cores por peça
- [ ] Animações de contexto + opção "Reduzir animações"
- [ ] Prints antes/depois, FPS e memória medidos
- [ ] Release v1.1.0 publicada
- [ ] Agendamentos de retomada apagados
