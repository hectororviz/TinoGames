import Phaser from 'phaser';
import { assertValidLevel } from '@tinogames/level-schema';
import type { Level } from '@tinogames/level-schema';
import sampleLevel from '@tinogames/level-schema/levels/sample-level-1.json';
import { FEEL } from './feel.js';
import { bindTouch, touchState } from './input.js';
import {
  BG_BLUE,
  CHAR_SKINS,
  CHECKPOINT,
  DECOS,
  ENEMIES,
  EXIT_DOOR,
  FRUITS,
  FRUIT_SHEETS,
  GEMS,
  OBSTACLES,
  PLATFORMS,
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
}

interface Flyer {
  spr: Phaser.Physics.Arcade.Sprite;
  baseX: number;
  baseY: number;
  ampPx: number;
  freq: number;
  t: number;
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
  rangePx: number;
  dir: number;
  speed: number;
  prevX: number;
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
  private keyJ!: Phaser.Input.Keyboard.Key;
  private hp = FEEL.maxHp;
  private gems = 0;
  private gemsTotal = 0;
  private won = false;
  private coyote = 0;
  private buffer = 0;
  private djUsed = false;
  private dashT = 0;
  private dashCd = 0;
  private invuln = 0;
  private facing = 1;
  private startX = 0;
  private startY = 0;
  private killY = 0;
  private solidSet: Set<string> = new Set();
  private walkers: Walker[] = [];
  private flyers: Flyer[] = [];
  private floaters: Floater[] = [];
  private loops: LoopAnim[] = [];
  private movers: Mover[] = [];
  private fallers: Faller[] = [];
  private checkpoints: Phaser.Physics.Arcade.Image[] = [];
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
    this.load.image('spike', OBSTACLES[0].image!.url);
    this.load.image('rock', OBSTACLES.find((o) => o.id === 'rock')!.image!.url);
    this.load.image('spikehead', OBSTACLES.find((o) => o.id === 'spikehead')!.image!.url);
    this.load.image(TRAMP_IDLE.key, TRAMP_IDLE.url);
    for (const g of GEMS) this.load.image(g.key, g.url);
    this.load.image(CHECKPOINT.off.key, CHECKPOINT.off.url);
    this.load.image(EXIT_DOOR.idle.key, EXIT_DOOR.idle.url);
    for (const d of DECOS) this.load.image(d.key, d.url);
    this.load.image(BG_BLUE.key, BG_BLUE.url);
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
    this.walkers = [];
    this.flyers = [];
    this.floaters = [];
    this.loops = [];
    this.movers = [];
    this.fallers = [];
    this.checkpoints = [];
    this.exitZone = null;
    this.hp = FEEL.maxHp;
    this.gems = 0;
    this.gemsTotal = 0;
    this.won = false;

    // Fondo.
    this.add.tileSprite(240, 135, 480, 270, BG_BLUE.key).setScrollFactor(0).setDepth(-10);

    // --- Solidos ---
    const solids = this.physics.add.staticGroup();
    this.solidSet = new Set(
      level.tiles.filter((t) => t.t === 'ground').map((t) => `${t.x},${t.y}`),
    );
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
      }
    }
    const worldW = (maxX + 3) * T;
    const worldH = (maxY + 3) * T;
    this.killY = worldH + FEEL.killMargin;
    this.physics.world.setBounds(0, 0, worldW, this.killY + 200);

    // --- Entidades ---
    // items/spikes/hazards/checkpoints: todo estático (los animados llevan
    // frames manuales en update; nada con gravedad salvo player/walkers).
    const items = this.physics.add.staticGroup();
    const spikes = this.physics.add.staticGroup();
    const hazards = this.physics.add.staticGroup();
    const checkpoints = this.physics.add.staticGroup();
    const start = level.entities.find((e) => e.kind === 'player_start');
    const playerSkinId = (start?.props as { skin?: string } | undefined)?.skin;
    this.playerSkin = skinOf(CHAR_SKINS, playerSkinId, 'pink');

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
        case 'item': {
          const spr = items.create(cx, cy, 'apple', 0) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          this.floaters.push({ img: spr, baseY: cy, phase: (cx % 10) * 0.35 });
          this.gemsTotal++;
          break;
        }
        case 'fruit': {
          const skin = FRUITS.find((f) => f.id === props['skin']) ?? FRUITS[0];
          const spr = items.create(cx, cy, skin.key, 0) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          this.floaters.push({ img: spr, baseY: cy, phase: (cx % 10) * 0.35 });
          spr.setData('fruit', true);
          break;
        }
        case 'gem': {
          const color = (props['color'] as string) ?? 'purple';
          const gem = GEMS.find((g) => g.id === color) ?? GEMS[0];
          const spr = items.create(cx, cy, gem.key) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          this.floaters.push({ img: spr, baseY: cy, phase: (cx % 10) * 0.35 });
          this.gemsTotal++;
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
          this.flyers.push({
            spr,
            baseX: cx,
            baseY: cy,
            ampPx: ((props['amp'] as number | undefined) ?? 2) * T,
            freq: (props['freq'] as number | undefined) ?? 1.5,
            t: Math.random() * 10,
          });
          break;
        }
        case 'spikes': {
          const w = Math.max(1, Math.floor((props['w'] as number | undefined) ?? 1));
          const h = Math.max(1, Math.floor((props['h'] as number | undefined) ?? 1));
          const variant = ((props['variant'] as string | undefined) ?? 'spikes') as string;
          for (let dx = 0; dx < w; dx++) {
            for (let dy = 0; dy < h; dy++) {
              this.addHazard(hazards, spikes, variant, cx + dx * T, cy + dy * T);
            }
          }
          break;
        }
        case 'checkpoint': {
          const spr = checkpoints.create(cx, (e.y + 1) * T, CHECKPOINT.off.key) as Phaser.Physics.Arcade.Image;
          spr.setOrigin(0.5, 1);
          spr.refreshBody();
          spr.setData('active', false);
          this.checkpoints.push(spr);
          break;
        }
        case 'platform': {
          const axis = (props['axis'] as string | undefined) ?? 'x';
          if (axis === 'fall') {
            const spr = this.physics.add.sprite(cx, cy, PLATFORMS.faller.key, 0);
            spr.setDisplaySize(64, 10);
            const b = spr.body as Phaser.Physics.Arcade.Body;
            b.setAllowGravity(false);
            b.setImmovable(true);
            b.setSize(64, 10);
            this.fallers.push({ spr, homeX: cx, homeY: cy, state: 'idle', timer: 0, jitter: Math.random() * 10 });
          } else {
            const spr = this.physics.add.sprite(cx, cy, PLATFORMS.mover.key, 0);
            spr.setDisplaySize(64, 8);
            const b = spr.body as Phaser.Physics.Arcade.Body;
            b.setAllowGravity(false);
            b.setImmovable(true);
            b.setSize(64, 8);
            this.movers.push({
              spr,
              homeX: cx,
              rangePx: (((props['range'] as number | undefined) ?? 3) * T),
              dir: 1,
              speed: (props['speed'] as number | undefined) ?? 50,
              prevX: cx,
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

    // --- Player ---
    this.player = this.physics.add.sprite(this.startX, this.startY, this.playerSkin.idle.key, 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(14, 26);
    this.makeAnims();

    const moverSprites = this.movers.map((m) => m.spr);
    const fallerSprites = this.fallers.map((f) => f.spr);
    this.physics.add.collider(this.player, solids);
    this.physics.add.collider(this.player, moverSprites);
    this.physics.add.collider(this.player, fallerSprites);
    for (const w of this.walkers) this.physics.add.collider(w.spr, solids);
    for (const w of this.walkers) {
      this.physics.add.collider(w.spr, moverSprites);
      this.physics.add.collider(w.spr, fallerSprites);
    }
    this.physics.add.collider(this.player, items, (_p, obj) => {
      const go = obj as Phaser.GameObjects.GameObject;
      const isFruit = go.getData?.('fruit') === true;
      go.destroy();
      if (isFruit) {
        if (this.hp < FEEL.maxHp) {
          this.hp++;
          this.showMsg('+1 ❤');
        } else {
          this.showMsg('¡Ñam!');
        }
        this.refreshHud();
        return;
      }
      this.gems++;
      this.refreshHud();
      this.showMsg(this.gems >= this.gemsTotal ? '¡Salida abierta!' : '¡Gema!');
      if (this.gems >= this.gemsTotal) this.openExit();
    });
    const hurt = () => this.damage(1, this.player.x - 8);
    this.physics.add.overlap(this.player, spikes, () => this.damage(1, this.player.x));
    this.physics.add.overlap(this.player, hazards, (_p, obj) => {
      const go = obj as Phaser.GameObjects.GameObject;
      if (go.getData?.('trampoline') === true) {
        this.bounce(go);
        return;
      }
      this.damage(1, this.player.x);
    });
    for (const w of this.walkers) this.physics.add.overlap(this.player, w.spr, () => hurt());
    for (const f of this.flyers) this.physics.add.overlap(this.player, f.spr, () => hurt());
    for (const c of this.checkpoints) {
      this.physics.add.overlap(this.player, c, () => this.activateCheckpoint(c));
    }

    // --- Camara + HUD ---
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudGems = this.add.text(12, 8, '', { fontSize: '16px', color: '#223322' }).setScrollFactor(0);
    this.hudHp = this.add.text(12, 30, '', { fontSize: '16px', color: '#223322' }).setScrollFactor(0);
    this.msg = this.add
      .text(240, 40, '', { fontSize: '16px', color: '#223322', align: 'center' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.refreshHud();

    // --- Input ---
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.input.keyboard!.addCapture(['SPACE', 'UP']);
    bindTouch(
      () => {
        this.buffer = FEEL.jumpBuffer;
      },
      () => this.tryDash(),
    );
  }

  /** Obstáculo en (x,y): estático siempre; los animados con frames manuales. */
  private addHazard(
    hazards: Phaser.GameObjects.Group,
    spikes: Phaser.GameObjects.Group,
    variant: string,
    x: number,
    y: number,
  ): void {
    if (variant === 'spikes') {
      const s = spikes.create(x, y, 'spike') as Phaser.Physics.Arcade.Image;
      s.refreshBody();
      (s.body as Phaser.Physics.Arcade.Body).setSize(T, 10);
      (s.body as Phaser.Physics.Arcade.Body).setOffset(0, 6);
      return;
    }
    if (variant === 'trampoline') {
      const spr = hazards.create(x, y + 2, TRAMP_IDLE.key) as Phaser.Physics.Arcade.Image;
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
    if (def.tex) this.addLoop(spr, def.tex.key, def.tex.frames, def.id === 'arrow' ? 6 : 12);
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
    this.player.setVelocityY(-460);
    this.buffer = 0;
    this.djUsed = false;
    this.showMsg('¡Boing!');
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
    const tileX = Math.floor(c.x / T);
    const tileY = Math.floor(c.y / T);
    const p = this.snapToGround(tileX, tileY);
    this.startX = p.x;
    this.startY = p.y;
    this.showMsg('Checkpoint');
  }

  private makeAnims(): void {
    const A = this.anims;
    const ensure = (key: string, tex: string, end: number, rate: number, repeat = -1): void => {
      if (A.exists(key)) return;
      A.create({ key, frames: A.generateFrameNumbers(tex, { start: 0, end }), frameRate: rate, repeat });
    };
    for (const c of CHAR_SKINS) {
      ensure(`${c.id}-idle`, c.idle.key, c.idle.frames - 1, 10);
      ensure(`${c.id}-run`, c.run.key, c.run.frames - 1, 12);
      ensure(`${c.id}-jump`, c.jump.key, 0, 1, -1);
      ensure(`${c.id}-fall`, c.fall.key, 0, 1, -1);
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
    this.hudGems.setText(`💎 ${this.gems}/${this.gemsTotal}`);
    this.hudHp.setText('❤'.repeat(this.hp) + '🤍'.repeat(Math.max(0, FEEL.maxHp - this.hp)));
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
    this.showMsg('¡Salida abierta!');
  }

  private damage(amount: number, fromX: number): void {
    if (this.invuln > 0 || this.won) return;
    this.hp -= amount;
    this.refreshHud();
    if (this.hp <= 0) {
      this.respawn(true);
      return;
    }
    const away = this.player.x >= fromX ? 1 : -1;
    this.player.setVelocity(away * FEEL.knockbackX, -FEEL.knockbackY);
    this.invuln = FEEL.invulnTime;
    this.showMsg('¡Ay!');
  }

  private respawn(fullHeal: boolean): void {
    this.player.setPosition(this.startX, this.startY);
    this.player.setVelocity(0, 0);
    this.coyote = 0;
    this.buffer = 0;
    this.dashT = 0;
    if (fullHeal) {
      this.hp = FEEL.maxHp;
      this.refreshHud();
    }
    this.player.setAlpha(1);
    this.invuln = 0;
  }

  private tryDash(): void {
    if (this.dashCd <= 0 && this.dashT <= 0) {
      this.dashT = FEEL.dashTime;
    }
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

  /** Baja hasta 6 tiles buscando piso: devuelve centro del jugador apoyado. */
  private snapToGround(tx: number, ty: number): { x: number; y: number } {
    const level = this.currentLevel;
    for (let d = 0; d <= 6; d++) {
      if (level.tiles.some((t) => t.t === 'ground' && t.x === tx && t.y === ty + d)) {
        return { x: tx * T + T / 2, y: (ty + d) * T - 14 };
      }
    }
    return { x: tx * T + T / 2, y: ty * T + T / 2 };
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

    this.dashCd = Math.max(0, this.dashCd - delta);
    const left = this.cursors.left.isDown || touchState.left;
    const right = this.cursors.right.isDown || touchState.right;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) this.facing = dir;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.buffer = FEEL.jumpBuffer;
    }

    // Dash (J o boton B).
    if (Phaser.Input.Keyboard.JustDown(this.keyJ)) this.tryDash();
    if (this.dashT > 0) {
      if (this.dashCd <= 0) this.dashCd = FEEL.dashCooldown;
      this.dashT -= delta;
      this.player.setVelocity(this.facing * FEEL.dashSpeed, 0);
    } else {
      this.player.setVelocityX(dir * FEEL.speed);
      if (!onFloor) {
        this.coyote -= delta;
      } else {
        this.coyote = FEEL.coyoteTime;
        this.djUsed = false;
      }
      this.buffer -= delta;
      if (this.buffer > 0 && (this.coyote > 0 || onFloor)) {
        this.player.setVelocityY(-FEEL.jumpVelocity);
        this.buffer = 0;
        this.coyote = 0;
        this.dashT = 0;
      } else if (this.buffer > 0 && !this.djUsed && !onFloor) {
        this.player.setVelocityY(-FEEL.jumpVelocity * FEEL.doubleJumpMult);
        this.buffer = 0;
        this.djUsed = true;
        this.dashT = 0;
      }
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
      w.spr.setFlipX(w.dir < 0);
    }

    // Flyers: seno.
    for (const f of this.flyers) {
      f.t += delta;
      f.spr.setPosition(f.baseX, f.baseY + Math.sin(f.t * f.freq * Math.PI * 2) * f.ampPx);
    }

    // Plataformas móviles: cinemáticas (posición, no velocidad) + arrastre exacto.
    for (const m of this.movers) {
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

    // Caida al vacio.
    if (this.player.y > this.killY) this.respawn(false);

    // Salida.
    if (this.exitZone && !this.won) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitZone.x, this.exitZone.y);
      if (d < 30) {
        if (this.exitZone.open) {
          this.won = true;
          this.showMsg(
            this.fromEditor ? '¡Nivel completo! R rejugar · E editor' : '¡Nivel completo! R para rejugar',
          );
        } else {
          this.showMsg(`Faltan ${this.gemsTotal - this.gems} gemas`);
        }
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
