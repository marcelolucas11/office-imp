// SPDX-License-Identifier: AGPL-3.0-only
// Formato do mapa do escritório. Estrutura inspirada no Tiled (camadas de
// tiles + grupos de objetos), com tiles de 32×32.

export const TILE = 32;
export const MAP_FORMAT_VERSION = 1;
export const MAX_MAP_SIZE = 300;

export const Floor = {
  None: 0,
  Wood: 1,
  WoodDark: 2,
  CarpetDark: 3,
  CarpetGold: 4,
  Tile: 5,
  Concrete: 6,
  Grass: 7,
  Kitchen: 8,
  Stage: 9,
  Corridor: 10,
  // visual v2 (Fase B): ids novos sempre no fim; os antigos não mudam de significado
  Porcelain: 11,
  BurntCement: 12,
  Herringbone: 13,
  CarpetPattern: 14,
  SyntheticGrass: 15,
} as const;

export const FLOOR_LABEL: Record<number, string> = {
  1: 'Madeira',
  2: 'Madeira escura',
  3: 'Carpete grafite',
  4: 'Carpete dourado',
  5: 'Piso claro',
  6: 'Concreto',
  7: 'Grama',
  8: 'Copa (xadrez)',
  9: 'Palco',
  10: 'Corredor',
  11: 'Porcelanato',
  12: 'Cimento queimado',
  13: 'Madeira espinha de peixe',
  14: 'Carpete com padrão',
  15: 'Grama sintética',
};

export const Wall = {
  None: 0,
  Wall: 1,
  /** Janela: adota o acabamento da parede vizinha (lisa, tijolo, madeira…). */
  Window: 2,
  Dark: 3,
  // visual v2 (Fase B)
  Plain: 4,
  Brick: 5,
  WoodPanel: 6,
  /** Divisória de vidro: só o desenho muda; bloqueia a passagem como qualquer parede. */
  Glass: 7,
} as const;

export const WALL_LABEL: Record<number, string> = {
  1: 'Parede',
  2: 'Janela',
  3: 'Parede escura',
  4: 'Parede lisa clara',
  5: 'Tijolo aparente',
  6: 'Painel de madeira',
  7: 'Divisória de vidro',
};

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type InteractKind = 'whiteboard' | 'website' | 'tv' | 'poster' | 'game' | 'note';
export type ObjectCategory = 'structure' | 'furniture' | 'decor' | 'interactive';
/** Grupo do objeto na paleta do Mapmaker (subdivisão das categorias, que ficaram longas no visual v2). */
export type ObjectGroup = 'interactive' | 'structure' | 'desks' | 'seating' | 'furniture' | 'deskitems' | 'appliances' | 'wall' | 'plants' | 'decor';
/** Grupos na ordem em que aparecem na paleta. */
export const OBJECT_GROUPS: ObjectGroup[] = ['interactive', 'structure', 'desks', 'seating', 'furniture', 'deskitems', 'appliances', 'wall', 'plants', 'decor'];

/** Variante de cor de um objeto (visual v2). */
export interface ObjectColor {
  /** Identificador gravado no mapa (`MapObject.color`). */
  id: string;
  label: string;
  /** Cor principal da variante; o desenho deriva os outros tons dela. */
  hex: string;
}

export interface ObjectDef {
  type: string;
  label: string;
  w: number;
  h: number;
  solid: boolean;
  category: ObjectCategory;
  interact?: InteractKind;
  /** Renderizado acima dos avatares (camada "acima do avatar"). */
  above?: boolean;
  /** Pode ter largura/altura por instância. */
  resizable?: boolean;
  /** Sprite mais alto que o footprint (em tiles a mais para cima). */
  tall?: number;
  /** Variantes de cor. A primeira é a padrão (usada quando o objeto do mapa não tem `color`). */
  colors?: ObjectColor[];
  /** Grupo na paleta do Mapmaker. Sem ele, o grupo sai da categoria (`objectGroup`). */
  group?: ObjectGroup;
  /**
   * Mesa de trabalho: pode ser atribuída a um funcionário, tem assento, área de conversa,
   * zona de decoração e setup (`MapObject.setup`). Use `isDesk`/`mapDesks`, nunca `type === 'desk'`.
   */
  desk?: boolean;
  /** Assento padrão da mesa, relativo ao canto do objeto (padrão: `{ x: 0, y: h }`, logo abaixo do canto esquerdo). */
  seat?: Point;
  /**
   * Blocos sólidos de um footprint que não é retangular: uma string por linha, `#` = sólido,
   * qualquer outro caractere = livre (ex.: mesa em L). Com `dir: 'right'` o desenho e a máscara
   * são espelhados. Sem `cells`, o retângulo inteiro bloqueia.
   */
  cells?: string[];
  /** Texto curto desenhado no próprio sprite (`props.text`), como no letreiro neon. */
  text?: { max: number; default: string };
}

/** Setup de uma mesa de trabalho: o que fica em cima do tampo (visual v2). */
export interface DeskSetup {
  /** Identificador gravado no mapa (`MapObject.setup`). */
  id: string;
  label: string;
}

/** Setups disponíveis para qualquer mesa de trabalho. O primeiro é o padrão (mapas antigos, mesa sem `setup`). */
export const DESK_SETUPS: DeskSetup[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'gamer', label: 'PC gamer' },
  { id: 'dual', label: 'Dois monitores' },
  { id: 'laptop_silver', label: 'Notebook prata' },
  { id: 'aio', label: 'All-in-one' },
  { id: 'laptop', label: 'Notebook' },
  { id: 'none', label: 'Vazio' },
];
export const DEFAULT_DESK_SETUP = DESK_SETUPS[0].id;

/** Cores de estofado (cadeiras, sofás). A primeira é a padrão. */
const UPHOLSTERY: ObjectColor[] = [
  { id: 'graphite', label: 'Grafite', hex: '#434957' },
  { id: 'blue', label: 'Azul', hex: '#3d5a8a' },
  { id: 'green', label: 'Verde', hex: '#3f7557' },
  { id: 'wine', label: 'Vinho', hex: '#8a3d45' },
  { id: 'sand', label: 'Areia', hex: '#b39a78' },
];

/** Tampos de mesa. O carvalho é a cor da mesa de antes do visual v2. */
const TOPS: ObjectColor[] = [
  { id: 'oak', label: 'Carvalho', hex: '#a06e45' },
  { id: 'maple', label: 'Madeira clara', hex: '#c9a070' },
  { id: 'walnut', label: 'Nogueira', hex: '#6f4a35' },
  { id: 'white', label: 'Branco', hex: '#d8d5cd' },
  { id: 'black', label: 'Preto', hex: '#3a3b43' },
];

const DARK_WOODS: ObjectColor[] = [
  { id: 'walnut', label: 'Nogueira escura', hex: '#5c4130' },
  { id: 'mahogany', label: 'Mogno', hex: '#6e3528' },
  { id: 'ebony', label: 'Ébano', hex: '#3b3033' },
  { id: 'cherry', label: 'Cerejeira', hex: '#7d4c36' },
];

const GLASS_TINTS: ObjectColor[] = [
  { id: 'clear', label: 'Vidro azulado', hex: '#a9d3e6' },
  { id: 'smoke', label: 'Vidro fumê', hex: '#7f8a97' },
  { id: 'green', label: 'Vidro verde', hex: '#a3d4bd' },
];

/** Cores de destaque (mesa e cadeira gamer, objetos coloridos). */
const ACCENTS: ObjectColor[] = [
  { id: 'red', label: 'Vermelho', hex: '#c8383c' },
  { id: 'blue', label: 'Azul', hex: '#3672c9' },
  { id: 'green', label: 'Verde', hex: '#3aa45c' },
  { id: 'purple', label: 'Roxo', hex: '#7e52c8' },
  { id: 'pink', label: 'Rosa', hex: '#d2589a' },
];

const LEATHERS: ObjectColor[] = [
  { id: 'black', label: 'Couro preto', hex: '#33313a' },
  { id: 'brown', label: 'Couro marrom', hex: '#5c3b2b' },
  { id: 'caramel', label: 'Couro caramelo', hex: '#9c6338' },
  { id: 'cream', label: 'Couro creme', hex: '#cbbfa8' },
  { id: 'wine', label: 'Couro vinho', hex: '#702f37' },
];

const BLACK_WHITE: ObjectColor[] = [
  { id: 'black', label: 'Preto', hex: '#2a2b30' },
  { id: 'white', label: 'Branco', hex: '#dfe1e6' },
];

const POTS: ObjectColor[] = [
  { id: 'terracotta', label: 'Vaso de barro', hex: '#a85f3a' },
  { id: 'white', label: 'Vaso branco', hex: '#e8e3d9' },
  { id: 'black', label: 'Vaso preto', hex: '#34353c' },
  { id: 'blue', label: 'Vaso azul', hex: '#4a6fa5' },
];

/** A lista de vasos com outra variante na frente (a padrão do tipo). */
const potsWith = (first: string): ObjectColor[] => [...POTS.filter((c) => c.id === first), ...POTS.filter((c) => c.id !== first)];

/** Molduras (quadro decorativo, jardim vertical). A de madeira é a padrão. */
const FRAMES: ObjectColor[] = [
  { id: 'wood', label: 'Moldura de madeira', hex: '#8f6340' },
  { id: 'black', label: 'Moldura preta', hex: '#2a2b30' },
  { id: 'white', label: 'Moldura branca', hex: '#e9ecf2' },
  { id: 'gold', label: 'Moldura dourada', hex: '#d7b870' },
];

/** Madeira de móveis escuros (estante, púlpito). A nogueira escura é a cor de antes do visual v2. */
const CABINET_WOODS: ObjectColor[] = [
  { id: 'walnut', label: 'Nogueira escura', hex: '#5c4130' },
  { id: 'oak', label: 'Carvalho', hex: '#a06e45' },
  { id: 'white', label: 'Branco', hex: '#d8d5cd' },
  { id: 'black', label: 'Preto', hex: '#3a3b43' },
];

/** Tecido de tapete. O grafite com borda dourada é o tapete de antes do visual v2. */
const RUGS: ObjectColor[] = [
  { id: 'graphite', label: 'Grafite com dourado', hex: '#2b2c35' },
  { id: 'blue', label: 'Azul', hex: '#34507a' },
  { id: 'wine', label: 'Vinho', hex: '#6e2f3a' },
  { id: 'green', label: 'Verde', hex: '#335c47' },
  { id: 'sand', label: 'Areia', hex: '#c2ad86' },
];

const defs: ObjectDef[] = [
  // ----- mesas de trabalho (C1) -----
  { type: 'desk', label: 'Mesa de trabalho', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: TOPS },
  { type: 'desk_wide', label: 'Mesa de trabalho grande (3 blocos)', w: 3, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, seat: { x: 1, y: 1 }, colors: TOPS },
  { type: 'desk_l', label: 'Mesa em L (direção → espelha)', w: 3, h: 2, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, seat: { x: 1, y: 1 }, cells: ['###', '#..'], colors: TOPS },
  { type: 'desk_standing', label: 'Mesa de pé (standing desk)', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: TOPS },
  { type: 'desk_glass', label: 'Mesa de vidro', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: GLASS_TINTS },
  { type: 'desk_dark', label: 'Mesa executiva de madeira escura', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: DARK_WOODS },
  { type: 'desk_gamer', label: 'Mesa gamer', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: ACCENTS },
  { type: 'desk_bench', label: 'Bancada compartilhada (um módulo por pessoa; encoste um no outro)', w: 2, h: 1, solid: true, category: 'structure', group: 'desks', tall: 1, desk: true, colors: TOPS },
  // ----- assentos (C1) -----
  { type: 'chair', label: 'Cadeira de escritório', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', tall: 1, colors: UPHOLSTERY },
  { type: 'chair_gamer', label: 'Cadeira gamer', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', tall: 1, colors: ACCENTS },
  { type: 'chair_exec', label: 'Cadeira executiva de couro', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', tall: 1, colors: LEATHERS },
  { type: 'stool', label: 'Banqueta', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', colors: UPHOLSTERY },
  { type: 'armchair', label: 'Poltrona', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', colors: UPHOLSTERY },
  { type: 'pouf', label: 'Pufe', w: 1, h: 1, solid: false, category: 'furniture', group: 'seating', colors: UPHOLSTERY },
  { type: 'sofa', label: 'Sofá', w: 2, h: 1, solid: true, category: 'furniture', group: 'seating', colors: UPHOLSTERY },
  // ----- mesas e móveis (redesenhados na C3) -----
  { type: 'table', label: 'Mesa de reunião', w: 4, h: 2, solid: true, category: 'furniture', resizable: true, colors: TOPS },
  { type: 'table_round', label: 'Mesa redonda', w: 1, h: 1, solid: true, category: 'furniture', colors: TOPS },
  { type: 'counter', label: 'Balcão', w: 2, h: 1, solid: true, category: 'furniture', resizable: true, colors: [
    { id: 'graphite', label: 'Grafite', hex: '#46423e' },
    { id: 'wood', label: 'Madeira', hex: '#a06e45' },
    { id: 'white', label: 'Branco', hex: '#d8d5cd' },
    { id: 'navy', label: 'Azul-marinho', hex: '#2f3f5c' },
  ] },
  { type: 'bookshelf', label: 'Estante', w: 1, h: 1, solid: true, category: 'furniture', tall: 1, colors: CABINET_WOODS },
  { type: 'cabinet', label: 'Armário (gaveteiro)', w: 1, h: 1, solid: true, category: 'furniture', colors: [
    { id: 'graphite', label: 'Grafite', hex: '#57534e' },
    { id: 'white', label: 'Branco', hex: '#d9dce0' },
    { id: 'wood', label: 'Madeira', hex: '#a06e45' },
    { id: 'blue', label: 'Azul', hex: '#3d5a8a' },
  ] },
  // ----- copa e equipamentos -----
  { type: 'coffee', label: 'Máquina de café', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'black', label: 'Preta', hex: '#2a2b30' },
    { id: 'steel', label: 'Inox', hex: '#9da2aa' },
    { id: 'white', label: 'Branca', hex: '#d9dce0' },
  ] },
  { type: 'cooler', label: 'Bebedouro', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'white', label: 'Branco', hex: '#e3e5e9' },
    { id: 'graphite', label: 'Grafite', hex: '#4a4d57' },
  ] },
  { type: 'fridge', label: 'Geladeira', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'steel', label: 'Inox', hex: '#c3cad3' },
    { id: 'white', label: 'Branca', hex: '#e6e8ec' },
    { id: 'black', label: 'Preta', hex: '#34353c' },
    { id: 'red', label: 'Vermelha retrô', hex: '#c8383c' },
  ] },
  // ----- plantas (C3): `plant` e `plant_small` são as de antes do visual v2, redesenhadas -----
  { type: 'plant', label: 'Planta de folhagem', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: POTS },
  { type: 'plant_small', label: 'Vaso pequeno', w: 1, h: 1, solid: false, category: 'decor', group: 'plants', colors: POTS },
  { type: 'monstera', label: 'Costela-de-adão', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: potsWith('white') },
  { type: 'snake_plant', label: 'Espada-de-são-jorge', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: potsWith('black') },
  { type: 'cactus', label: 'Cacto grande (mandacaru)', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: POTS },
  { type: 'succulent_bowl', label: 'Suculentas em vaso médio', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', colors: potsWith('white') },
  { type: 'palm', label: 'Palmeira', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: [{ id: 'basket', label: 'Cesto de palha', hex: '#b8925a' }, ...POTS] },
  { type: 'tall_vase', label: 'Vaso alto com plumas', w: 1, h: 1, solid: true, category: 'decor', group: 'plants', tall: 1, colors: potsWith('white') },
  { type: 'hanging_fern', label: 'Samambaia pendurada (parede)', w: 1, h: 1, solid: false, category: 'decor', group: 'plants', colors: [
    { id: 'macrame', label: 'Macramê', hex: '#e6dcc6' },
    { id: 'terracotta', label: 'Vaso de barro', hex: '#a85f3a' },
    { id: 'black', label: 'Vaso preto', hex: '#34353c' },
  ] },
  { type: 'wall_garden', label: 'Planta de parede (jardim vertical)', w: 2, h: 1, solid: false, category: 'decor', group: 'plants', colors: FRAMES.slice(0, 3) },
  // ----- decoração -----
  { type: 'lamp', label: 'Luminária de chão', w: 1, h: 1, solid: false, category: 'decor', tall: 1, colors: [
    { id: 'cream', label: 'Cúpula creme', hex: '#f1e2b8' },
    { id: 'white', label: 'Cúpula branca', hex: '#eef0f3' },
    { id: 'black', label: 'Cúpula preta', hex: '#2f3036' },
    { id: 'gold', label: 'Cúpula dourada', hex: '#d7b870' },
  ] },
  { type: 'frame', label: 'Quadro decorativo', w: 1, h: 1, solid: false, category: 'decor', group: 'wall', colors: FRAMES },
  { type: 'photo', label: 'Porta-retrato', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [
    { id: 'wood', label: 'Moldura de madeira', hex: '#8f6340' },
    { id: 'black', label: 'Moldura preta', hex: '#2a2b30' },
    { id: 'white', label: 'Moldura branca', hex: '#e9ecf2' },
    { id: 'gold', label: 'Moldura dourada', hex: '#d7b870' },
  ] },
  { type: 'trophy', label: 'Troféu', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [
    { id: 'gold', label: 'Ouro', hex: '#d7b870' },
    { id: 'silver', label: 'Prata', hex: '#b8bcc4' },
    { id: 'bronze', label: 'Bronze', hex: '#b5774a' },
  ] },
  { type: 'rug', label: 'Tapete', w: 3, h: 2, solid: false, category: 'decor', resizable: true, colors: RUGS },
  { type: 'rug_logo', label: 'Tapete com logo', w: 4, h: 2, solid: false, category: 'decor', colors: RUGS },
  { type: 'podium', label: 'Púlpito', w: 1, h: 1, solid: false, category: 'decor', colors: CABINET_WOODS },
  { type: 'door', label: 'Porta', w: 1, h: 1, solid: false, category: 'structure' },
  { type: 'portal', label: 'Portal', w: 1, h: 1, solid: false, category: 'structure' },
  // ----- interativos: só o desenho mudou na C3; `interact` e `props` continuam iguais -----
  { type: 'whiteboard', label: 'Quadro branco', w: 2, h: 1, solid: true, category: 'interactive', interact: 'whiteboard', tall: 1 },
  { type: 'tv', label: 'TV (vídeo do YouTube)', w: 2, h: 1, solid: true, category: 'interactive', interact: 'tv', tall: 1 },
  { type: 'kiosk', label: 'Site incorporado', w: 1, h: 1, solid: true, category: 'interactive', interact: 'website', tall: 1 },
  { type: 'arcade', label: 'Jogo', w: 1, h: 1, solid: true, category: 'interactive', interact: 'game', tall: 1 },
  { type: 'poster', label: 'Pôster / imagem', w: 1, h: 1, solid: false, category: 'interactive', interact: 'poster' },
  { type: 'note', label: 'Nota / placa', w: 1, h: 1, solid: false, category: 'interactive', interact: 'note' },
  // ----- objetos de mesa (C2): pequenos, para ficar em cima do tampo -----
  { type: 'keyboard', label: 'Teclado mecânico', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [
    { id: 'rgb', label: 'Preto com RGB', hex: '#2a2b30' },
    { id: 'white', label: 'Branco', hex: '#dfe1e6' },
    { id: 'pink', label: 'Rosa', hex: '#e3a4c0' },
  ] },
  { type: 'mousepad', label: 'Mousepad grande', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [{ id: 'black', label: 'Preto', hex: '#2a2b30' }, ...ACCENTS] },
  { type: 'mouse', label: 'Mouse', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: BLACK_WHITE },
  { type: 'mug', label: 'Caneca', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [{ id: 'white', label: 'Branca', hex: '#e9ecf2' }, { id: 'black', label: 'Preta', hex: '#2a2b30' }, { id: 'gold', label: 'Dourada', hex: '#d7b870' }, ...ACCENTS.slice(0, 3)] },
  { type: 'bottle', label: 'Garrafa', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [{ id: 'blue', label: 'Azul', hex: '#4a86c9' }, { id: 'green', label: 'Verde', hex: '#3aa45c' }, { id: 'pink', label: 'Rosa', hex: '#d2589a' }, { id: 'steel', label: 'Inox', hex: '#9da2aa' }, { id: 'black', label: 'Preta', hex: '#2a2b30' }] },
  { type: 'headphones', label: 'Fone de ouvido', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [...BLACK_WHITE, ...ACCENTS.slice(0, 2)] },
  { type: 'desk_lamp', label: 'Luminária de mesa', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [...BLACK_WHITE, { id: 'gold', label: 'Dourada', hex: '#d7b870' }, ...ACCENTS.slice(0, 3)] },
  { type: 'postits', label: 'Post-its', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [
    { id: 'yellow', label: 'Amarelo', hex: '#f2d95c' },
    { id: 'pink', label: 'Rosa', hex: '#f08fb4' },
    { id: 'green', label: 'Verde', hex: '#9fd67a' },
    { id: 'blue', label: 'Azul', hex: '#86c5ea' },
  ] },
  { type: 'books', label: 'Livros', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: [
    { id: 'classic', label: 'Coloridos', hex: '#b23a3a' },
    { id: 'sober', label: 'Sóbrios', hex: '#4a5568' },
    { id: 'pastel', label: 'Pastel', hex: '#e3a4c0' },
  ] },
  { type: 'succulent', label: 'Suculenta', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: POTS },
  { type: 'cactus_small', label: 'Cacto de mesa', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', colors: POTS },
  // ----- extras (C2) -----
  { type: 'espresso', label: 'Cafeteira expresso com moedor', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'steel', label: 'Inox', hex: '#9da2aa' },
    { id: 'black', label: 'Preta', hex: '#34353c' },
    { id: 'red', label: 'Vermelha', hex: '#b8363a' },
    { id: 'cream', label: 'Creme', hex: '#d9cfb8' },
  ] },
  { type: 'podcast_mic', label: 'Microfone de podcast com braço articulado', w: 1, h: 1, solid: false, category: 'decor', group: 'deskitems', tall: 1, colors: BLACK_WHITE },
  { type: 'ring_light', label: 'Ring light no tripé', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'warm', label: 'Luz quente', hex: '#f6e3a8' },
    { id: 'cool', label: 'Luz fria', hex: '#dcebf7' },
  ] },
  { type: 'printer', label: 'Impressora multifuncional', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'white', label: 'Branca', hex: '#d9dce0' },
    { id: 'graphite', label: 'Grafite', hex: '#4a4d57' },
  ] },
  { type: 'snack_machine', label: 'Máquina de snacks', w: 1, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [...ACCENTS.slice(0, 3), { id: 'black', label: 'Preta', hex: '#34353c' }] },
  { type: 'aquarium', label: 'Aquário com peixes', w: 2, h: 1, solid: true, category: 'decor', group: 'appliances', tall: 1, colors: [
    { id: 'black', label: 'Móvel preto', hex: '#34353c' },
    { id: 'wood', label: 'Móvel de madeira', hex: '#a06e45' },
    { id: 'white', label: 'Móvel branco', hex: '#d8d5cd' },
  ] },
  { type: 'corkboard', label: 'Quadro de cortiça (parede)', w: 2, h: 1, solid: false, category: 'decor', group: 'wall', colors: [
    { id: 'wood', label: 'Moldura de madeira', hex: '#8f6340' },
    { id: 'dark', label: 'Moldura escura', hex: '#3a261c' },
    { id: 'white', label: 'Moldura branca', hex: '#e9ecf2' },
  ] },
  { type: 'wall_clock', label: 'Relógio de parede', w: 1, h: 1, solid: false, category: 'decor', group: 'wall', colors: [
    { id: 'black', label: 'Preto', hex: '#2a2b30' },
    { id: 'white', label: 'Branco', hex: '#e9ecf2' },
    { id: 'gold', label: 'Dourado', hex: '#d7b870' },
    { id: 'wood', label: 'Madeira', hex: '#8f6340' },
  ] },
  { type: 'neon', label: 'Letreiro neon (texto editável)', w: 2, h: 1, solid: false, category: 'decor', group: 'wall', resizable: true, text: { max: 24, default: 'IMPERA' }, colors: [
    { id: 'pink', label: 'Rosa', hex: '#ff5fa8' },
    { id: 'cyan', label: 'Ciano', hex: '#4fd8f0' },
    { id: 'yellow', label: 'Amarelo', hex: '#ffd84a' },
    { id: 'green', label: 'Verde', hex: '#5ee37f' },
    { id: 'purple', label: 'Roxo', hex: '#b07cff' },
    { id: 'orange', label: 'Laranja', hex: '#ff8a3c' },
    { id: 'white', label: 'Branco', hex: '#f4f6fb' },
  ] },
  { type: 'split_ac', label: 'Ar-condicionado split (parede)', w: 1, h: 1, solid: false, category: 'decor', group: 'wall', colors: [
    { id: 'white', label: 'Branco', hex: '#e9ecf2' },
    { id: 'graphite', label: 'Grafite', hex: '#4a4d57' },
  ] },
];

export const OBJECT_DEFS: Record<string, ObjectDef> = Object.fromEntries(defs.map((d) => [d.type, d]));
export const OBJECT_TYPES = defs.map((d) => d.type);
/** Objetos que um funcionário pode colocar na própria mesa (os primeiros são os de antes do visual v2). */
export const DESK_DECOR_TYPES = [
  'plant_small',
  'plant',
  'lamp',
  'frame',
  'photo',
  'trophy',
  'note',
  'poster',
  // objetos pequenos de mesa (visual v2, Fase C2)
  'keyboard',
  'mousepad',
  'mouse',
  'mug',
  'bottle',
  'headphones',
  'desk_lamp',
  'postits',
  'books',
  'succulent',
  'cactus_small',
  'podcast_mic',
];
export const MAX_DESK_DECOR = 8;

export interface MapObject {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Direção (cadeiras, sofás). */
  dir?: Dir;
  /** Id da variante de cor (`ObjectDef.colors`). Ausente = cor padrão do tipo. */
  color?: string;
  /** Id do setup da mesa (`DESK_SETUPS`), só em mesas de trabalho. Ausente = setup padrão (monitor). */
  setup?: string;
  props?: Record<string, any>;
  /** Decoração pertencente a uma mesa (colocada pelo dono da mesa). */
  ownerDeskId?: string;
}

export type AreaKind = 'private' | 'spotlight';

export interface MapArea {
  id: string;
  name: string;
  kind: AreaKind;
  /** Somente equipe: convidados não entram. */
  staffOnly: boolean;
  /** Sala dos sócios (informativo). */
  partners?: boolean;
  /** Sala de reunião: permite notas de reunião. */
  meeting?: boolean;
  /** Área de conversa de uma mesa de funcionário (gerada automaticamente a partir da mesa). */
  desk?: boolean;
  /** Mesa dona da área (quando `desk`). */
  deskId?: string;
  capacity: number;
  rects: Rect[];
}

export interface MapPortal {
  id: string;
  x: number;
  y: number;
  toX: number;
  toY: number;
}

export interface GeneratorMeta {
  version: number;
  corridorY: number;
  topX: number;
  bottomX: number;
  endX: number;
  roomHeight: number;
  counters: Record<string, number>;
}

export interface OfficeMap {
  version: number;
  width: number;
  height: number;
  tileSize: number;
  layers: { floor: number[]; walls: number[] };
  objects: MapObject[];
  areas: MapArea[];
  spawns: Point[];
  meta?: { gen?: GeneratorMeta };
}

export function emptyMap(width: number, height: number): OfficeMap {
  return {
    version: MAP_FORMAT_VERSION,
    width,
    height,
    tileSize: TILE,
    layers: { floor: new Array(width * height).fill(0), walls: new Array(width * height).fill(0) },
    objects: [],
    areas: [],
    spawns: [],
  };
}

export function idx(map: { width: number }, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function objSize(o: MapObject): { w: number; h: number } {
  const def = OBJECT_DEFS[o.type];
  return { w: o.w ?? def?.w ?? 1, h: o.h ?? def?.h ?? 1 };
}

/** Grupo do tipo na paleta do Mapmaker. */
export function objectGroup(type: string): ObjectGroup {
  const def = OBJECT_DEFS[type];
  return def?.group ?? def?.category ?? 'decor';
}

/** O tipo é uma mesa de trabalho (atribuível, com assento, área de conversa e setup)? */
export function isDeskType(type: string): boolean {
  return Boolean(OBJECT_DEFS[type]?.desk);
}

/** O objeto é uma mesa de trabalho? */
export function isDesk(o: Pick<MapObject, 'type'>): boolean {
  return isDeskType(o.type);
}

/** Tipos de mesa de trabalho do catálogo, na ordem da paleta. */
export const DESK_TYPES = defs.filter((d) => d.desk).map((d) => d.type);

/** O footprint do objeto é espelhado? Só tipos com `cells` (mesa em L), quando `dir` é `right`. */
export function objMirrored(o: Pick<MapObject, 'type' | 'dir'>): boolean {
  return Boolean(OBJECT_DEFS[o.type]?.cells) && o.dir === 'right';
}

/**
 * O bloco (dx, dy) do footprint bloqueia a passagem? Fora do footprint ou em objeto não sólido,
 * não. Tipos com `cells` (mesa em L) só bloqueiam os blocos marcados.
 */
export function objSolidAt(o: MapObject, dx: number, dy: number): boolean {
  const def = OBJECT_DEFS[o.type];
  if (!def?.solid) return false;
  const { w, h } = objSize(o);
  if (dx < 0 || dy < 0 || dx >= w || dy >= h) return false;
  if (!def.cells) return true;
  const row = def.cells[dy] ?? '';
  return row[objMirrored(o) ? w - 1 - dx : dx] === '#';
}

/**
 * Linhas do footprint que contam para a ordem de desenho (profundidade): as de cima que são
 * inteiramente sólidas. Num objeto comum é a altura toda; na mesa em L é 1 (quem senta no vão
 * fica na frente do tampo de cima).
 */
export function objDepthRows(o: MapObject): number {
  const def = OBJECT_DEFS[o.type];
  const { h } = objSize(o);
  if (!def?.cells) return h;
  let rows = 0;
  for (const row of def.cells.slice(0, h)) {
    if ([...row].some((c) => c !== '#')) break;
    rows++;
  }
  return Math.max(1, rows);
}

/** Setups que o tipo aceita: todos os de `DESK_SETUPS` nas mesas de trabalho, nenhum nos outros tipos. */
export function deskSetups(type: string): DeskSetup[] {
  return isDeskType(type) ? DESK_SETUPS : [];
}

/**
 * Setup em uso por uma mesa: o que ela pede, se existir; senão o padrão (monitor).
 * `null` quando o objeto não é uma mesa de trabalho.
 */
export function objSetup(o: Pick<MapObject, 'type' | 'setup'>): DeskSetup | null {
  const setups = deskSetups(o.type);
  if (!setups.length) return null;
  return setups.find((s) => s.id === o.setup) ?? setups[0];
}

/** Erro do campo `setup` de um objeto, ou `null` se estiver certo (ausente é sempre válido). */
export function objSetupError(o: { type: string; setup?: unknown }): string | null {
  if (o.setup === undefined) return null;
  if (typeof o.setup !== 'string') return 'setup de mesa inválido';
  if (!deskSetups(o.type).some((s) => s.id === o.setup)) return `setup desconhecido para ${o.type}: ${o.setup.slice(0, 40)}`;
  return null;
}

/**
 * Texto desenhado no sprite de um tipo com `text` (letreiro neon): `props.text` sem quebras de
 * linha e cortado no limite, ou o texto padrão do tipo. `null` se o tipo não desenha texto.
 */
export function objText(o: Pick<MapObject, 'type' | 'props'>): string | null {
  const spec = OBJECT_DEFS[o.type]?.text;
  if (!spec) return null;
  const raw = typeof o.props?.text === 'string' ? o.props.text.replace(/\s+/g, ' ').trim() : '';
  return (raw || spec.default).slice(0, spec.max);
}

/** Erro do texto de um tipo com `text`, ou `null` (ausente é válido: usa o texto padrão). */
export function objTextError(o: { type: string; props?: any }): string | null {
  const spec = OBJECT_DEFS[o.type]?.text;
  const text = o.props?.text;
  if (!spec || text === undefined) return null;
  if (typeof text !== 'string') return 'texto de objeto inválido';
  if (text.length > spec.max) return `texto longo demais para ${o.type} (máximo ${spec.max})`;
  return null;
}

/** Variantes de cor de um tipo de objeto (lista vazia se o tipo não tem cores). */
export function objectColors(type: string): ObjectColor[] {
  return OBJECT_DEFS[type]?.colors ?? [];
}

/**
 * Variante de cor em uso por um objeto: a que ele pede, se existir no tipo; senão a padrão
 * (a primeira). `null` quando o tipo não tem variantes de cor.
 */
export function objColor(o: Pick<MapObject, 'type' | 'color'>): ObjectColor | null {
  const colors = OBJECT_DEFS[o.type]?.colors;
  if (!colors?.length) return null;
  return colors.find((c) => c.id === o.color) ?? colors[0];
}

/** Erro do campo `color` de um objeto, ou `null` se estiver certo (ausente é sempre válido). */
export function objColorError(o: { type: string; color?: unknown }): string | null {
  if (o.color === undefined) return null;
  if (typeof o.color !== 'string') return 'cor de objeto inválida';
  if (!objectColors(o.type).some((c) => c.id === o.color)) return `cor desconhecida para ${o.type}: ${o.color.slice(0, 40)}`;
  return null;
}

/**
 * Remove o `color` que não existe na definição do tipo (o objeto volta para a cor padrão).
 * Não altera o mapa recebido: devolve o mesmo objeto se não houver nada a corrigir.
 * Serve para mapas gravados antes de uma mudança no catálogo; o que vem do cliente é
 * recusado por `validateMapShape`.
 */
export function normalizeObjectColors(map: OfficeMap): OfficeMap {
  if (!map.objects.some((o) => objColorError(o))) return map;
  return {
    ...map,
    objects: map.objects.map((o) => {
      if (!objColorError(o)) return o;
      const { color: _drop, ...rest } = o;
      return rest;
    }),
  };
}

/**
 * Como `normalizeObjectColors`, para cor e setup: tira o `color` e o `setup` que não existem
 * mais no catálogo (o objeto volta ao padrão). Devolve o mesmo mapa se não houver o que corrigir.
 */
export function normalizeObjectVariants(map: OfficeMap): OfficeMap {
  const fixed = normalizeObjectColors(map);
  if (!fixed.objects.some((o) => objSetupError(o))) return fixed;
  return {
    ...fixed,
    objects: fixed.objects.map((o) => {
      if (!objSetupError(o)) return o;
      const { setup: _drop, ...rest } = o;
      return rest;
    }),
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Redimensiona o mapa mantendo as coordenadas existentes (cresce para leste/sul). */
export function resizeMap(map: OfficeMap, width: number, height: number): void {
  if (width === map.width && height === map.height) return;
  const floor = new Array(width * height).fill(0);
  const walls = new Array(width * height).fill(0);
  const w = Math.min(width, map.width);
  const h = Math.min(height, map.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      floor[y * width + x] = map.layers.floor[y * map.width + x];
      walls[y * width + x] = map.layers.walls[y * map.width + x];
    }
  }
  map.layers.floor = floor;
  map.layers.walls = walls;
  map.width = width;
  map.height = height;
}

/** Grade de colisão: 1 = bloqueado. */
export function buildCollision(map: OfficeMap): Uint8Array {
  const grid = new Uint8Array(map.width * map.height);
  for (let i = 0; i < grid.length; i++) {
    if (map.layers.walls[i] !== 0 || map.layers.floor[i] === 0) grid[i] = 1;
  }
  for (const o of map.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def?.solid) continue;
    const { w, h } = objSize(o);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (def.cells && !objSolidAt(o, dx, dy)) continue;
        const x = o.x + dx;
        const y = o.y + dy;
        if (inBounds(map, x, y)) grid[y * map.width + x] = 1;
      }
    }
  }
  return grid;
}

export function isBlocked(map: OfficeMap, grid: Uint8Array, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return grid[y * map.width + x] === 1;
}

/** Índice de áreas por tile: para cada tile, o índice da área (ou -1). */
export interface AreaIndex {
  privateAt: Int16Array;
  spotlightAt: Uint8Array;
}

export function buildAreaIndex(map: OfficeMap): AreaIndex {
  const privateAt = new Int16Array(map.width * map.height).fill(-1);
  const spotlightAt = new Uint8Array(map.width * map.height);
  map.areas.forEach((a, i) => {
    for (const r of a.rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (!inBounds(map, x, y)) continue;
          if (a.kind === 'private') privateAt[y * map.width + x] = i;
          else spotlightAt[y * map.width + x] = 1;
        }
      }
    }
  });
  return { privateAt, spotlightAt };
}

export function privateAreaAt(map: OfficeMap, index: AreaIndex, x: number, y: number): MapArea | null {
  if (!inBounds(map, x, y)) return null;
  const i = index.privateAt[y * map.width + x];
  return i >= 0 ? map.areas[i] : null;
}

export function isSpotlightAt(map: OfficeMap, index: AreaIndex, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  return index.spotlightAt[y * map.width + x] === 1;
}

export function areaCenter(area: MapArea): Point {
  const r = area.rects[0];
  if (!r) return { x: 0, y: 0 };
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** Mesas atribuíveis presentes no mapa: todo objeto cujo tipo tem `desk: true` (reta, em L, gamer…). */
export function mapDesks(map: OfficeMap): MapObject[] {
  return map.objects.filter(isDesk);
}

/** Assento padrão de uma mesa posta em (x, y): o `seat` do tipo, ou logo abaixo do canto esquerdo. */
export function defaultDeskSeat(desk: Pick<MapObject, 'type' | 'x' | 'y' | 'w' | 'h'>): Point {
  const def = OBJECT_DEFS[desk.type];
  const seat = def?.seat ?? { x: 0, y: objSize(desk as MapObject).h };
  return { x: desk.x + seat.x, y: desk.y + seat.y };
}

/**
 * Zona de decoração padrão de uma mesa nova: a linha do tampo e um bloco à direita. Na mesa em L
 * (footprint com `cells`) entra também a linha do retorno, que é tampo (o assento continua
 * protegido: o servidor não deixa pôr objeto nele).
 */
export function defaultDeskZone(desk: Pick<MapObject, 'type' | 'x' | 'y' | 'w' | 'h'>): Rect {
  const { w, h } = objSize(desk as MapObject);
  return { x: desk.x, y: desk.y, w: w + 1, h: OBJECT_DEFS[desk.type]?.cells ? h : 1 };
}

/** Zona de decoração de uma mesa (onde o dono pode colocar objetos). */
export function deskZone(desk: MapObject): Rect {
  const z = desk.props?.zone as Rect | undefined;
  if (z) return z;
  const { w, h } = objSize(desk);
  return { x: desk.x, y: desk.y, w: w + 1, h: h + 1 };
}

/** Tile onde a pessoa fica ao "ir para a mesa". */
export function deskSeat(desk: MapObject): Point {
  const s = desk.props?.seat as Point | undefined;
  return s ?? defaultDeskSeat(desk);
}

/** Prefixo dos ids das áreas de mesa, que são derivadas das mesas e nunca gravadas no mapa. */
export const DESK_AREA_PREFIX = 'desk:';
/** Lugares na área de uma mesa: a cadeira + 3 em volta. */
export const DESK_AREA_CAPACITY = 4;

export function isDerivedArea(a: MapArea): boolean {
  return a.id.startsWith(DESK_AREA_PREFIX);
}

/** Remove as áreas derivadas (antes de gravar ou editar o mapa). */
export function stripDerivedAreas(map: OfficeMap): OfficeMap {
  if (!map.areas.some(isDerivedArea)) return map;
  return { ...map, areas: map.areas.filter((a) => !isDerivedArea(a)) };
}

/**
 * Área de conversa de cada mesa: um quadrado de 2×2 tiles (4 lugares) que inclui a cadeira.
 * Quem chega na mesa entra numa conversa privada com quem estiver nesses 4 tiles.
 * Mesas dentro de salas privadas (sócios) não ganham área própria: a sala já cumpre esse papel.
 */
export function deskAreas(map: OfficeMap): MapArea[] {
  const base = map.areas.filter((a) => !isDerivedArea(a) && a.kind === 'private');
  const grid = buildCollision(map);
  const taken: Rect[] = base.flatMap((a) => a.rects);
  const out: MapArea[] = [];
  let n = 0;
  for (const desk of mapDesks(map)) {
    n++;
    const seat = deskSeat(desk);
    const custom = desk.props?.area as Rect | undefined;
    const candidates: Rect[] = custom
      ? [custom]
      : [
          { x: seat.x, y: seat.y, w: 2, h: 2 },
          { x: seat.x - 1, y: seat.y, w: 2, h: 2 },
          { x: seat.x, y: seat.y - 1, w: 2, h: 2 },
          { x: seat.x - 1, y: seat.y - 1, w: 2, h: 2 },
        ];
    let best: Rect | null = null;
    let bestScore = 1;
    for (const r of candidates) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > map.width || r.y + r.h > map.height) continue;
      if (taken.some((t) => rectsOverlap(t, r))) continue;
      let score = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y * map.width + x] === 0) score++;
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
      if (score === r.w * r.h) break;
    }
    if (!best) continue;
    taken.push(best);
    out.push({ id: `${DESK_AREA_PREFIX}${desk.id}`, name: `Mesa ${n}`, kind: 'private', staffOnly: false, desk: true, deskId: desk.id, capacity: DESK_AREA_CAPACITY, rects: [best] });
  }
  return out;
}

/** Mapa com as áreas das mesas recalculadas (usar depois de carregar o mapa). */
export function withDeskAreas(map: OfficeMap): OfficeMap {
  const clean = stripDerivedAreas(map);
  return { ...clean, areas: [...clean.areas, ...deskAreas(clean)] };
}

/** Junta tiles soltos em retângulos por linha (usado ao pintar áreas no Mapmaker). */
export function tilesToRects(tiles: Point[]): Rect[] {
  const byRow = new Map<number, number[]>();
  for (const t of tiles) {
    if (!byRow.has(t.y)) byRow.set(t.y, []);
    byRow.get(t.y)!.push(t.x);
  }
  const rects: Rect[] = [];
  for (const [y, xs] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(xs)].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const x = sorted[i];
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      rects.push({ x: start, y, w: prev - start + 1, h: 1 });
      start = x;
      prev = x;
    }
  }
  // mescla verticalmente retângulos idênticos em linhas consecutivas
  const merged: Rect[] = [];
  for (const r of rects) {
    const m = merged.find((o) => o.x === r.x && o.w === r.w && o.y + o.h === r.y);
    if (m) m.h += 1;
    else merged.push({ ...r });
  }
  return merged;
}

export function rectsToTiles(rects: Rect[]): Point[] {
  const out: Point[] = [];
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
  return out;
}

/** Validação estrutural básica de um mapa recebido do cliente. */
export function validateMapShape(m: any): string | null {
  if (!m || typeof m !== 'object') return 'mapa inválido';
  if (!Number.isInteger(m.width) || !Number.isInteger(m.height)) return 'dimensões inválidas';
  if (m.width < 5 || m.height < 5 || m.width > MAX_MAP_SIZE || m.height > MAX_MAP_SIZE) return 'tamanho fora dos limites';
  const n = m.width * m.height;
  if (!Array.isArray(m.layers?.floor) || m.layers.floor.length !== n) return 'camada de chão inválida';
  if (!Array.isArray(m.layers?.walls) || m.layers.walls.length !== n) return 'camada de paredes inválida';
  if (!Array.isArray(m.objects) || !Array.isArray(m.areas) || !Array.isArray(m.spawns)) return 'listas ausentes';
  if (m.objects.length > 5000) return 'objetos demais';
  const ids = new Set<string>();
  for (const o of m.objects) {
    if (typeof o?.id !== 'string' || typeof o?.type !== 'string') return 'objeto inválido';
    if (!OBJECT_DEFS[o.type]) return `tipo de objeto desconhecido: ${o.type}`;
    if (!Number.isInteger(o.x) || !Number.isInteger(o.y)) return 'posição de objeto inválida';
    const variantError = objColorError(o) ?? objSetupError(o) ?? objTextError(o);
    if (variantError) return variantError;
    if (ids.has(o.id)) return 'id de objeto duplicado';
    ids.add(o.id);
  }
  const areaIds = new Set<string>();
  for (const a of m.areas) {
    if (typeof a?.id !== 'string' || typeof a?.name !== 'string') return 'área inválida';
    if (a.kind !== 'private' && a.kind !== 'spotlight') return 'tipo de área inválido';
    if (!Array.isArray(a.rects)) return 'área sem retângulos';
    if (areaIds.has(a.id)) return 'id de área duplicado';
    areaIds.add(a.id);
  }
  if (m.spawns.length === 0) return 'o mapa precisa de pelo menos um ponto de entrada (spawn)';
  return null;
}
