# Prompt de execução: visual v2 do office-imp (mais detalhe em pixel art)

## ANTES DE COLAR (só para o Marcelo, não faz parte do prompt)

1. Abra as amostras em `docs/visual-v2/amostras/` e escolha a escala: **48** ou **64** px por bloco.
2. Abra uma sessão nova no projeto "gather", com o repositório `marcelolucas11/office-imp` anexado e permissão de push.
3. Selecione o **Opus 5.5** como modelo da sessão. Ele só coordena; o trabalho pesado vai para agentes Fable 5.2. Se a sessão rodasse direto no Fable e o limite dele acabasse, ela pararia sem conseguir trocar sozinha para o Opus.
4. Preencha as 2 linhas logo abaixo de `=== COLE A PARTIR DAQUI ===` e cole tudo.

=== COLE A PARTIR DAQUI ===

ESCALA ESCOLHIDA: __ px por bloco (48 ou 64)
PRÓXIMO RESET DA MINHA SESSÃO: hoje às __:__ (fuso America/Santiago). Reset semanal: sábado às 23:00.

# MISSÃO

Refazer **toda a arte** do office-imp (`github.com/marcelolucas11/office-imp`) com mais pixels por bloco, mais objetos, mais variações e mais personalização de avatar. A mudança é **somente estética**: a grade lógica, a colisão, as áreas, as mesas, os mapas salvos, as permissões e o servidor de tempo real continuam funcionando exatamente como hoje.

A referência visual obrigatória está em `docs/visual-v2/amostras/`: as PNGs na escala escolhida e o gerador `gen_samples.py`. Ele mostra o estilo aprovado: contorno escuro estilo Stardew (cor vizinha escurecida, não preto puro), tons internos para dar detalhe, nada de sombra projetada, brilho ou luz. A arte nova tem que ficar **no mínimo** neste nível e manter este estilo.

# COMO VOCÊ TRABALHA (orquestração, limites e retomada)

Você, nesta sessão, é o **coordenador**. Não implemente as fases você mesmo.

1. **Uma fase por vez, sempre com um agente:** chame a ferramenta Agent com `model: "fable"` e `run_in_background: false`. Passe a descrição completa da fase, o caminho deste plano (`docs/visual-v2/PROMPT.md`) e o de `docs/visual-v2/PROGRESS.md`. As fases são sequenciais e mexem no mesmo repositório, então nunca rode duas em paralelo.
2. **Fallback:** se o agente Fable falhar por limite de uso, indisponibilidade ou sobrecarga, ou terminar dizendo que não concluiu, rode **a mesma fase** de novo com `model: "opus"`. O agente novo começa lendo o `PROGRESS.md` e o `git log` para continuar de onde o anterior parou. Não repita o que já foi commitado.
3. **Retomada automática** (ferramentas `send_later` e `delete_trigger` do claude-code-remote; carregue com ToolSearch se estiverem adiadas):
   - Ao começar, agende uma mensagem para esta sessão no horário de "PRÓXIMO RESET DA MINHA SESSÃO" + 5 min: *"Retomar o visual v2 do office-imp: leia docs/visual-v2/PROGRESS.md, confira o git log e continue da fase em andamento seguindo docs/visual-v2/PROMPT.md."*
   - Agende também um **backup no reset semanal** (sábado 23:05, America/Santiago) com a mesma mensagem.
   - Toda vez que retomar depois de um reset, apague o agendamento rolante antigo e crie outro para daqui a 5 h 05 min.
   - Se uma mensagem de retomada chegar com o trabalho em dia, só confira o `PROGRESS.md` e siga.
   - Ao terminar tudo, **apague todos os agendamentos**.
4. **Sem perguntas:** tome decisões razoáveis e registre-as em `docs/visual-v2/DECISIONS.md` (decisão, alternativa descartada, motivo).
5. **Ao fim de cada fase:** `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes. Commit com Conventional Commits (`feat(art): …`) e **push direto na `main`**. Atualize `docs/visual-v2/PROGRESS.md` com o que ficou pronto, o que falta e os problemas conhecidos.
6. **Não mexa na VPS e não pergunte sobre atualizar o servidor.** O Marcelo atualiza servidor e apps pelos botões de atualização do próprio app.
7. **Assets:** só arte desenhada por código (como já é hoje) ou CC0/CC-BY com atribuição em `assets/LICENSES.md`. **Nenhuma marca de terceiros**: nada de maçã da Apple, logos de fabricantes de PC, Windows etc. O "MacBook" é um notebook prata genérico. A marca Impera (dourado `#d7b870`) pode aparecer.

# REGRAS DE ARTE

- **Resolução:** `ART = ESCALA ESCOLHIDA` px por bloco. Avatar com 1 bloco de largura × 1,5 de altura (ex.: 64×96 se for 64).
- **Estilo:** o mesmo chibi atual (cabeça grande), mas com roupa e rosto bem mais detalhados.
- **Contorno** automático estilo Stardew em todo objeto e avatar: pixel transparente vizinho de um opaco recebe a cor vizinha misturada ~78% com `#1d1519`. Peças sobrepostas (ex.: monitor sobre a mesa) são contornadas separadamente, para o contorno interno aparecer.
- **Paleta livre, mas coerente:** cada material com 3 a 4 tons próprios (madeira, metal, tecido, planta). Nada de arco-íris. Cor forte só onde faz sentido (RGB do PC gamer, post-its, neon).
- **Chapado:** sem sombra projetada no chão (tire a sombra atual do avatar), sem brilho de tela, sem iluminação dinâmica. Tons internos de detalhe podem.
- **Traços finos sempre com 1 px de arte.** É isso que faz a escala maior ganhar detalhe em vez de só ampliar.
- **Determinístico:** a mesma entrada gera o mesmo pixel (use o `noise()` com seed, nunca `Math.random` no desenho).

# FASES

| Fase | Entregas | Pronto quando |
|---|---|---|
| **1. Base de resolução** | Separe a resolução da arte (`ART`) da grade lógica. Coordenadas de mundo no Phaser em `ART`; zoom da câmera ajustado para o tamanho na tela ficar igual ao de hoje; prefira zooms que deem múltiplos inteiros de pixel de arte (considerando o `devicePixelRatio`). Ajuste o `CHUNK` do chão se precisar. O **Mapmaker não pode criar um canvas maior que 8192 px em nenhum lado** (mapas vão até 300×300 blocos): renderize por pedaços ou em escala reduzida. O JSON do mapa e o banco **não mudam** (sem migração) | escritórios existentes abrem iguais, só mais nítidos; movimento, colisão, áreas e mesas idênticos; testes passam |
| **2. Primitivas de desenho** | Porte para TS (`apps/web/src/game/art/`) as primitivas do `gen_samples.py`: `rect`/`rrect`/`ellipse`/`poly` em unidades de bloco, `prect` em px, contorno automático, `shade`/`mix`/`noise`, módulo de paleta por material, cache de sprite por chave (tipo + cor + escala) | testes unitários das primitivas; uma página de debug `/dev/arte` (só em dev) mostrando todos os sprites |
| **3. Pisos, paredes e exterior** | Redesenhe os pisos atuais e adicione **porcelanato, cimento queimado, madeira em espinha de peixe, carpete com padrão, grama sintética**. Paredes **lisas, tijolo aparente, painel de madeira e divisória de vidro**. Janelas com vista. **Área externa ao redor do escritório: grama e árvores** (gerada automaticamente nas bordas do mapa, sem colisão nova dentro do escritório). **Dia/noite** seguindo o horário no fuso do escritório: amanhecer, dia, entardecer e noite como paletas chapadas, com troca suave a cada poucos minutos e estrelas e lua à noite | escritório "Impera" com vista e exterior; troca de período testada mudando o relógio |
| **4. Mesas e cadeiras** | **Mesas:** reta 2×1 e 3×1, em L 3×2, standing desk, de vidro, de madeira escura, gamer, bancada compartilhada. **Cadeiras:** escritório comum, gamer, executiva de couro, banqueta, poltrona, pufe | todas no Mapmaker, com colisão e áreas de mesa corretas (a mesa em L usa o polígono certo) |
| **5. Setups e objetos de mesa** | Uma camada "sobre a mesa". **Equipamentos:** PC gamer (gabinete com fans RGB + monitor ultrawide), setup com 2 monitores, notebook prata (estilo MacBook, sem logo), all-in-one (estilo iMac, sem logo), notebook comum, teclado mecânico, mousepad grande, mouse, caneca, garrafa, fone, luminária, porta-retrato, post-its, livros, troféu, suculenta e cacto de mesa. **10 extras aprovados:** cafeteira expresso com moedor, microfone de podcast com braço articulado, ring light no tripé, impressora multifuncional, máquina de snacks, quadro de cortiça com fotos e post-its, relógio de parede (mostra a hora real do escritório), letreiro neon com texto editável, aquário com peixes, ar-condicionado split | todos colocáveis e visíveis na paleta |
| **6. Plantas e decoração** | Costela-de-adão, espada-de-são-jorge, cacto, suculenta, palmeira, samambaia pendurada, vaso alto, planta de parede. Redesenhe também o resto do catálogo atual (sofá, poltrona, estante, gaveteiro, cafeteira, bebedouro, geladeira, luminária, quadros, troféu, tapetes, tapete com logo, pódio, porta, portal, quadro branco, TV, quiosque, fliperama, pôster, nota) no novo nível de detalhe | nenhum sprite antigo de 32 px sobrando |
| **7. Avatar v2** | Sprite em camadas, 4 direções × 3 quadros de caminhada (sem animação de sentar nem de digitar). **Rosto:** formatos de olhos (com branco, pupila e brilho), sobrancelhas, boca, barba e bigode, sardas e blush. **Corpo:** tipos de corpo. **Cabelos:** pelo menos 12 estilos. **Roupas por peça:** camiseta, camisa social (gola, botões, bolso), moletom (capuz, cordão, bolso canguru), blazer, vestido, saia, calça, bermuda, calçados (social, tênis, bota). **Estampas:** listras, xadrez, logo Impera e lisa. **Acessórios com seleção múltipla** (vários ao mesmo tempo): vários óculos, relógio, brinco, chapéu, boné, headset gamer, fones, gravata, crachá Impera; o editor impede combinações impossíveis, como chapéu e boné juntos. **Cores:** paleta fixa de **16 por peça**. Editor de avatar com prévia ao vivo nas 4 direções | `AvatarConfig` v2 com `sanitizeAvatar` no servidor; **avatares antigos convertidos sem perda** (o `accessory: number` vira `accessories: number[]`); testes de compatibilidade |
| **8. Cores e setup da mesa** | **Cada objeto existe uma única vez na paleta.** Ao selecionar um objeto (Mapmaker ou Build Tool), aparece no canto uma **aba "Cor"** com as variantes daquele objeto (ex.: cadeira gamer vermelha, azul, preta, branca…). Campo opcional `color` no objeto do mapa, validado no servidor; mapas antigos usam a cor padrão. **Setup da própria mesa:** pela Build Tool, o funcionário troca o setup da mesa dele (PC gamer, notebook, 2 monitores etc. + cores). **Ao clicar em "Deixar o posto", a mesa volta para o setup inicial do escritório** (o mesmo vale quando o funcionário é removido, junto com o `releaseDesksOf`). O **gerador procedural sorteia setups variados**, de forma determinística pela seed, nas mesas novas | E2E: trocar a cor de um objeto, mudar o setup da mesa, deixar o posto e confirmar que voltou ao inicial |
| **9. Animações de contexto** | Leves e coerentes com o cenário: fans e teclado RGB ciclando devagar, tela do monitor com pequenas mudanças, vapor na caneca e na cafeteira, peixes no aquário, ponteiros do relógio, neon piscando de leve, LED do PC, árvores do lado de fora balançando, nuvens andando. Plantas internas paradas (exceto perto do ar-condicionado). **Orçamento:** animação por troca de quadros em spritesheet, no máximo 4 a 8 quadros, sem redesenhar canvas a cada frame; respeite `prefers-reduced-motion` com uma opção "Reduzir animações" nas configurações do usuário | sem queda de FPS (Fase 10) |
| **10. QA e desempenho** | Prints do Playwright **antes e depois** do escritório "Impera" e de escritórios gerados de 7, 15 e 40 pessoas, salvos em `docs/visual-v2/prints/`. Medir FPS e memória de texturas com 3 abas abertas e com um mapa de 100×100. Testar no desktop Electron (Mac) | FPS ≥ 55 num Mac M1 de referência (ou equivalente no CI); memória de texturas registrada no PROGRESS |
| **11. Release** | Atualize o README com prints novos e o `CHANGELOG`. Versão **minor** (a última tag é `v1.0.8`, então `v1.1.0`), tag e release pelo `release.yml` | release publicada; Marcelo atualiza pelos botões |

# CHECKLIST FINAL (deixe preenchido no PROGRESS.md)

- [ ] Arte toda na escala escolhida, nenhum sprite antigo sobrando
- [ ] Mapas e avatares antigos funcionando sem migração manual
- [ ] Exterior com grama e árvores + dia/noite pelo fuso do escritório
- [ ] Todas as mesas, cadeiras, plantas, equipamentos e os 10 extras
- [ ] Aba "Cor" por objeto (sem objetos duplicados por cor)
- [ ] Setup da própria mesa + "Deixar o posto" volta ao inicial
- [ ] Avatar v2 com acessórios múltiplos e 16 cores por peça
- [ ] Animações de contexto + opção "Reduzir animações"
- [ ] Prints antes/depois, FPS e memória medidos
- [ ] Release v1.1.0 publicada
- [ ] Agendamentos de retomada apagados
