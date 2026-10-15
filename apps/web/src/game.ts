import Phaser from 'phaser';
import { assertValidLevel } from '@tinogames/level-schema';
import type { Level } from '@tinogames/level-schema';
import sampleLevel from '@tinogames/level-schema/levels/sample-level-1.json';
import { FEEL } from './feel.js';
import { bindTouch, touchState } from './input.js';
import {
  BG_BLUE,
  BIOMES,
  BRICK,
  CHAR_SKINS,
  CHECKPOINT,
  COINS,
  DECOS,
  ENEMIES,
  EXIT_DOOR,
  FRUITS,
  FRUIT_SHEETS,
  OBSTACLES,
  PIPE,
  PLATFORMS,
  POWERUPS,
  TILES_BASE,
  TILES_EXTRA,
  TRAMP_IDLE,
  type CharSkin,
  type EnemySkin,
  type SheetDef,
} from './catalog.js';

const T = FEEL.tile;

interface Walker {
  spr: Phaser.Physics.Arcade.Sprite;
  homeX: number;
  rangePx: number;
  dir: number;
  speed: number;
  bw: number;
  bh: number;
  /** El arte mira a la izquierda: el flip se invierte. */
  faceLeft: boolean;
}

interface Flyer {
  spr: Phaser.Physics.Arcade.Sprite;
  baseX: number;
  baseY: number;
  ampPx: number;
  freq: number;
  t: number;
  axis: 'x' | 'y';
  rangePx: number;
  dir: number;
  speed: number;
  /** El arte mira a la izquierda: el flip se invierte. */
  faceLeft: boolean;
}

interface Floater {
  img: Phaser.GameObjects.GameObject;
  baseY: number;
  phase: number;
}

/** Animación manual para sprites estáticos (frame por tiempo). */
interface LoopAnim {
  img: Phaser.Physics.Arcade.Image;
  tex: string;
  frames: number;
  rate: number;
  t: number;
  loop: boolean;
  onDone?: () => void;
}

interface Mover {
  spr: Phaser.Physics.Arcade.Sprite;
  homeX: number;
  homeY: number;
  axis: 'x' | 'y';
  rangePx: number;
  dir: number;
  speed: number;
  prevX: number;
  prevY: number;
}

/** Roca que cae del cielo al acercarse el jugador (estilo SMB): espera
 * flotando, se desploma, descansa y vuelve a subir. Siempre daña. */
interface DropRock {
  spr: Phaser.Physics.Arcade.Sprite;
  homeX: number;
  homeY: number;
  state: 'idle' | 'falling' | 'rest' | 'rising';
  timer: number;
}

/** Hongo móvil que sale de los bloques "?". Camina y agranda al tocarlo. */
interface Shroom {
  spr: Phaser.Physics.Arcade.Sprite;
  dir: number;
  age: number;
}

/** Tubería warp: huella sólida + boca de entrada en un lado. */
interface Pipe {
  pid: string;
  target: string;
  dir: 'up' | 'down' | 'left' | 'right';
  /** Boca (centro del lado de entrada) en px. */
  mouthX: number;
  mouthY: number;
  /** Rect en px para overlap. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Rect sólido en px (piso, tuberías, bloques): pararse/crecer/respawn. */
interface SolidRect {
  l: number;
  t: number;
  r: number;
  b: number;
  /** Dueño (bloque/ladrillo): al romperse se quita el rect. */
  tag?: object;
}

interface Faller {
  spr: Phaser.Physics.Arcade.Sprite;
  homeX: number;
  homeY: number;
  state: 'idle' | 'shaking' | 'falling' | 'gone';
  timer: number;
  jitter: number;
}

function tileKey(texture: string, x: number, y: number): string {
  return `${texture}:${x},${y}`;
}

function skinOf<T extends { id: string }>(list: T[], id: string | undefined, fallback: string): T {
  return list.find((s) => s.id === id) ?? list.find((s) => s.id === fallback)!;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerSkin: CharSkin = CHAR_SKINS[0];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyRunA!: Phaser.Input.Keyboard.Key;
  private keyRunB!: Phaser.Input.Keyboard.Key;
  /** false = chico (1 tile), true = grande (casi 2 tiles). */
  private big = false;
  private jumpCutArmed = false;
  private coins = 0;
  private crouching = false;
  private won = false;
  private coyote = 0;
  private buffer = 0;
  private invuln = 0;
  private facing = 1;
  private startX = 0;
  private startY = 0;
  private killY = 0;
  private solidSet: Set<string> = new Set();
  /** Tiles flotantes delgados (sin sólido arriba ni abajo): semisólidos. */
  private oneWayTiles: Set<string> = new Set();
  /** El último aterrizaje en trampolín vino cayendo (hay que rebotar). */
  private trampHot = false;
  /** Histéresis del salto: evita que parpadee entre corto/largo al borde de walkMax. */
  private lastRunJump = false;
  /** Rects sólidos en px: tiles + tuberías + bloques ?/ladrillo. */
  private solidRects: SolidRect[] = [];
  private walkers: Walker[] = [];
  private flyers: Flyer[] = [];
  private floaters: Floater[] = [];
  private loops: LoopAnim[] = [];
  private bgLayers: { ts: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private movers: Mover[] = [];
  private fallers: Faller[] = [];
  private checkpoints: Phaser.Physics.Arcade.Image[] = [];
  private blocks: Phaser.Physics.Arcade.Image[] = [];
  private bricks: Phaser.Physics.Arcade.Image[] = [];
  private shrooms: Shroom[] = [];
  private drocks: DropRock[] = [];
  private pipes: Pipe[] = [];
  private pipeSolids: Phaser.Physics.Arcade.Image[] = [];
  private solidGroup: Phaser.Physics.Arcade.StaticGroup | null = null;
  private pipeCd = 0;
  private exitZone: { spr: Phaser.GameObjects.Sprite; open: boolean; x: number; y: number } | null = null;
  private hudGems!: Phaser.GameObjects.Text;
  private hudHp!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private msgTimer = 0;

  constructor() {
    super('game');
  }

  preload(): void {
    const sheets: SheetDef[] = [
      ...CHAR_SKINS.flatMap((c) => [c.idle, c.run, c.jump, c.fall]),
      ...FRUIT_SHEETS,
      ...ENEMIES.map((e) => e.tex),
      ...OBSTACLES.flatMap((o) => (o.tex ? [o.tex] : [])),
      CHECKPOINT.on,
      EXIT_DOOR.pressed,
      PLATFORMS.mover,
      PLATFORMS.faller,
      { key: TILES_BASE.key, url: TILES_BASE.url, fw: 16, fh: 16, frames: 10 },
      { key: TILES_EXTRA.key, url: TILES_EXTRA.url, fw: 16, fh: 16, frames: 242 },
    ];
    for (const s of sheets) {
      this.load.spritesheet(s.key, s.url, { frameWidth: s.fw, frameHeight: s.fh });
    }
    for (const b of BIOMES) {
      for (const l of b.layers) this.load.image(l.key, l.url);
    }
    this.load.image('spike', OBSTACLES[0].image!.url);
    this.load.image('rock', OBSTACLES.find((o) => o.id === 'rock')!.image!.url);
    this.load.image('spikehead', OBSTACLES.find((o) => o.id === 'spikehead')!.image!.url);
    this.load.image(TRAMP_IDLE.key, TRAMP_IDLE.url);
    for (const g of COINS) this.load.image(g.key, g.url);
    this.load.image(PIPE.rim.key, PIPE.rim.url);
    this.load.image(PIPE.body.key, PIPE.body.url);
    this.load.image(CHECKPOINT.off.key, CHECKPOINT.off.url);
    this.load.image(EXIT_DOOR.idle.key, EXIT_DOOR.idle.url);
    for (const d of DECOS) this.load.image(d.key, d.url);
    this.load.image(BG_BLUE.key, BG_BLUE.url);
  }

  /** Textura 64px de plataforma con frame 0 repetido (el tileSprite sobre el
   * spritesheet muestra frames distintos pegados). */
  private makePlatTextures(): void {
    const defs = [
      { key: 'plat-mover64', src: PLATFORMS.mover.key, w: 64, h: 8 },
      { key: 'plat-faller64', src: PLATFORMS.faller.key, w: 64, h: 10 },
    ];
    for (const d of defs) {
      if (this.textures.exists(d.key)) continue;
      const strip = this.textures.get(d.src).getSourceImage() as CanvasImageSource;
      const cv = this.textures.createCanvas(d.key, d.w, d.h);
      if (!cv) continue;
      const ctx = cv.getContext();
      ctx.clearRect(0, 0, d.w, d.h);
      const sw = d.w / 2;
      const sh = d.h;
      ctx.drawImage(strip, 0, 0, sw, sh, 0, 0, sw, sh);
      ctx.drawImage(strip, 0, 0, sw, sh, sw, 0, sw, sh);
      cv.refresh();
    }
  }
  private currentLevel!: Level;
  private fromEditor = false;
  private remoteId: string | undefined;
  private levelName = '';
  private keyE!: Phaser.Input.Keyboard.Key;

  create(data?: { level?: Level; fromEditor?: boolean; remoteId?: string; name?: string }): void {
    document.body.classList.add('playing');
    document.body.classList.remove('editing');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('playing', 'from-editor');
    });
    const level = data?.level ?? sampleLevel as Level;
    this.currentLevel = level;
    this.fromEditor = data?.fromEditor ?? false;
    this.remoteId = data?.remoteId;
    this.levelName = data?.name ?? '';
    document.body.classList.toggle('from-editor', this.fromEditor);
    const backBtn = document.getElementById('game-back');
    if (backBtn) {
      backBtn.textContent = this.fromEditor ? '← Editor' : '← Menú';
      backBtn.onclick = () => {
        if (this.fromEditor) {
          this.scene.start('editor', { remoteId: this.remoteId, draft: this.currentLevel, name: this.levelName });
        } else {
          this.scene.start('menu');
        }
      };
    }
    assertValidLevel(level);
    this.makePlatTextures();
    this.solidRects = [];
    this.walkers = [];
    this.flyers = [];
    this.floaters = [];
    this.loops = [];
    this.movers = [];
    this.fallers = [];
    this.checkpoints = [];
    this.blocks = [];
    this.bricks = [];
    this.shrooms = [];
    this.drocks = [];
    this.pipes = [];
    this.pipeSolids = [];
    this.pipeCd = 0;
    this.big = false;
    this.crouching = false;
    this.jumpCutArmed = false;
    this.exitZone = null;
    this.coins = 0;
    this.won = false;

    // Fondo por bioma del nivel.
    this.bgLayers = [];
    this.makeBackground(level.bg);

    // --- Solidos ---
    const solids = this.physics.add.staticGroup();
    this.solidGroup = solids;
    this.solidSet = new Set(
      level.tiles.filter((t) => t.t === 'ground').map((t) => `${t.x},${t.y}`),
    );
    // Semisólidos: piso flotante de 1 tile (aire arriba y abajo) se atraviesa
    // desde abajo y se pisa desde arriba. Masas y columnas siguen sólidas.
    this.oneWayTiles = new Set();
    for (const key of this.solidSet) {
      const [sx, sy] = key.split(',').map(Number);
      if (!this.solidSet.has(`${sx},${sy - 1}`) && !this.solidSet.has(`${sx},${sy + 1}`)) {
        this.oneWayTiles.add(tileKey('tile', sx, sy));
      }
    }
    this.trampHot = false;
    this.lastRunJump = false;
    let maxX = 0;
    let maxY = 0;
    for (const t of level.tiles) {
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
      if (t.t === 'ground') {
        const [tex, frame] = this.tileFrame(t.v);
        const img = solids.create(t.x * T + T / 2, t.y * T + T / 2, tex, frame) as Phaser.Physics.Arcade.Image;
        img.refreshBody();
        img.setDepth(-5);
        img.setData('key', tileKey('tile', t.x, t.y));
        this.solidRects.push({ l: t.x * T, t: t.y * T, r: (t.x + 1) * T, b: (t.y + 1) * T });
      }
    }
    const worldW = (maxX + 3) * T;
    const worldH = (maxY + 3) * T;
    // Margen sobre el techo: el mundo/cámara arrancan 3 tiles arriba de lo
    // más alto (o de y=0), así siempre hay aire para saltar.
    let minTop = 0;
    for (const t of level.tiles) minTop = Math.min(minTop, t.y * T);
    for (const e of level.entities) minTop = Math.min(minTop, e.y * T);
    const topPx = minTop - 3 * T;
    this.killY = worldH + FEEL.killMargin;
    this.physics.world.setBounds(0, topPx, worldW, this.killY + 200 - topPx);

    // --- Entidades ---
    // items/spikes/hazards/checkpoints: todo estático (los animados llevan
    // frames manuales en update; nada con gravedad salvo player/walkers).
    const items = this.physics.add.staticGroup();
    const spikes = this.physics.add.staticGroup();
    const hazards = this.physics.add.staticGroup();
    const tramps = this.physics.add.staticGroup();
    const checkpoints = this.physics.add.staticGroup();
    const blocks = this.physics.add.staticGroup();
    const bricks = this.physics.add.staticGroup();
    const start = level.entities.find((e) => e.kind === 'player_start');
    const playerSkinId = (start?.props as { skin?: string } | undefined)?.skin;
    this.playerSkin = skinOf(CHAR_SKINS, playerSkinId, 'tux');

    for (const e of level.entities) {
      const cx = e.x * T + T / 2;
      const cy = e.y * T + T / 2;
      const props = (e.props ?? {}) as Record<string, unknown>;
      switch (e.kind) {
        case 'player_start': {
          const p = this.snapToGround(e.x, e.y);
          this.startX = p.x;
          this.startY = p.y;
          break;
        }
        case 'item':
        case 'fruit': {
          // Fruta = powerup estilo hongo: agranda. Legacy 'item' igual.
          const skin = e.kind === 'fruit'
            ? (FRUITS.find((f) => f.id === props['skin']) ?? FRUITS[0])
            : FRUITS[0];
          const spr = items.create(cx, cy, skin.key, 0) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          this.floaters.push({ img: spr, baseY: cy, phase: (cx % 10) * 0.35 });
          spr.setData('fruit', true);
          break;
        }
        case 'gem': {
          // Moneda: solo puntaje, no abre la salida.
          const color = (props['color'] as string) ?? 'purple';
          const coin = COINS.find((g) => g.id === color) ?? COINS[0];
          const spr = items.create(cx, cy, coin.key) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          this.floaters.push({ img: spr, baseY: cy, phase: (cx % 10) * 0.35 });
          spr.setData('coin', true);
          break;
        }
        case 'brick': {
          const spr = bricks.create(cx, cy, BRICK.key) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          spr.setData('broken', false);
          this.bricks.push(spr);
          this.solidRects.push({ l: cx - 14, t: cy - 12, r: cx + 14, b: cy + 12, tag: spr });
          break;
        }
        case 'pipe': {
          const w = Math.max(1, Math.floor((props['w'] as number | undefined) ?? 2));
          const h = Math.max(1, Math.floor((props['h'] as number | undefined) ?? 2));
          const pid = (props['pid'] as string | undefined) ?? '';
          const target = (props['target'] as string | undefined) ?? '';
          const rawDir = (props['dir'] as string | undefined) ?? 'up';
          const dir = rawDir === 'down' || rawDir === 'left' || rawDir === 'right' ? rawDir : 'up';
          this.addPipe(e.x, e.y, w, h, pid, target, dir);
          break;
        }
        case 'walker': {
          const skin: EnemySkin = skinOf(
            ENEMIES.filter((s) => s.kind === 'walker'),
            props['skin'] as string | undefined,
            'pig',
          );
          const wFloor = level.tiles.some((t) => t.t === 'ground' && t.x === e.x && t.y === e.y + 1);
          const spr = this.physics.add.sprite(cx, wFloor ? (e.y + 1) * T - (skin.bh / 2 + 1) : cy, skin.tex.key, 0);
          (spr.body as Phaser.Physics.Arcade.Body).setSize(skin.bw, skin.bh);
          spr.setCollideWorldBounds(false);
          spr.play(`foe-${skin.id}`);
          this.walkers.push({
            spr,
            homeX: cx,
            rangePx: ((props['range'] as number | undefined) ?? skin.range ?? 4) * T,
            dir: 1,
            speed: ((props['speed'] as number | undefined) ?? skin.speed ?? FEEL.walkerSpeed),
            bw: skin.bw,
            bh: skin.bh,
            faceLeft: skin.face === 'left',
          });
          break;
        }
        case 'flyer': {
          const skin: EnemySkin = skinOf(
            ENEMIES.filter((s) => s.kind === 'flyer'),
            props['skin'] as string | undefined,
            'bluebird',
          );
          const spr = this.physics.add.sprite(cx, cy, skin.tex.key, 0);
          (spr.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          (spr.body as Phaser.Physics.Arcade.Body).setImmovable(true);
          (spr.body as Phaser.Physics.Arcade.Body).setSize(skin.bw, skin.bh);
          spr.play(`foe-${skin.id}`);
          const axis = (props['axis'] as string | undefined) === 'y' ? 'y' : 'x';
          this.flyers.push({
            spr,
            baseX: cx,
            baseY: cy,
            ampPx: ((props['amp'] as number | undefined) ?? 2) * T,
            freq: (props['freq'] as number | undefined) ?? 1.5,
            t: Math.random() * 10,
            axis,
            rangePx: ((props['range'] as number | undefined) ?? 3) * T,
            dir: 1,
            speed: ((props['speed'] as number | undefined) ?? FEEL.flyerSpeed),
            faceLeft: skin.face === 'left',
          });
          break;
        }
        case 'spikes': {
          const w = Math.max(1, Math.floor((props['w'] as number | undefined) ?? 1));
          const h = Math.max(1, Math.floor((props['h'] as number | undefined) ?? 1));
          const variant = ((props['variant'] as string | undefined) ?? 'spikes') as string;
          for (let dx = 0; dx < w; dx++) {
            for (let dy = 0; dy < h; dy++) {
              this.addHazard(hazards, spikes, tramps, variant, cx + dx * T, cy + dy * T);
            }
          }
          break;
        }
        case 'checkpoint': {
          const spr = checkpoints.create(cx, (e.y + 1) * T, CHECKPOINT.off.key) as Phaser.Physics.Arcade.Image;
          spr.setOrigin(0.5, 1);
          spr.refreshBody();
          spr.setData('active', false);
          spr.setData('tx', e.x);
          spr.setData('ty', e.y);
          this.checkpoints.push(spr);
          break;
        }
        case 'powerup': {
          const skin = POWERUPS.find((d) => d.id === (props['skin'] as string | undefined)) ?? POWERUPS[0];
          const spr = blocks.create(cx, cy, skin.key) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          spr.setData('broken', false);
          this.blocks.push(spr);
          this.solidRects.push({ l: cx - 14, t: cy - 12, r: cx + 14, b: cy + 12, tag: spr });
          break;
        }
        case 'platform': {
          const axis = (props['axis'] as string | undefined) ?? 'x';
          if (axis === 'fall') {
            const spr = this.physics.add.sprite(cx, cy, 'plat-faller64');
            const b = spr.body as Phaser.Physics.Arcade.Body;
            b.setAllowGravity(false);
            b.setImmovable(true);
            b.setSize(64, 10);
            this.fallers.push({ spr, homeX: cx, homeY: cy, state: 'idle', timer: 0, jitter: Math.random() * 10 });
          } else {
            // Textura 64px de frame único: sin estirar ni mezclar frames.
            const spr = this.physics.add.sprite(cx, cy, 'plat-mover64');
            const b = spr.body as Phaser.Physics.Arcade.Body;
            b.setAllowGravity(false);
            b.setImmovable(true);
            b.setSize(64, 8);
            this.movers.push({
              spr,
              homeX: cx,
              homeY: cy,
              axis: axis === 'y' ? 'y' : 'x',
              rangePx: (((props['range'] as number | undefined) ?? 3) * T),
              dir: 1,
              speed: (props['speed'] as number | undefined) ?? 50,
              prevX: cx,
              prevY: cy,
            });
          }
          break;
        }
        case 'deco': {
          const skin = DECOS.find((d) => d.id === (props['skin'] as string | undefined)) ?? DECOS[0];
          this.add.image(cx, (e.y + 1) * T, skin.key).setOrigin(0.5, 1);
          break;
        }
        case 'exit': {
          const spr = this.add.sprite(cx, (e.y + 1) * T, EXIT_DOOR.idle.key).setOrigin(0.5, 1);
          this.exitZone = { spr, open: false, x: cx, y: (e.y + 1) * T - 32 };
          break;
        }
        default:
          break;
      }
    }

    // --- Player (arranca chico: 1 tile) ---
    this.player = this.physics.add.sprite(this.startX, this.startY, this.playerSkin.idle.key, 0);
    this.player.setCollideWorldBounds(true);
    this.applyForm(false);
    this.makeAnims();

    const moverSprites = this.movers.map((m) => m.spr);
    const fallerSprites = this.fallers.map((f) => f.spr);
    const blockSprites = this.blocks;
    this.physics.add.collider(this.player, solids, undefined, (_p, obj) => this.tileOneWay(_p, obj));
    this.physics.add.collider(this.player, moverSprites, undefined, (_p, obj) => this.riseThrough(_p, obj));
    this.physics.add.collider(this.player, fallerSprites, undefined, (_p, obj) => this.riseThrough(_p, obj));
    this.physics.add.collider(this.player, tramps, (_p, obj) => {
      if (this.trampHot) {
        this.trampHot = false;
        this.bounce(obj as Phaser.GameObjects.GameObject);
      }
    }, (_p, obj) => this.trampProcess(_p, obj));
    this.physics.add.collider(this.player, this.pipeSolids);
    this.physics.add.collider(this.player, blockSprites, (_p, obj) => {
      this.hitBlock(obj as Phaser.Physics.Arcade.Image);
    });
    this.physics.add.collider(this.player, this.bricks, (_p, obj) => {
      this.hitBrick(obj as Phaser.Physics.Arcade.Image);
    });
    for (const w of this.walkers) this.physics.add.collider(w.spr, solids);
    for (const w of this.walkers) {
      this.physics.add.collider(w.spr, moverSprites);
      this.physics.add.collider(w.spr, fallerSprites);
      this.physics.add.collider(w.spr, this.pipeSolids);
    }
    this.physics.add.collider(this.player, items, (_p, obj) => {
      const go = obj as Phaser.GameObjects.GameObject;
      const isFruit = go.getData?.('fruit') === true;
      go.destroy();
      if (isFruit) {
        this.grow();
        return;
      }
      // Moneda: solo puntaje.
      this.coins++;
      this.refreshHud();
    });
    // La salida abre siempre (las monedas son puntaje).
    this.physics.add.overlap(this.player, spikes, () => this.damage());
    this.physics.add.overlap(this.player, hazards, () => this.damage());
    for (const w of this.walkers) this.physics.add.overlap(this.player, w.spr, () => this.hitEnemy(w.spr));
    for (const f of this.flyers) this.physics.add.overlap(this.player, f.spr, () => this.hitEnemy(f.spr));
    // Rocas caedoras: siempre dañan (ni pisotón las mata).
    for (const r of this.drocks) this.physics.add.overlap(this.player, r.spr, () => this.damage());
    for (const c of this.checkpoints) {
      this.physics.add.overlap(this.player, c, () => this.activateCheckpoint(c));
    }

    // --- Camara + HUD ---
    this.cameras.main.setBounds(0, topPx, worldW, worldH - topPx);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudGems = this.add.text(12, 8, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#141428aa', padding: { x: 6, y: 3 } }).setScrollFactor(0);
    this.hudHp = this.add.text(12, 34, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#141428aa', padding: { x: 6, y: 3 } }).setScrollFactor(0);
    this.msg = this.add
      .text(240, 40, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#141428aa', padding: { x: 6, y: 3 }, align: 'center' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.refreshHud();

    // La salida abre siempre (las monedas son puntaje). Después del HUD.
    this.openExit();

    // --- Input ---
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyRunA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyRunB = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.input.keyboard!.addCapture(['SPACE', 'UP']);
    bindTouch(
      () => {
        this.buffer = FEEL.jumpBuffer;
      },
      () => this.releaseJump(),
    );
  }

  /** Fondo por bioma: capas fijas + parallax según scroll de cámara. */
  private makeBackground(bg: string | undefined): void {
    const biome = BIOMES.find((b) => b.id === bg) ?? BIOMES.find((b) => b.id === 'blue')!;
    for (const l of biome.layers) {
      if (l.factor === 0 && l.anchor === 'fill' && l.h === 64) {
        // Plancha tileable clásica.
        this.add.tileSprite(240, 135, 480, 270, l.key).setScrollFactor(0).setDepth(-10);
        continue;
      }
      if (l.factor === 0) {
        this.add.image(240, 135, l.key).setScrollFactor(0).setDepth(-10).setDisplaySize(480, 270);
        continue;
      }
      const y = l.anchor === 'top' ? l.h / 2 : 270 - l.h / 2;
      const ts = this.add.tileSprite(240, y, 480, l.h, l.key).setScrollFactor(0).setDepth(-10);
      if (l.anchor === 'fill') {
        const src = this.textures.get(l.key).getSourceImage() as { width: number; height: number };
        ts.setTileScale(480 / src.width, 270 / src.height);
      }
      this.bgLayers.push({ ts, factor: l.factor });
    }
  }
  /** Tubería w×h (origen = tile superior-izquierdo): huella sólida + boca warp.
   * La boca (rim) se dibuja del lado `dir`. */
  private addPipe(
    tx: number, ty: number, w: number, h: number,
    pid: string, target: string, dir: 'up' | 'down' | 'left' | 'right',
  ): void {
    const rimAt = (dx: number, dy: number): boolean =>
      dir === 'up' ? dy === 0
      : dir === 'down' ? dy === h - 1
      : dir === 'left' ? dx === 0
      : dx === w - 1;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        this.solidSet.add(`${tx + dx},${ty + dy}`);
        const tex = rimAt(dx, dy) ? PIPE.rim.key : PIPE.body.key;
        this.add.image((tx + dx) * T + T / 2, (ty + dy) * T + T / 2, tex).setDepth(-4);
      }
    }
    // Cuerpo sólido invisible (un rect por tubería).
    const cx = (tx + w / 2) * T;
    const cy = (ty + h / 2) * T;
    const solid = this.physics.add.staticImage(cx, cy, PIPE.body.key);
    solid.setDisplaySize(w * T, h * T);
    solid.refreshBody();
    solid.setVisible(false);
    (solid.body as Phaser.Physics.Arcade.Body).setSize(w * T, h * T);
    this.pipeSolids.push(solid);
    const left = tx * T;
    const right = (tx + w) * T;
    const top = ty * T;
    const bottom = (ty + h) * T;
    this.solidRects.push({ l: left, t: top, r: right, b: bottom });
    const mcx = (left + right) / 2;
    const mcy = (top + bottom) / 2;
    this.pipes.push({
      pid,
      target,
      dir,
      mouthX: dir === 'left' ? left : dir === 'right' ? right : mcx,
      mouthY: dir === 'up' ? top : dir === 'down' ? bottom : mcy,
      left,
      right,
      top,
      bottom,
    });
  }

  /** Obstáculo en (x,y): estático siempre, salvo la roca (cae al acercarse). */
  private addHazard(
    hazards: Phaser.GameObjects.Group,
    spikes: Phaser.GameObjects.Group,
    tramps: Phaser.GameObjects.Group,
    variant: string,
    x: number,
    y: number,
  ): void {
    if (variant === 'rock') {
      this.spawnDropRock(x, y);
      return;
    }
    if (variant === 'spikes') {
      const s = spikes.create(x, y, 'spike') as Phaser.Physics.Arcade.Image;
      s.refreshBody();
      (s.body as Phaser.Physics.Arcade.Body).setSize(T, 10);
      (s.body as Phaser.Physics.Arcade.Body).setOffset(0, 6);
      return;
    }
    if (variant === 'trampoline') {
      // Grupo propio con rebote solo al aterrizar (ya no overlap fantasma).
      const spr = tramps.create(x, y + 2, TRAMP_IDLE.key) as Phaser.Physics.Arcade.Image;
      spr.refreshBody();
      (spr.body as Phaser.Physics.Arcade.Body).setSize(24, 12);
      spr.setData('trampoline', true);
      spr.setData('cd', 0);
      return;
    }
    const def = OBSTACLES.find((o) => o.id === variant) ?? OBSTACLES[0];
    const key = def.tex ? def.tex.key : def.image!.key;
    const spr = hazards.create(x, y, key, 0) as Phaser.Physics.Arcade.Image;
    spr.refreshBody();
    (spr.body as Phaser.Physics.Arcade.Body).setSize(def.bw, def.bh);
    if (def.tex) this.addLoop(spr, def.tex.key, def.tex.frames, 12);
  }

  /** Anima en loop un sprite estático. */
  private addLoop(img: Phaser.Physics.Arcade.Image, tex: string, frames: number, rate: number): void {
    img.setTexture(tex, 0);
    this.loops.push({ img, tex, frames, rate, t: Math.random(), loop: true });
  }

  /** Anima una vez y al terminar restaura (o llama onDone). */
  private playOnce(
    img: Phaser.Physics.Arcade.Image,
    tex: string,
    frames: number,
    rate: number,
    onDone?: () => void,
  ): void {
    this.loops = this.loops.filter((l) => l.img !== img);
    img.setTexture(tex, 0);
    this.loops.push({ img, tex, frames, rate, t: 0, loop: false, onDone });
  }

  private bounce(go: Phaser.GameObjects.GameObject): void {
    const now = this.time.now;
    const last = (go.getData?.('cd') as number | undefined) ?? 0;
    if (now - last < 300) return;
    go.setData?.('cd', now);
    const spr = go as Phaser.Physics.Arcade.Image;
    const tramp = OBSTACLES.find((o) => o.id === 'trampoline')!;
    this.playOnce(spr, tramp.tex!.key, tramp.tex!.frames, 16, () => {
      if (spr.active) spr.setTexture(TRAMP_IDLE.key);
    });
    this.player.setVelocityY(-FEEL.trampolineVel);
    this.buffer = 0;
    this.jumpCutArmed = true;
  }

  private activateCheckpoint(c: Phaser.Physics.Arcade.Image): void {
    if (c.getData('active') === true) return;
    for (const other of this.checkpoints) {
      if (other !== c && other.getData('active') === true) {
        other.setData('active', false);
        this.loops = this.loops.filter((l) => l.img !== other);
        other.setTexture(CHECKPOINT.off.key);
      }
    }
    c.setData('active', true);
    c.setTexture(CHECKPOINT.on.key, 0);
    this.addLoop(c, CHECKPOINT.on.key, CHECKPOINT.on.frames, 12);
    const tileX = (c.getData('tx') as number | undefined) ?? Math.floor(c.x / T);
    const tileY = (c.getData('ty') as number | undefined) ?? Math.floor(c.y / T) - 1;
    const p = this.snapToGround(tileX, tileY);
    this.startX = p.x;
    this.startY = p.y;
  }

  private makeAnims(): void {
    const A = this.anims;
    const ensure = (key: string, tex: string, end: number, rate: number, repeat = -1): void => {
      if (A.exists(key)) return;
      A.create({ key, frames: A.generateFrameNumbers(tex, { start: 0, end }), frameRate: rate, repeat });
    };
    for (const c of CHAR_SKINS) {
      ensure(`${c.id}-idle`, c.idle.key, c.idle.frames - 1, 10);
      ensure(`${c.id}-run`, c.run.key, c.run.frames - 1, c.id === 'tux' ? 14 : 12);
      ensure(`${c.id}-jump`, c.jump.key, c.jump.frames - 1, c.id === 'tux' ? 15 : 1, 0);
      ensure(`${c.id}-fall`, c.fall.key, c.fall.frames - 1, c.id === 'tux' ? 12 : 1, c.id === 'tux' ? 0 : -1);
    }
    for (const e of ENEMIES) ensure(`foe-${e.id}`, e.tex.key, e.tex.frames - 1, 10);
    ensure('end-open', EXIT_DOOR.pressed.key, 7, 8, 0);
  }

  /** Textura+frame para un tile según su variante visual (solo estética). */
  private tileFrame(v: number | undefined): [string, number] {
    const variant = v ?? 0;
    if (variant < 10) return ['tile', variant];
    return ['terrain', variant - 10];
  }

  private refreshHud(): void {
    this.hudGems.setText(`🪙 ${this.coins}`);
    // Solo icono cuando hay powerup; chico no muestra nada.
    this.hudHp.setText(this.big ? '🍄' : '');
  }

  private showMsg(text: string): void {
    this.msg.setText(text);
    this.msgTimer = 2.5;
  }

  private openExit(): void {
    if (this.exitZone) {
      this.exitZone.open = true;
      this.exitZone.spr.setTexture(EXIT_DOOR.pressed.key, 0);
      this.exitZone.spr.play('end-open');
    }
  }

  /** Daño estilo Mario: grande→chico con invencibilidad, chico→muerte. */
  private damage(): void {
    if (this.invuln > 0 || this.won) return;
    if (this.big) {
      this.setCrouch(false);
      this.applyForm(false);
      this.invuln = FEEL.invulnTime;
      this.refreshHud();
      return;
    }
    this.respawn();
  }

  private respawn(): void {
    this.crouching = false;
    this.applyForm(false);
    // Subir hasta el primer rect 12x14 libre (nunca nacer embebido).
    const startFeet = this.startY + FEEL.smallH / 2;
    let feet = startFeet;
    for (let i = 0; i <= 160; i += 2) {
      if (this.rectFree(this.startX, startFeet - i, FEEL.smallW, FEEL.smallH)) {
        feet = startFeet - i;
        break;
      }
      feet = startFeet - i;
    }
    this.poseAtFeet(this.startX, feet);
    this.player.setVelocity(0, 0);
    this.coyote = 0;
    this.buffer = 0;
    this.jumpCutArmed = false;
    this.refreshHud();
    this.player.setAlpha(1);
    this.invuln = 1.0;
  }

  /** Chico (1 tile) ↔ grande (~2 tiles). Mantiene los pies plantados.
   * OJO: el body escala con el sprite, así que se sobredimensiona en
   * coords de textura para que el body efectivo quede 12x14 / 12x28. */
  private applyForm(big: boolean): void {
    this.big = big;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const scale = big ? 0.9 : 0.55;
    const w = (big ? FEEL.bigW : FEEL.smallW) / scale;
    const h = (big ? FEEL.bigH : FEEL.smallH) / scale;
    this.player.setScale(1);
    body.setSize(w, h, false);
    // Body pegado abajo y centrado en el frame 32px.
    body.setOffset((32 - w) / 2, 32 - h);
    this.player.setScale(scale);
  }

  /** Fruta/hongo: agranda (o bonus si ya es grande). Sin techo, no crece. */
  private grow(): void {
    if (!this.big) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const feet = body.bottom;
      if (!this.rectFree(this.player.x, feet, FEEL.bigW, FEEL.bigH, 0)) {
        this.refreshHud();
        return;
      }
      this.setCrouch(false);
      this.applyForm(true);
      // Replantar pies donde estaban (colocación analítica, nunca embebido).
      this.poseAtFeet(this.player.x, feet);
      this.refreshHud();
    } else {
      this.refreshHud();
    }
  }

  /** Bloque "?": solo se activa con cabezazo desde abajo. Suelta un hongo móvil. */
  private hitBlock(block: Phaser.Physics.Arcade.Image): void {
    if (block.getData('broken') === true) return;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const qb = block.body as Phaser.Physics.Arcade.Body;
    const headbutt = (pb.blocked.up || pb.touching.up) && (qb.blocked.down || qb.touching.down);
    if (!headbutt) return;
    block.setData('broken', true);
    block.disableBody(true, true);
    this.blocks = this.blocks.filter((b) => b !== block);
    this.dropSolidRect(block);
    this.spawnShroom(block.x, block.y - T);
  }

  /** Ladrillo: se cabecea desde abajo; chico rebota, grande lo rompe. */
  private hitBrick(brick: Phaser.Physics.Arcade.Image): void {
    if (brick.getData('broken') === true) return;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const qb = brick.body as Phaser.Physics.Arcade.Body;
    const headbutt = (pb.blocked.up || pb.touching.up) && (qb.blocked.down || qb.touching.down);
    if (!headbutt) return;
    if (this.big && !this.crouching) {
      brick.setData('broken', true);
      brick.disableBody(true, true);
      this.bricks = this.bricks.filter((b) => b !== brick);
      this.dropSolidRect(brick);
      return;
    }
    // Rebote visual del ladrillo.
    this.tweens.add({
      targets: brick,
      y: brick.y - 4,
      duration: 70,
      yoyo: true,
      onUpdate: () => brick.refreshBody(),
    });
  }

  /** Roca caedora: flota hasta que el jugador se acerca (1 tile), se
   * desploma, descansa y vuelve a subir. Como el thwomp: siempre daña. */
  private spawnDropRock(x: number, y: number): void {
    const def = OBSTACLES.find((o) => o.id === 'rock')!;
    const spr = this.physics.add.sprite(x, y, def.image!.key);
    const b = spr.body as Phaser.Physics.Arcade.Body;
    b.setSize(def.bw, def.bh);
    b.setAllowGravity(false);
    b.setImmovable(true);
    const rock: DropRock = { spr, homeX: x, homeY: y, state: 'idle', timer: 0 };
    this.drocks.push(rock);
    if (this.solidGroup) this.physics.add.collider(spr, this.solidGroup);
    this.physics.add.collider(spr, this.pipeSolids);
  }

  /** Hongo móvil: sale del bloque, camina con gravedad y agranda al tocarlo. */
  private spawnShroom(x: number, y: number): void {
    const spr = this.physics.add.sprite(x, y, 'foe-mushroom', 0);
    (spr.body as Phaser.Physics.Arcade.Body).setSize(22, 22);
    spr.play('foe-mushroom');
    const shroom: Shroom = { spr, dir: this.facing, age: 0 };
    this.shrooms.push(shroom);
    if (this.solidGroup) this.physics.add.collider(spr, this.solidGroup);
    this.physics.add.collider(spr, this.pipeSolids);
    this.physics.add.overlap(this.player, spr, () => {
      if (!spr.active) return;
      spr.disableBody(true, true);
      this.shrooms = this.shrooms.filter((s) => s !== shroom);
      this.grow();
    });
  }

  /** Elimina un enemigo (pisotón) sin dañar al jugador. */
  private killEnemy(spr: Phaser.Physics.Arcade.Sprite): void {
    if (!spr.active) return;
    this.walkers = this.walkers.filter((w) => {
      if (w.spr === spr) {
        // disableBody (no destroy): los overlaps ya registrados siguen válidos.
        w.spr.disableBody(true, true);
        return false;
      }
      return true;
    });
    this.flyers = this.flyers.filter((f) => {
      if (f.spr === spr) {
        f.spr.disableBody(true, true);
        return false;
      }
      return true;
    });
  }

  /** Contacto con enemigo: pisotón rebota (alto si mantenés salto), si no daña. */
  private hitEnemy(spr: Phaser.Physics.Arcade.Sprite): void {
    if (!spr.active || this.won) return;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const eb = spr.body as Phaser.Physics.Arcade.Body;
    const falling = pb.velocity.y > 50;
    const stomp = falling && pb.bottom - eb.top < 12;
    if (stomp) {
      this.killEnemy(spr);
      this.player.setVelocityY(this.jumpHeld() ? -FEEL.stompHigh : -FEEL.stompLow);
      this.buffer = 0;
      this.jumpCutArmed = true;
      return;
    }
    this.damage();
  }

  /** Botón de salto mantenido (teclado o táctil): salto variable + pisotón alto. */
  private jumpHeld(): boolean {
    return this.cursors.space.isDown || this.cursors.up.isDown || touchState.jump;
  }

  /** Corte de salto al soltar (llamado por el botón táctil; en teclado lo detecta el update). */
  private releaseJump(): void {
    const vy = (this.player.body as Phaser.Physics.Arcade.Body).velocity.y;
    if (vy < -FEEL.jumpCut) this.player.setVelocityY(-FEEL.jumpCut);
    this.jumpCutArmed = false;
  }

  /** Quita el rect sólido de un bloque/ladrillo roto. */
  private dropSolidRect(tag: object): void {
    this.solidRects = this.solidRects.filter((s) => s.tag !== tag);
  }

  /** Coloca al jugador con los pies en `feet` (cálculo analítico + 1px de aire:
   * Arcade ignora solapes mayores al delta del frame, así que embebido = fantasma).
   * Usa body.reset: replantar solo el sprite deja prev obsoleto y el postUpdate
   * catapulta al jugador con el delta fantasma. Preserva la velocidad. */
  private poseAtFeet(x: number, feet: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const sc = this.player.scaleX;
    const dispH = body.sourceHeight * Math.abs(sc);
    const target = feet - 1 - (sc * (body.offset.y - 16) + dispH);
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    body.reset(x, target);
    body.setVelocity(vx, vy);
  }

  /** Rect (centro-x, pies, w, h) libre de sólidos. e = margen interno. */
  private rectFree(cx: number, feet: number, w: number, h: number, e = 0.6): boolean {
    const l = cx - w / 2 + e;
    const r = cx + w / 2 - e;
    const t = feet - h + e;
    const b = feet - e;
    for (const s of this.solidRects) {
      if (l < s.r && r > s.l && t < s.b && b > s.t) return false;
    }
    return true;
  }

  /** Red de seguridad: si el cuerpo solapa sólido, subir hasta quedar libre.
   * Invariante: solape 0 (Arcade ignora lo embebido más allá del delta). */
  private ejectUp(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const sc = Math.abs(this.player.scaleX);
    const w = body.sourceWidth * sc;
    const h = body.sourceHeight * sc;
    const feet = body.bottom;
    if (this.rectFree(this.player.x, feet, w, h, 0)) return;
    for (let i = 0; i < 48; i++) {
      if (this.rectFree(this.player.x, feet - i, w, h, 0)) {
        this.poseAtFeet(this.player.x, feet - i);
        if (body.velocity.y > 0) this.player.setVelocityY(0);
        return;
      }
    }
    this.poseAtFeet(this.player.x, feet - 48);
  }

  /** Hay lugar para pararse grande (12x28 libres sobre los pies, estricto). */
  private headroom(): boolean {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    return this.rectFree(this.player.x, body.bottom, FEEL.bigW, FEEL.bigH, 0);
  }

  /** Agacharse: cuerpo chico + sprite levemente más chico (escala uniforme).
   * Pararse exige techo libre. Colocación analítica, nunca embebido. */
  private setCrouch(on: boolean): void {
    if (on === this.crouching) return;
    if (!on && this.big && !this.headroom()) return;
    this.crouching = on;
    if (on) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const feet = body.bottom;
      // Compensar la escala: el body escala con el sprite, así que se
      // sobredimensiona para que el efectivo quede 12x14.
      const sc = (this.big ? 0.9 : 0.55) * 0.85;
      const w = FEEL.smallW / sc;
      const h = FEEL.smallH / sc;
      this.player.setScale(1);
      body.setSize(w, h, false);
      body.setOffset((32 - w) / 2, 32 - h);
      this.player.setScale(sc);
      this.poseAtFeet(this.player.x, feet);
    } else {
      this.applyForm(this.big);
    }
  }

  /** Entrar a una tubería por su boca (tecla hacia la boca). */
  private tryPipe(keyUp: boolean, keyDown: boolean, keyLeft: boolean, keyRight: boolean): void {
    if (this.pipeCd > 0 || this.won) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const headY = body.top;
    const midY = (body.top + body.bottom) / 2;
    for (const p of this.pipes) {
      const want =
        p.dir === 'up' ? keyDown && this.player.x > p.left - 4 && this.player.x < p.right + 4 &&
          body.bottom > p.top - 8 && body.bottom < p.top + 24
        : p.dir === 'down' ? keyUp && this.player.x > p.left - 4 && this.player.x < p.right + 4 &&
          headY > p.bottom - 24 && headY < p.bottom + 8
        : p.dir === 'left' ? keyRight && midY > p.top - 4 && midY < p.bottom + 4 &&
          body.right > p.left - 8 && body.right < p.left + 24
        : keyLeft && midY > p.top - 4 && midY < p.bottom + 4 &&
          body.left > p.right - 24 && body.left < p.right + 8;
      if (!want) continue;
      if (!p.target) return;
      const dest = this.pipes.find((q) => q.pid === p.target);
      if (!dest) return;
      this.setCrouch(false);
      const tb = this.player.body as Phaser.Physics.Arcade.Body;
      const bw = tb.right - tb.left;
      const bh = tb.bottom - tb.top;
      // Punto de salida + escaneo hacia afuera hasta 48px: si no hay lugar
      // libre, se cancela el viaje (nunca se atraviesa nada).
      let ex = dest.mouthX;
      let feet = dest.top;
      let vx = 0;
      let vy = 0;
      if (dest.dir === 'up') {
        feet = dest.top - bh / 2 - 2;
      } else if (dest.dir === 'down') {
        feet = dest.bottom + bh / 2 + 2;
        vy = 60;
      } else if (dest.dir === 'left') {
        ex = dest.left - bw / 2 - 2;
        feet = dest.mouthY + bh / 2;
        vx = -60;
      } else {
        ex = dest.right + bw / 2 + 2;
        feet = dest.mouthY + bh / 2;
        vx = 60;
      }
      let ok = false;
      for (let i = 0; i <= 48; i += 8) {
        const fx = dest.dir === 'left' ? ex - i : dest.dir === 'right' ? ex + i : ex;
        const ff = dest.dir === 'up' ? feet - i : dest.dir === 'down' ? feet + i : feet;
        if (this.rectFree(fx, ff, bw, bh, 0)) {
          ex = fx;
          feet = ff;
          ok = true;
          break;
        }
      }
      if (!ok) {
        this.pipeCd = 0.3;
        return;
      }
      this.poseAtFeet(ex, feet);
      this.player.setVelocity(vx, vy);
      // Pararse recién en destino (si hay techo, si no sigue agachado).
      this.setCrouch(false);
      this.pipeCd = 1.0;
      return;
    }
  }

  /** Semisólido estilo Maker: se atraviesa subiendo desde abajo, se pisa cayendo.
   * Quieto o cayendo colisiona siempre (pararse, caminar, aterrizar). */
  private riseThrough(p: object, o: object): boolean {
    const pb = (p as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    const qb = (o as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    if (!pb || !qb) return true;
    if (pb.velocity.y < -20 && pb.top > qb.top) return false;
    return true;
  }

  /** Solo los tiles flotantes delgados son semisólidos; el resto es macizo. */
  private tileOneWay(p: object, o: object): boolean {
    const key = (o as unknown as { getData?: (k: string) => unknown }).getData?.('key');
    if (typeof key !== 'string' || !this.oneWayTiles.has(key)) return true;
    return this.riseThrough(p, o);
  }

  /** Trampolín: solo rebota al aterrizar encima; de costado o desde abajo pasa. */
  private trampProcess(p: object, o: object): boolean {
    const pb = (p as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    const qb = (o as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    if (!pb || !qb) return false;
    const pen = pb.bottom - qb.top;
    if (pb.velocity.y < -20 && pb.top > qb.top) {
      this.trampHot = false;
      return false;
    }
    if (pb.velocity.y > 40 && pen < 14) {
      this.trampHot = true;
      return true;
    }
    // Quieto encima: sostener sin rebotar (el rebote lo dispara trampHot).
    if (Math.abs(pb.velocity.y) <= 40 && pen <= 4 && pen >= -6) return true;
    return false;
  }

  private standingOn(plat: Phaser.Physics.Arcade.Sprite): boolean {
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const qb = plat.body as Phaser.Physics.Arcade.Body;
    return (
      pb.touching.down &&
      qb.touching.up &&
      Math.abs(pb.bottom - qb.top) < 8 &&
      pb.right > qb.left + 2 &&
      pb.left < qb.right - 2
    );
  }

  /** Busca piso debajo: si el punto está en sólido sube, si no hay piso no usa centro de tile sólido. */
  private snapToGround(tx: number, ty: number): { x: number; y: number } {
    const level = this.currentLevel;
    const solidAt = (x: number, y: number): boolean =>
      level.tiles.some((t) => t.t === 'ground' && t.x === x && t.y === y);
    let baseY = ty;
    for (let u = 0; u <= 4 && solidAt(tx, baseY); u++) baseY--;
    for (let d = 0; d <= 6; d++) {
      if (solidAt(tx, baseY + d)) {
        // Se arranca chico (mitad = 7px).
        return { x: tx * T + T / 2, y: (baseY + d) * T - 7 };
      }
    }
    // Sin piso debajo: centro de la primera celda libre, nunca dentro de sólido.
    for (let u = 0; u <= 6; u++) {
      if (!solidAt(tx, baseY - u)) {
        return { x: tx * T + T / 2, y: (baseY - u) * T + T / 2 };
      }
    }
    return { x: tx * T + T / 2, y: baseY * T - 7 };
  }

  override update(_time: number, deltaMs: number): void {
    const delta = Math.min(deltaMs / 1000, 0.05);
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.scene.restart({ level: this.currentLevel, fromEditor: this.fromEditor, remoteId: this.remoteId, name: this.levelName });
      return;
    }
    if (this.fromEditor && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.scene.start('editor', { remoteId: this.remoteId, draft: this.currentLevel, name: this.levelName });
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onFloor = body.blocked.down || body.touching.down;

    const left = this.cursors.left.isDown || touchState.left;
    const right = this.cursors.right.isDown || touchState.right;
    const down = this.cursors.down.isDown || touchState.down;
    const dir = this.crouching ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) this.facing = dir;
    const running = this.keyRunA.isDown || this.keyRunB.isDown || touchState.run;
    const maxSpeed = running ? FEEL.runMax : FEEL.walkMax;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.buffer = FEEL.jumpBuffer;
    }

    // Agacharse (↓): solo en piso; pararse exige piso + techo libre.
    // En aire se mantiene el estado hasta aterrizar.
    if (down && onFloor) this.setCrouch(true);
    else if (onFloor) this.setCrouch(false);
    // Tubería: tecla hacia la boca.
    this.tryPipe(
      this.cursors.up.isDown || touchState.jump,
      down,
      left,
      right,
    );
    this.pipeCd = Math.max(0, this.pipeCd - delta);

    // --- Locomoción SuperTux (player.cpp): walk/run accel, fricción x1.5, skid x2/x2.5 ---
    let vx = body.velocity.x;
    if (dir !== 0) {
      // Arranque instantáneo ST WALK_SPEED: sin esto se siente pesado al salir.
      if (Math.abs(vx) < FEEL.walkSpeed) vx = dir * FEEL.walkSpeed;
      const sameDir = Math.sign(vx) === dir;
      const overWalk = Math.abs(vx) > FEEL.walkMax;
      let rate: number;
      if (onFloor) {
        if (sameDir) rate = overWalk ? FEEL.runAccel : FEEL.accel;
        else rate = Math.abs(vx) > FEEL.skidThreshold ? FEEL.skidWide : FEEL.skid;
      } else {
        rate = sameDir ? FEEL.airAccel : FEEL.airAccel * 2;
      }
      let nvx = vx + dir * rate * delta;
      // Límite: caminando no pasa walkMax, corriendo no pasa runMax.
      nvx = Phaser.Math.Clamp(nvx, -maxSpeed, maxSpeed);
      // Sobregiro ST OVERSPEED_DECELERATION: baja gradual, no corte seco.
      if (Math.abs(nvx) > maxSpeed) {
        const back = FEEL.overspeedDecel * delta * Math.sign(nvx);
        nvx -= back;
      }
      this.player.setVelocityX(nvx);
    } else {
      const rate = onFloor ? FEEL.decel : FEEL.airAccel * 0.4;
      // ST apply_friction: debajo de WALK_SPEED frena en seco.
      if (onFloor && Math.abs(vx) < FEEL.walkSpeed) {
        this.player.setVelocityX(0);
      } else {
        const nvx = Math.abs(vx) <= rate * delta ? 0 : vx - Math.sign(vx) * rate * delta;
        this.player.setVelocityX(nvx);
      }
    }

    if (!onFloor) {
      this.coyote -= delta;
    } else {
      this.coyote = FEEL.coyoteTime;
    }
    this.buffer -= delta;
    if (this.buffer > 0 && (this.coyote > 0 || onFloor)) {
      // ST por umbral, con histéresis ±8 para no parpadear entre corto/largo.
      const sp = Math.abs(body.velocity.x);
      if (sp > FEEL.walkMax + 8) this.lastRunJump = true;
      else if (sp < FEEL.walkMax - 8) this.lastRunJump = false;
      const jumpVel = this.lastRunJump ? FEEL.jumpVelRun : FEEL.jumpVelWalk;
      this.player.setVelocityY(-jumpVel);
      this.buffer = 0;
      this.coyote = 0;
      this.jumpCutArmed = true;
    }

    // --- Gravedad variable SMB ---
    const rising = body.velocity.y < 0;
    if (rising && !this.jumpHeld()) {
      if (this.jumpCutArmed && body.velocity.y < -FEEL.jumpCut) {
        this.player.setVelocityY(-FEEL.jumpCut);
      }
      this.jumpCutArmed = false;
    }
    if (!onFloor && (!this.jumpHeld() || body.velocity.y > 0)) {
      // Gravedad fuerte al caer o sin botón: suma la diferencia sobre la base.
      this.player.setVelocityY(
        body.velocity.y + (FEEL.gravityDown - FEEL.gravityUp) * delta,
      );
    }

    // Walkers: patrulla (flip solo si se aleja hacia afuera, sin oscilar).
    // Giran en bordes para no tirarse al vacío (salvo sobre plataformas).
    const onPlatform = (x: number, y: number): boolean =>
      this.movers.some((m) => Math.abs(x - m.spr.x) < 36 && Math.abs(y - m.spr.y) < 14) ||
      this.fallers.some((f) => f.state !== 'gone' && Math.abs(x - f.spr.x) < 36 && Math.abs(y - f.spr.y) < 14);
    for (const w of this.walkers) {
      w.spr.setVelocityX(w.dir * w.speed);
      if ((w.spr.x - w.homeX) * w.dir > w.rangePx) w.dir *= -1;
      const wb = w.spr.body as Phaser.Physics.Arcade.Body;
      if (wb.blocked.left && w.dir < 0) w.dir = 1;
      if (wb.blocked.right && w.dir > 0) w.dir = -1;
      if (wb.blocked.down && !onPlatform(w.spr.x, w.spr.y)) {
        const aheadX = w.spr.x + w.dir * (w.bw / 2 + 3);
        const belowY = w.spr.y + w.bh / 2 + 6;
        if (!this.solidSet.has(`${Math.floor(aheadX / T)},${Math.floor(belowY / T)}`)) {
          w.dir *= -1;
        }
      }
      w.spr.setFlipX(w.faceLeft ? w.dir > 0 : w.dir < 0);
    }

    // Rocas caedoras: esperan, se desploman al acercarse, descansan y suben.
    for (const r of this.drocks) {
      if (!r.spr.active) continue;
      const rb = r.spr.body as Phaser.Physics.Arcade.Body;
      const dx = Math.abs(this.player.x - r.spr.x);
      const below = this.player.y > r.spr.y - 8;
      if (r.state === 'idle') {
        if (dx <= 1.5 * T && below) {
          r.state = 'falling';
          rb.setAllowGravity(true);
          rb.setImmovable(false);
          rb.setMaxVelocity(0, 420);
          r.spr.setVelocity(0, 60);
        }
      } else if (r.state === 'falling') {
        if (rb.blocked.down) {
          r.state = 'rest';
          r.timer = 0.8;
          r.spr.setVelocity(0, 0);
          rb.setAllowGravity(false);
          rb.setImmovable(true);
        } else if (r.spr.y > this.killY) {
          // Cayó al vacío: reaparece arriba.
          r.state = 'rising';
        }
      } else if (r.state === 'rest') {
        r.timer -= delta;
        if (r.timer <= 0) r.state = 'rising';
      } else {
        r.spr.y -= 70 * delta;
        if (r.spr.y <= r.homeY) {
          r.spr.setPosition(r.homeX, r.homeY);
          r.spr.setVelocity(0, 0);
          r.state = 'idle';
        }
      }
    }
    // Hongos móviles: caminan con gravedad, giran en pared/borde, mueren abajo.
    for (const s of [...this.shrooms]) {
      if (!s.spr.active) {
        this.shrooms = this.shrooms.filter((x) => x !== s);
        continue;
      }
      s.age += delta;
      const sb = s.spr.body as Phaser.Physics.Arcade.Body;
      s.spr.setVelocityX(s.dir * 55);
      if ((sb.blocked.left && s.dir < 0) || (sb.blocked.right && s.dir > 0)) s.dir *= -1;
      if (sb.blocked.down) {
        const aheadX = s.spr.x + s.dir * 14;
        const belowY = s.spr.y + 12;
        if (!this.solidSet.has(`${Math.floor(aheadX / T)},${Math.floor(belowY / T)}`)) s.dir *= -1;
      }
      s.spr.setFlipX(s.dir < 0);
      if (s.spr.y > this.killY || s.age > 15) {
        s.spr.disableBody(true, true);
        this.shrooms = this.shrooms.filter((x) => x !== s);
      }
    }
    // Flyers: patrulla lateral a velocidad constante (eje x), seno solo si axis==='y'.
    for (const f of this.flyers) {
      if (!f.spr.active) continue;
      f.t += delta;
      if (f.axis === 'y') {
        f.spr.setPosition(f.baseX, f.baseY + Math.sin(f.t * f.freq * Math.PI * 2) * f.ampPx);
      } else {
        f.spr.x += f.dir * f.speed * delta;
        if (f.spr.x - f.baseX > f.rangePx) {
          f.spr.x = f.baseX + f.rangePx;
          f.dir = -1;
        } else if (f.spr.x - f.baseX < -f.rangePx) {
          f.spr.x = f.baseX - f.rangePx;
          f.dir = 1;
        }
        f.spr.y = f.baseY + Math.sin(f.t * Math.PI * 2) * 3;
        f.spr.setFlipX(f.faceLeft ? f.dir > 0 : f.dir < 0);
      }
    }

    // Plataformas móviles: cinemáticas (posición, no velocidad) + arrastre exacto.
    for (const m of this.movers) {
      if (m.axis === 'y') {
        m.spr.y += m.dir * m.speed * delta;
        if (m.spr.y - m.homeY > m.rangePx) {
          m.spr.y = m.homeY + m.rangePx;
          m.dir = -1;
        } else if (m.spr.y - m.homeY < -m.rangePx) {
          m.spr.y = m.homeY - m.rangePx;
          m.dir = 1;
        }
        const dy = m.spr.y - m.prevY;
        m.prevY = m.spr.y;
        if (dy !== 0 && this.standingOn(m.spr)) this.player.y += dy;
      } else {
        m.spr.x += m.dir * m.speed * delta;
        if (m.spr.x - m.homeX > m.rangePx) {
          m.spr.x = m.homeX + m.rangePx;
          m.dir = -1;
        } else if (m.spr.x - m.homeX < -m.rangePx) {
          m.spr.x = m.homeX - m.rangePx;
          m.dir = 1;
        }
        const dx = m.spr.x - m.prevX;
        m.prevX = m.spr.x;
        if (dx !== 0 && this.standingOn(m.spr)) this.player.x += dx;
      }
    }

    // Plataformas que caen: tiemblan poco, caen a velocidad topeada y vuelven.
    for (const f of this.fallers) {
      const fb = f.spr.body as Phaser.Physics.Arcade.Body;
      if (f.state === 'idle') {
        if (this.standingOn(f.spr)) {
          f.state = 'shaking';
          f.timer = 0.25;
        }
      } else if (f.state === 'shaking') {
        f.timer -= delta;
        f.spr.x = f.homeX + Math.sin(this.time.now / 30 + f.jitter) * 2;
        if (f.timer <= 0) {
          f.state = 'falling';
          fb.setAllowGravity(true);
          fb.setImmovable(false);
          fb.setMaxVelocity(0, 280);
          f.spr.setVelocity(0, 0);
        }
      } else if (f.state === 'falling') {
        if (f.spr.y > this.killY + 100) {
          f.state = 'gone';
          f.timer = 2.5;
          f.spr.setVisible(false);
          f.spr.body!.enable = false;
        }
      } else {
        f.timer -= delta;
        if (f.timer <= 0) {
          f.state = 'idle';
          f.spr.setPosition(f.homeX, f.homeY);
          f.spr.setVelocity(0, 0);
          fb.setAllowGravity(false);
          fb.setImmovable(true);
          f.spr.setVisible(true);
          f.spr.body!.enable = true;
        }
      }
    }

    // Parallax del fondo.
    if (this.bgLayers.length > 0) {
      const sx = this.cameras.main.scrollX;
      for (const l of this.bgLayers) l.ts.tilePositionX = sx * l.factor;
    }

    // Flotantes: frutas, gemas e items.
    for (const fl of this.floaters) {
      const img = fl.img as Phaser.GameObjects.Image;
      if (!img.active) continue;
      img.y = fl.baseY + Math.sin(this.time.now / 1000 + fl.phase) * FEEL.itemFloatAmp;
    }

    // Animaciones manuales (sprites estáticos: trampas, checkpoint).
    if (this.loops.length > 0) {
      const keep: LoopAnim[] = [];
      for (const l of this.loops) {
        if (!l.img.active) continue;
        l.t += delta;
        const idx = Math.floor(l.t * l.rate);
        if (idx >= l.frames) {
          if (l.loop) {
            l.t -= Math.floor(l.t * l.rate) / l.rate;
            l.img.setFrame(0);
            keep.push(l);
          } else {
            l.img.setFrame(l.frames - 1);
            l.onDone?.();
          }
          continue;
        }
        l.img.setFrame(idx);
        keep.push(l);
      }
      this.loops = keep;
    }

    // Invulnerabilidad: parpadeo.
    if (this.invuln > 0) {
      this.invuln -= delta;
      this.player.setAlpha(0.35 + 0.3 * Math.abs(Math.sin(this.time.now / 60)));
      if (this.invuln <= 0) this.player.setAlpha(1);
    }

    // Red de seguridad anti-hundimiento (esquinas, crecer, respawn).
    this.ejectUp();

    // Caida al vacio.
    if (this.player.y > this.killY) this.respawn();

    // Salida (siempre abierta; las monedas son puntaje).
    if (this.exitZone && !this.won) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitZone.x, this.exitZone.y);
      if (d < 30) {
        this.won = true;
        this.showMsg(
          this.fromEditor ? '¡Nivel completo! R rejugar · E editor' : '¡Nivel completo! R para rejugar',
        );
      }
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= delta;
      if (this.msgTimer <= 0) this.msg.setText('');
    }

    // Anims del jugador.
    const sk = this.playerSkin.id;
    this.player.setFlipX(this.facing < 0);
    if (!onFloor) {
      this.player.play(body.velocity.y < 0 ? `${sk}-jump` : `${sk}-fall`, true);
    } else if (Math.abs(body.velocity.x) > 10) {
      this.player.play(`${sk}-run`, true);
    } else {
      this.player.play(`${sk}-idle`, true);
    }
  }
}
