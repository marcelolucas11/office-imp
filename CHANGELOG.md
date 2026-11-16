# Changelog

As versões seguem `MAJOR.MINOR.PATCH`. Cada versão publicada tem os instaladores e as notas em
[Releases](https://github.com/marcelolucas11/office-imp/releases).

## 1.5.0 — 16/11/2026 — Modo Mini em ícone

- **Sozinho, o Modo Mini vira um ícone.** Sem ninguém na conversa, o Modo Mini fica do tamanho de um
  ícone, como no Gather: o seu boneco (ou a sua câmera, se estiver ligada), a bolinha do status e
  quantas outras pessoas estão online no escritório. Quando alguém entra na conversa, voltam as
  câmeras; quando a conversa acaba, volta o ícone.
- **Controles ao passar o mouse.** Aparecem a moldura e três botões: configurações (status, microfone,
  câmera, voltar ao escritório e **Fechar o Modo Mini**), arrastar e expandir. Clicar no ícone também
  volta para o escritório. "Fechar" some com o Modo Mini sem trazer o escritório para a frente (no
  Windows a janela fica minimizada na barra de tarefas; no Mac, no Dock).
- **Arrastar para qualquer canto.** Pela alça do meio, o Modo Mini vai para qualquer lugar de qualquer
  tela e abre no mesmo lugar da próxima vez.
- **Aumentar e diminuir pelas bordas.** Com o mouse em cima, puxe qualquer borda ou canto: o ícone vai
  de 56 a 220 px e as câmeras de 220 a 480 px de largura. O canto oposto fica parado e o tamanho fica
  guardado.
- **"Não incomodar" esconde o Modo Mini.** No app desktop ele some na hora e volta sozinho quando o
  status muda; o Modo Mini automático não entra em "Não incomodar". No navegador, o Modo Mini acaba.
- **Correção.** A janela do Modo Mini no app desktop agora acompanha o tamanho do conteúdo sempre
  (antes o tamanho só era enviado ao abrir, e a janela não crescia quando alguém entrava na conversa).

### Antes de atualizar

- **Nada manual.** Atualize o servidor e os apps (Mac e Windows) pelos botões de sempre. O arrastar
  suave e o "Fechar" sem trazer o escritório precisam do app desktop novo; com o app antigo, o
  arraste usa a alça do sistema e "Fechar" volta para o escritório.

## 1.4.0 — 16/11/2026 — Controles de áudio e vídeo por pessoa

- **Botão "⋯" em cada vídeo e em cada tela compartilhada.** Passe o mouse no quadro de outra pessoa
  (ou clique com o botão direito) para abrir os controles dela. Na tela ampliada, o botão "Áudio e
  vídeo" fica ao lado de "Tela cheia".
- **Só para você:** barra de volume da voz de cada pessoa (0 a 100%, por cima da queda de volume pela
  distância), silenciar a pessoa só para você, e ocultar o vídeo dela só para você (o vídeo deixa de
  ser baixado, o áudio continua). Na tela compartilhada: volume e silenciar o áudio da tela, e ocultar
  a tela. Volume e silenciar ficam guardados por pessoa no seu computador; ocultar vale até sair do
  escritório. Quadro oculto mostra "Vídeo oculto para você" — um clique mostra de novo.
- **Para todos na conversa:** qualquer pessoa desliga o microfone, a câmera ou o compartilhamento de
  tela de quem está conversando com ela (mesma área privada, mesma mesa ou dentro do raio). O corte é
  feito no servidor de áudio e vídeo, então vale para a sala inteira. Só a própria pessoa religa, e ela
  recebe um aviso com o nome de quem desligou. Quem só está ouvindo o palco (Spotlight) não desliga o
  palco.
- **Auditoria.** Cada "desligar para todos" fica registrado em Administração → Auditoria (quem, de
  quem e o quê).

### Antes de atualizar

- **Nada manual.** Atualize o servidor e os apps pelos botões de sempre.

## 1.3.0 — 16/11/2026 — Áreas das mesas no Mapmaker, mesa do funcionário e auditoria

- **Áreas das mesas no Mapmaker.** A aba "Áreas" agora lista, em "Áreas das mesas", a área de
  conversa de cada mesa de trabalho. Dá para renomear ("Mesa do João"), mudar a capacidade, marcar
  "somente equipe" ou "sala de reunião", aumentar ou diminuir com "Marcar área" (arraste; com Alt,
  diminui), voltar ao padrão 2×2 ou tirar a área da mesa. A configuração fica gravada na mesa e anda
  junto quando a mesa muda de lugar. A validação recusa área de mesa por cima de outra área privada.
- **Mesa do funcionário: modelo, cadeira e tapete.** Em Minha mesa → Decorar, além de cor e setup,
  cada pessoa escolhe o modelo da mesa (entre os do mesmo tamanho), a cadeira (tipo e cor) e um
  tapete debaixo da mesa (cor, ou sem). Vale só enquanto a mesa for dela e não muda o mapa publicado
  nem a passagem.
- **Funcionário mexe só na própria mesa e no avatar.** O servidor já recusava qualquer mudança fora
  da mesa; agora as mesas da sala dos sócios só podem ser pegas por Dono e Admin, e o pôster da mesa
  só aceita imagem enviada ao próprio servidor (link externo vazaria o IP de quem olha).
- **Performance.** O servidor entrega o app já comprimido (brotli/gzip gerados no build): o código
  do escritório cai de 2,3 MB para 0,47 MB na rede, sem depender do proxy da VPS comprimir. Os
  arquivos com hash ficam no cache do navegador e do app por 1 ano. No app desktop, o mapa para de
  ser redesenhado com a janela escondida, minimizada ou no Modo Mini (antes seguia a 60 quadros por
  segundo sem ninguém ver).
- **Segurança.** Limite de mensagens por pessoa no tempo real (chat, recados, decoração, quadro…);
  o IP usado no limite de login só vem de proxies da própria máquina ou da rede privada
  (`TRUST_PROXY`); teto de tentativas de login por usuário somando todos os IPs; token do
  atualizador comparado em tempo constante; dependências atualizadas (nodemailer 10, @fastify/static
  10, drizzle-orm 0.45, zod 4) — o `pnpm audit` passou de 45 alertas (18 altos) para só o nanoid
  antigo dentro do Colyseus, que não é explorável aqui. Relatório completo em
  [docs/AUDITORIA-1.3.0.md](docs/AUDITORIA-1.3.0.md).

### Antes de atualizar

- **Nada manual.** Mapas, mesas e personalizações salvas continuam valendo. A variável nova
  `TRUST_PROXY` é opcional: vazia, o app confia no proxy da própria VPS (nginx no host ou
  Traefik/Caddy em Docker), que é o caso da instalação atual.
- **App desktop:** a pausa do mapa com a janela escondida chega com a atualização automática do app.

## 1.2.2 — 15/11/2026 — Compartilhar a tela no Modo Mini

- **Botão de compartilhar a tela no Modo Mini.** A barrinha da janela flutuante ganhou o botão de
  tela, ao lado do microfone e da câmera: dá para começar e parar de compartilhar sem voltar para o
  escritório. A janela mini ficou um pouco mais larga para caber tudo com o status visível.
- **Seletor de tela visível no Modo Mini (app desktop).** Com a janela principal escondida, o seletor
  de tela/janela agora abre solto e por cima de tudo, em vez de ficar preso à janela invisível.

## 1.2.1 — 15/11/2026 — Clique só na janela aberta

- **O clique não atravessa mais os painéis.** Clicar no editor de avatar, num modal ou em qualquer
  painel por cima do mapa selecionava também o que estava por baixo (quadro, objeto, o personagem de
  outra pessoa) ou marcava o destino da caminhada. Agora o clique vale só para a janela que está à
  vista; o mapa só recebe o clique feito diretamente nele.

## 1.2.0 — 15/11/2026 — Paredes altas

As paredes eram finas demais para o tamanho do boneco: o personagem ficava maior que a porta e os
objetos encostados na parede passavam por cima dela. Agora paredes, portas e janelas têm a escala
do avatar.

![Antes e depois](docs/paredes-altas/antes-depois.png)

- **Paredes de 2 blocos de altura.** A face da parede (a parte de frente) ocupa 2 fileiras: o boneco
  tem cerca de 3/4 da altura da parede, e geladeira, estante, quadro branco e TV ficam encostados
  nela em vez de passar por cima. Os cantos e os trechos verticais continuam como topo de parede.
- **Portas de 2 blocos.** O vão da porta atravessa a parede inteira, com verga por cima no
  acabamento da parede; o boneco passa por ela com folga. Fechada, a porta bloqueia o vão todo; dá
  para abrir e fechar dos dois lados (X perto dela).
- **Janelas altas**, com mais céu na vista, travessa e peitoril. Todos os acabamentos (ardósia,
  escura, lisa, tijolo, madeira e vidro) foram adaptados.
- **Árvores maiores** no exterior, na escala do prédio (2 a 3 vezes a altura de uma pessoa).
- Ao entrar numa sala privada, o recorte claro pega a parede alta inteira.

### Antes de atualizar

- **Mapas salvos:** nenhum passo manual. Ao carregar, o servidor atualiza o mapa sozinho: cada
  parede com face ganha uma fileira, e tudo o que fica abaixo dela desce junto (mesas, áreas,
  spawns, portas). Por isso o mapa fica algumas fileiras mais alto. Objetos de parede (relógio,
  split, neon…) ficam na fileira de cima da face. A versão atualizada passa a ser a salva na
  próxima publicação pelo Mapmaker. A ala nova de uma expansão já sai com paredes altas.
- **Posições salvas:** quem estava numa posição que virou parede volta para a entrada.
- **Mapmaker:** uma parede desenhada com 1 fileira continua aparecendo fina (como antes). Para a
  parede alta, desenhe 2 fileiras.

## 1.1.0 — 14/11/2026 — Visual v2

A arte do cenário e dos objetos foi refeita com mais detalhe, mais objetos e mais variações, e o
avatar ganhou mais opções. A mudança é **só estética**: grade, colisão, áreas, mesas, permissões e
tempo real continuam como eram, e mapas e avatares já salvos continuam válidos.

![Antes e depois](docs/visual-v2/prints/antes-depois.png)

### Antes de atualizar

- **Banco de dados:** esta versão inclui a migração `0001_desk_look.sql` (uma coluna nova,
  `desks.look`). Ela é **aplicada sozinha quando o servidor inicia**; não há nada a rodar à mão.
  A atualização pelo painel (Painel do ADM → Atualizações → **Atualizar servidor**) já faz o backup
  do banco antes.
- **Clientes antigos:** quem estiver com o app ou a aba numa versão anterior continua entrando
  normalmente, mas vê os avatares sem os acessórios novos e as mesas sem a cor e o setup escolhidos
  pelos ocupantes, até atualizar. Depois de atualizar o servidor, use **Atualizar todos agora**.
- **Mapas e avatares salvos:** nenhum passo manual. Os escritórios existentes abrem com a arte nova
  nos mesmos lugares, e um avatar já salvo é desenhado pixel a pixel como antes.

### Cenário

- Pisos, paredes e todos os objetos redesenhados em 32 px com traço de 1 px e contorno.
- **Pisos novos:** porcelanato, cimento queimado, espinha de peixe, carpete com padrão e grama
  sintética (15 no total). **Paredes novas:** lisa clara, tijolo aparente, painel de madeira e
  divisória de vidro (7 no total). Janelas com vista para fora.
- **Exterior:** grama, árvores, arbustos, flores e pedras em volta do escritório. A câmera agora
  anda alguns blocos além da borda do mapa para mostrar o lado de fora (colisão e movimento não
  mudam).
- **Dia e noite** pelo horário do fuso do escritório: amanhecer, dia, entardecer e noite, com
  estrelas e lua à noite.
- Os escritórios novos criados pelo assistente já saem com os pisos novos, plantas variadas, setups
  variados nas mesas e uma cor de cadeira por sala. Os escritórios existentes não são alterados.

### Objetos

- **Mesas de trabalho:** reta, de 3 blocos, em L, standing desk, de vidro, de madeira escura, gamer
  e bancada compartilhada.
- **Cadeiras e assentos:** de escritório, gamer, executiva de couro, banqueta, poltrona e pufe.
- **Setup da mesa** (o que fica em cima): monitor, PC gamer com ultrawide, dois monitores, notebook
  prata, all-in-one, notebook e vazio.
- **Objetos de mesa:** teclado mecânico, mousepad, mouse, caneca, garrafa, fone, luminária,
  porta-retrato, post-its, livros, troféu, suculenta e cacto.
- **Extras:** cafeteira expresso, microfone de podcast, ring light, impressora, máquina de snacks,
  aquário, quadro de cortiça, relógio de parede com a hora do escritório, letreiro neon com texto
  editável e ar-condicionado split.
- **Plantas:** costela-de-adão, espada-de-são-jorge, mandacaru, suculentas, palmeira, vaso alto,
  samambaia pendurada e jardim vertical.
- O restante do catálogo (sofá, estante, armário, copa, tapetes, porta, portal, quadro branco, TV,
  quiosque, fliperama, pôster, placa, mesas de reunião e balcão) foi redesenhado no mesmo estilo.

### Cores e mesa de cada pessoa

- Cada objeto aparece **uma vez** na paleta; a **aba "Cor"** (Mapmaker e Build Tool) mostra as
  variantes dele. Nas mesas, a mesma aba tem o **Setup**.
- Cada pessoa escolhe a **cor e o setup da própria mesa** em ⋯ → Minha mesa → Decorar, sem alterar
  o mapa publicado. **"Deixar o posto"** (antes "Liberar esta mesa") devolve a mesa ao padrão.
- Objetos de parede (cortiça, relógio, neon, split, samambaia e jardim vertical) só podem ser
  colocados na face de uma parede.

### Avatar

- O boneco continua o mesmo (formato, tamanho e animação). Novas opções: **acessórios com seleção
  múltipla** (3 óculos, boné, chapéu, fones, headset gamer, gravata, relógio, brinco e crachá
  Impera), **16 cores por peça**, 15 cabelos, barba e bigode, tipo de roupa de cima e de baixo,
  estampa e calçado. Editor novo, com abas e prévia nas 4 direções.

### Animações de contexto

- Telas dos monitores, RGB do PC gamer e do teclado, vapor do café, peixes do aquário, ponteiros do
  relógio, neon, plantas perto do split, árvores e nuvens na vista das janelas. São trocas de
  quadros prontos, pausadas fora da tela e com a aba oculta.
- Opção **"Reduzir animações do cenário"** nas configurações (por padrão segue a preferência de
  movimento reduzido do sistema).

### Correções desta versão

- Zoom com a roda do mouse: um passo dado durante a transição não é mais ignorado.
- Gravata com a cor igual à da roupa não some mais (ela escurece ou clareia um tom).
- Escritório pequeno em tela grande: as árvores cobrem toda a área visível, em vez de sobrar só grama.

Detalhes técnicos, guias por fase e problemas conhecidos: [docs/visual-v2/PROGRESS.md](docs/visual-v2/PROGRESS.md).

## 1.0.0 a 1.0.8

Primeiras versões: escritório virtual com vídeo por proximidade, Mapmaker, Build Tool, painel do
ADM, notas de reunião, rádio, agenda e apps de desktop. O histórico está nas notas de cada
[release](https://github.com/marcelolucas11/office-imp/releases).
