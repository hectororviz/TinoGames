/** Catálogo de sprites del pack Pixel Adventure (juego + editor). */
import pinkUrl from '../../../assets/pink.png?url';
import appleUrl from '../../../assets/Apple.png?url';
import strawberryUrl from '../../../assets/Strawberry.png?url';
import tilesPaUrl from '../../../assets/tiles_pa.png?url';
import terrainPaUrl from '../../../assets/vendor_pa_terrain.png?url';
import vendorSpikeUrl from '../../../assets/vendor_pa_spike.png?url';
import pigWalkUrl from '../../../assets/pig_walk.png?url';
import bluebirdUrl from '../../../assets/bluebird_flying.png?url';
import sawUrl from '../../../assets/saw_on.png?url';
import fireUrl from '../../../assets/fire_on.png?url';
import charPinkIdle from '../../../assets/chars/char-pinkman-idle.png?url';
import charPinkRun from '../../../assets/chars/char-pinkman-run.png?url';
import charPinkJump from '../../../assets/chars/char-pinkman-jump.png?url';
import charPinkFall from '../../../assets/chars/char-pinkman-fall.png?url';
import charFrogIdle from '../../../assets/chars/char-ninjafrog-idle.png?url';
import charFrogRun from '../../../assets/chars/char-ninjafrog-run.png?url';
import charFrogJump from '../../../assets/chars/char-ninjafrog-jump.png?url';
import charFrogFall from '../../../assets/chars/char-ninjafrog-fall.png?url';
import charMaskIdle from '../../../assets/chars/char-maskdude-idle.png?url';
import charMaskRun from '../../../assets/chars/char-maskdude-run.png?url';
import charMaskJump from '../../../assets/chars/char-maskdude-jump.png?url';
import charMaskFall from '../../../assets/chars/char-maskdude-fall.png?url';
import charGuyIdle from '../../../assets/chars/char-virtualguy-idle.png?url';
import charGuyRun from '../../../assets/chars/char-virtualguy-run.png?url';
import charGuyJump from '../../../assets/chars/char-virtualguy-jump.png?url';
import charGuyFall from '../../../assets/chars/char-virtualguy-fall.png?url';
import fruitBananas from '../../../assets/fruits/fruit-bananas.png?url';
import fruitCherries from '../../../assets/fruits/fruit-cherries.png?url';
import fruitKiwi from '../../../assets/fruits/fruit-kiwi.png?url';
import fruitMelon from '../../../assets/fruits/fruit-melon.png?url';
import fruitOrange from '../../../assets/fruits/fruit-orange.png?url';
import fruitPineapple from '../../../assets/fruits/fruit-pineapple.png?url';
import gemPurple from '../../../assets/gems/gem-purple.png?url';
import gemBlue from '../../../assets/gems/gem-blue.png?url';
import gemRed from '../../../assets/gems/gem-red.png?url';
import checkpointOff from '../../../assets/items/checkpoint-off.png?url';
import checkpointOn from '../../../assets/items/checkpoint-on.png?url';
import endIdle from '../../../assets/items/end-idle.png?url';
import endPressed from '../../../assets/items/end-pressed.png?url';
import platBrown from '../../../assets/items/plat-brownon32x8.png?url';
import platGrey from '../../../assets/items/plat-greyon32x8.png?url';
import platFall from '../../../assets/items/plat-on32x10.png?url';
import bgBlue from '../../../assets/bg/bg-blue.png?url';
import arrowUrl from '../../../assets/traps/arrow.png?url';
import rockUrl from '../../../assets/traps/trap-rockhead.png?url';
import spikeheadUrl from '../../../assets/traps/trap-spikehead.png?url';
import trampIdleUrl from '../../../assets/traps/trampoline-idle.png?url';
import trampJumpUrl from '../../../assets/traps/trampoline-jump.png?url';
import box1Url from '../../../assets/deco/deco-box1.png?url';
import box2Url from '../../../assets/deco/deco-box2.png?url';
import box3Url from '../../../assets/deco/deco-box3.png?url';
import bgDiaSky from '../../../assets/bg/biomes/dia-sky.png?url';
import bgDiaClouds from '../../../assets/bg/biomes/dia-clouds.png?url';
import bgDiaHills from '../../../assets/bg/biomes/dia-hills.png?url';
import bgNocheSky from '../../../assets/bg/biomes/noche-sky.png?url';
import bgNocheStars from '../../../assets/bg/biomes/noche-stars.png?url';
import bgNocheHills from '../../../assets/bg/biomes/noche-hills.png?url';
import bgBosqueBg from '../../../assets/bg/biomes/bosque-bg.png?url';
import bgBosqueMid from '../../../assets/bg/biomes/bosque-mid.png?url';
import bgCuevaBg from '../../../assets/bg/biomes/cueva-bg.png?url';
import bgCuevaStalac from '../../../assets/bg/biomes/cueva-stalac.png?url';
import bgFabricaBg from '../../../assets/bg/biomes/fabrica-bg.png?url';
import bgFabricaCity from '../../../assets/bg/biomes/fabrica-city.png?url';
import enChicken from '../../../assets/enemies/en-chicken-run.png?url';
import enMushroom from '../../../assets/enemies/en-mushroom-run.png?url';
import enRadish from '../../../assets/enemies/en-radish-run.png?url';
import enRino from '../../../assets/enemies/en-rino-run.png?url';
import enRock1 from '../../../assets/enemies/en-rock1-run.png?url';
import enRock2 from '../../../assets/enemies/en-rock2-run.png?url';
import enRock3 from '../../../assets/enemies/en-rock3-run.png?url';
import enSlime from '../../../assets/enemies/en-slime-run.png?url';
import enSnail from '../../../assets/enemies/en-snail-walk.png?url';
import enTrunk from '../../../assets/enemies/en-trunk-run.png?url';
import enBunny from '../../../assets/enemies/en-bunny-run.png?url';
import enChameleon from '../../../assets/enemies/en-chameleon-run.png?url';
import enFatbird from '../../../assets/enemies/en-fatbird-ground.png?url';
import enTurtle from '../../../assets/enemies/en-turtle-idle.png?url';
import enDuck from '../../../assets/enemies/en-duck-idle.png?url';
import enPlant from '../../../assets/enemies/en-plant-idle.png?url';
import enBat from '../../../assets/enemies/en-bat-flying.png?url';
import enBee from '../../../assets/enemies/en-bee-idle.png?url';
import enGhost from '../../../assets/enemies/en-ghost-idle.png?url';
import enSkull from '../../../assets/enemies/en-skull-idle.png?url';

export interface SheetDef {
  key: string;
  url: string;
  fw: number;
  fh: number;
  frames: number;
}

export interface CharSkin {
  id: string;
  label: string;
  idle: SheetDef;
  run: SheetDef;
  jump: SheetDef;
  fall: SheetDef;
}

function sheet(key: string, url: string, fw: number, fh: number, frames: number): SheetDef {
  return { key, url, fw, fh, frames };
}

export const CHAR_SKINS: CharSkin[] = [
  {
    id: 'pink', label: 'Pink Man',
    idle: sheet('char-pink-idle', charPinkIdle, 32, 32, 11),
    run: sheet('char-pink-run', charPinkRun, 32, 32, 12),
    jump: sheet('char-pink-jump', charPinkJump, 32, 32, 1),
    fall: sheet('char-pink-fall', charPinkFall, 32, 32, 1),
  },
  {
    id: 'frog', label: 'Ninja Frog',
    idle: sheet('char-frog-idle', charFrogIdle, 32, 32, 11),
    run: sheet('char-frog-run', charFrogRun, 32, 32, 12),
    jump: sheet('char-frog-jump', charFrogJump, 32, 32, 1),
    fall: sheet('char-frog-fall', charFrogFall, 32, 32, 1),
  },
  {
    id: 'mask', label: 'Mask Dude',
    idle: sheet('char-mask-idle', charMaskIdle, 32, 32, 11),
    run: sheet('char-mask-run', charMaskRun, 32, 32, 12),
    jump: sheet('char-mask-jump', charMaskJump, 32, 32, 1),
    fall: sheet('char-mask-fall', charMaskFall, 32, 32, 1),
  },
  {
    id: 'guy', label: 'Virtual Guy',
    idle: sheet('char-guy-idle', charGuyIdle, 32, 32, 11),
    run: sheet('char-guy-run', charGuyRun, 32, 32, 12),
    jump: sheet('char-guy-jump', charGuyJump, 32, 32, 1),
    fall: sheet('char-guy-fall', charGuyFall, 32, 32, 1),
  },
];

/** Frutas que curan. key = textura cargada. */
export const FRUITS: { id: string; label: string; key: string }[] = [
  { id: 'apple', label: 'Manzana', key: 'apple' },
  { id: 'strawberry', label: 'Frutilla', key: 'strawberry' },
  { id: 'bananas', label: 'Bananas', key: 'fruit-bananas' },
  { id: 'cherries', label: 'Cerezas', key: 'fruit-cherries' },
  { id: 'kiwi', label: 'Kiwi', key: 'fruit-kiwi' },
  { id: 'melon', label: 'Melón', key: 'fruit-melon' },
  { id: 'orange', label: 'Naranja', key: 'fruit-orange' },
  { id: 'pineapple', label: 'Ananá', key: 'fruit-pineapple' },
];

export const FRUIT_SHEETS: SheetDef[] = [
  sheet('apple', appleUrl, 32, 32, 17),
  sheet('strawberry', strawberryUrl, 32, 32, 17),
  sheet('fruit-bananas', fruitBananas, 32, 32, 17),
  sheet('fruit-cherries', fruitCherries, 32, 32, 17),
  sheet('fruit-kiwi', fruitKiwi, 32, 32, 17),
  sheet('fruit-melon', fruitMelon, 32, 32, 17),
  sheet('fruit-orange', fruitOrange, 32, 32, 17),
  sheet('fruit-pineapple', fruitPineapple, 32, 32, 17),
];

export const GEMS: { id: string; label: string; key: string; url: string }[] = [
  { id: 'purple', label: 'Morada', key: 'gem-purple', url: gemPurple },
  { id: 'blue', label: 'Azul', key: 'gem-blue', url: gemBlue },
  { id: 'red', label: 'Roja', key: 'gem-red', url: gemRed },
];

export interface EnemySkin {
  id: string;
  label: string;
  kind: 'walker' | 'flyer';
  tex: SheetDef;
  /** Body de colisión. */
  bw: number;
  bh: number;
  speed?: number;
  range?: number;
}

function foe(
  id: string, label: string, kind: 'walker' | 'flyer',
  key: string, url: string, fw: number, fh: number, frames: number,
  bw: number, bh: number, extra?: { speed?: number; range?: number },
): EnemySkin {
  return { id, label, kind, tex: sheet(key, url, fw, fh, frames), bw, bh, ...extra };
}

export const ENEMIES: EnemySkin[] = [
  foe('pig', 'Chancho', 'walker', 'foe-pig', pigWalkUrl, 36, 30, 16, 30, 24),
  foe('chicken', 'Pollo', 'walker', 'foe-chicken', enChicken, 32, 34, 14, 26, 28),
  foe('mushroom', 'Hongo', 'walker', 'foe-mushroom', enMushroom, 32, 32, 16, 26, 26),
  foe('radish', 'Rabanito', 'walker', 'foe-radish', enRadish, 30, 38, 12, 24, 32),
  foe('rino', 'Rino', 'walker', 'foe-rino', enRino, 52, 34, 6, 44, 28),
  foe('rock1', 'Roca 1', 'walker', 'foe-rock1', enRock1, 38, 34, 14, 32, 28),
  foe('rock2', 'Roca 2', 'walker', 'foe-rock2', enRock2, 32, 28, 14, 26, 22),
  foe('rock3', 'Roca 3', 'walker', 'foe-rock3', enRock3, 22, 18, 14, 18, 14),
  foe('slime', 'Slime', 'walker', 'foe-slime', enSlime, 44, 30, 10, 38, 24),
  foe('snail', 'Caracol', 'walker', 'foe-snail', enSnail, 38, 24, 10, 32, 18, { speed: 20 }),
  foe('trunk', 'Tronco', 'walker', 'foe-trunk', enTrunk, 64, 32, 14, 56, 26),
  foe('bunny', 'Conejo', 'walker', 'foe-bunny', enBunny, 34, 44, 12, 28, 38),
  foe('chameleon', 'Camaleón', 'walker', 'foe-chameleon', enChameleon, 84, 38, 8, 76, 32, { speed: 25 }),
  foe('fatbird', 'Pájaro gordo', 'walker', 'foe-fatbird', enFatbird, 40, 48, 4, 34, 42, { speed: 25 }),
  foe('turtle', 'Tortuga', 'walker', 'foe-turtle', enTurtle, 44, 26, 14, 38, 20, { speed: 25 }),
  foe('duck', 'Pato', 'walker', 'foe-duck', enDuck, 36, 36, 10, 30, 30),
  foe('plant', 'Planta', 'walker', 'foe-plant', enPlant, 44, 42, 11, 36, 36, { speed: 0, range: 0 }),
  foe('bat', 'Murciélago', 'flyer', 'foe-bat', enBat, 46, 30, 7, 40, 24),
  foe('bee', 'Abeja', 'flyer', 'foe-bee', enBee, 36, 34, 6, 30, 28),
  foe('bluebird', 'Pájaro', 'flyer', 'foe-bluebird', bluebirdUrl, 32, 32, 9, 26, 26),
  foe('ghost', 'Fantasma', 'flyer', 'foe-ghost', enGhost, 44, 30, 10, 38, 24),
  foe('skull', 'Calavera', 'flyer', 'foe-skull', enSkull, 52, 54, 8, 44, 46),
];

export interface ObstacleDef {
  id: string;
  label: string;
  tex?: SheetDef;
  image?: { key: string; url: string };
  bw: number;
  bh: number;
}

export const OBSTACLES: ObstacleDef[] = [
  { id: 'spikes', label: 'Pinchos', image: { key: 'spike', url: vendorSpikeUrl }, bw: 16, bh: 10 },
  { id: 'saw', label: 'Sierra', tex: sheet('saw', sawUrl, 38, 38, 8), bw: 30, bh: 30 },
  { id: 'fire', label: 'Fuego', tex: sheet('fire', fireUrl, 16, 32, 3), bw: 12, bh: 28 },
  { id: 'arrow', label: 'Flecha', tex: sheet('arrow', arrowUrl, 18, 18, 10), bw: 14, bh: 14 },
  { id: 'rock', label: 'Roca', image: { key: 'rock', url: rockUrl }, bw: 34, bh: 34 },
  { id: 'spikehead', label: 'Cabeza pinchos', image: { key: 'spikehead', url: spikeheadUrl }, bw: 44, bh: 40 },
  { id: 'trampoline', label: 'Trampolín', tex: sheet('tramp-jump', trampJumpUrl, 28, 28, 8), bw: 24, bh: 12 },
];

export const TRAMP_IDLE = { key: 'tramp-idle', url: trampIdleUrl };

export const DECOS: { id: string; label: string; key: string; url: string; w: number; h: number }[] = [
  { id: 'box1', label: 'Caja 1', key: 'deco-box1', url: box1Url, w: 28, h: 24 },
  { id: 'box2', label: 'Caja 2', key: 'deco-box2', url: box2Url, w: 28, h: 24 },
  { id: 'box3', label: 'Caja 3', key: 'deco-box3', url: box3Url, w: 28, h: 24 },
];

/** Cajas de poder (reusan los sprites de las ex-deco): al romperlas dan disparo infinito. */
export const POWERUPS: { id: string; label: string; key: string; url: string; w: number; h: number }[] = [
  { id: 'box1', label: 'Caja fuego 1', key: 'deco-box1', url: box1Url, w: 28, h: 24 },
  { id: 'box2', label: 'Caja fuego 2', key: 'deco-box2', url: box2Url, w: 28, h: 24 },
  { id: 'box3', label: 'Caja fuego 3', key: 'deco-box3', url: box3Url, w: 28, h: 24 },
];

export const TILES_BASE = { key: 'tile', url: tilesPaUrl };
export const TILES_EXTRA = { key: 'terrain', url: terrainPaUrl };
export const CHECKPOINT = {
  off: { key: 'checkpoint-off', url: checkpointOff },
  on: sheet('checkpoint-on', checkpointOn, 64, 64, 26),
};
export const EXIT_DOOR = {
  idle: { key: 'end-idle', url: endIdle },
  pressed: sheet('end-pressed', endPressed, 64, 64, 8),
};
export const PLATFORMS = {
  mover: sheet('plat-brown', platBrown, 32, 8, 8),
  faller: sheet('plat-fall', platFall, 32, 10, 4),
};
export const BG_BLUE = { key: 'bg-blue', url: bgBlue };
export const PINK_LEGACY = { key: 'pink', url: pinkUrl };

export const BIOMES: Biome[] = [
  {
    id: 'dia', label: 'Día', thumbUrl: bgDiaSky,
    layers: [
      { key: 'bg-dia-sky', url: bgDiaSky, factor: 0, h: 270, anchor: 'fill' },
      { key: 'bg-dia-clouds', url: bgDiaClouds, factor: 0.15, h: 135, anchor: 'top' },
      { key: 'bg-dia-hills', url: bgDiaHills, factor: 0.4, h: 90, anchor: 'bottom' },
    ],
  },
  {
    id: 'noche', label: 'Noche', thumbUrl: bgNocheSky,
    layers: [
      { key: 'bg-noche-sky', url: bgNocheSky, factor: 0, h: 270, anchor: 'fill' },
      { key: 'bg-noche-stars', url: bgNocheStars, factor: 0.1, h: 270, anchor: 'fill' },
      { key: 'bg-noche-hills', url: bgNocheHills, factor: 0.35, h: 90, anchor: 'bottom' },
    ],
  },
  {
    id: 'bosque', label: 'Bosque', thumbUrl: bgBosqueMid,
    layers: [
      { key: 'bg-bosque-bg', url: bgBosqueBg, factor: 0, h: 270, anchor: 'fill' },
      { key: 'bg-bosque-mid', url: bgBosqueMid, factor: 0.3, h: 270, anchor: 'fill' },
    ],
  },
  {
    id: 'cueva', label: 'Cueva', thumbUrl: bgCuevaBg,
    layers: [
      { key: 'bg-cueva-bg', url: bgCuevaBg, factor: 0, h: 270, anchor: 'fill' },
      { key: 'bg-cueva-stalac', url: bgCuevaStalac, factor: 0.5, h: 120, anchor: 'top' },
    ],
  },
  {
    id: 'fabrica', label: 'Fábrica', thumbUrl: bgFabricaCity,
    layers: [
      { key: 'bg-fabrica-bg', url: bgFabricaBg, factor: 0, h: 270, anchor: 'fill' },
      { key: 'bg-fabrica-city', url: bgFabricaCity, factor: 0.3, h: 150, anchor: 'bottom' },
    ],
  },
  {
    id: 'blue', label: 'Plano azul', thumbUrl: bgBlue,
    layers: [{ key: 'bg-blue', url: bgBlue, factor: 0, h: 64, anchor: 'fill' }],
  },
];

export interface BiomeLayer {
  key: string;
  url: string;
  /** 0 = fijo a pantalla; >0 = parallax (fracción del scroll). */
  factor: number;
  /** Alto nativo para escalar la capa. */
  h: number;
  /** Anclaje vertical de la banda (las de pantalla completa usan 'fill'). */
  anchor: 'fill' | 'top' | 'bottom';
}

export interface Biome {
  id: string;
  label: string;
  thumbUrl: string;
  layers: BiomeLayer[];
}
