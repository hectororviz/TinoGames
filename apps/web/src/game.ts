import Phaser from 'phaser';
import { assertValidLevel } from '@tinogames/level-schema';
import type { Level } from '@tinogames/level-schema';
import sampleLevel from '@tinogames/level-schema/levels/sample-level-1.json';
import { FEEL } from './feel.js';
import { bindTouch, touchState } from './input.js';
import pinkUrl from '../../../assets/pink.png?url';
import appleUrl from '../../../assets/Apple.png?url';
import strawberryUrl from '../../../assets/Strawberry.png?url';
import tilesPaUrl from '../../../assets/tiles_pa.png?url';
import vendorSpikeUrl from '../../../assets/vendor_pa_spike.png?url';

const T = FEEL.tile;

interface Walker {
  spr: Phaser.Physics.Arcade.Sprite;
  homeX: number;
  rangePx: number;
  dir: number;
  speed: number;
}

interface Flyer {
  spr: Phaser.Physics.Arcade.Sprite;
  baseX: number;
  baseY: number;
  ampPx: number;
  freq: number;
  t: number;
}

function tileKey(texture: string, x: number, y: number): string {
  return `${texture}:${x},${y}`;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private hp = FEEL.maxHp;
  private fruits = 0;
  private fruitsTotal = 0;
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
  private walkers: Walker[] = [];
  private flyers: Flyer[] = [];
  private exitZone: { spr: Phaser.GameObjects.Image; open: boolean; x: number; y: number } | null = null;
  private hudFruits!: Phaser.GameObjects.Text;
  private hudHp!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private msgTimer = 0;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.spritesheet('pink', pinkUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('apple', appleUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('strawberry', strawberryUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('tile', tilesPaUrl, { frameWidth: 16, frameHeight: 16 });
    this.load.image('spike', vendorSpikeUrl);
  }

  private currentLevel!: Level;
  private fromEditor = false;
  private keyE!: Phaser.Input.Keyboard.Key;

  create(data?: { level?: Level; fromEditor?: boolean }): void {
    document.body.classList.add('playing');
    document.body.classList.remove('editing');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('playing', 'from-editor');
    });
    const level = data?.level ?? sampleLevel as Level;
    this.currentLevel = level;
    this.fromEditor = data?.fromEditor ?? false;
    document.body.classList.toggle('from-editor', this.fromEditor);
    const backBtn = document.getElementById('game-back');
    if (backBtn) {
      backBtn.onclick = () => {
        this.scene.start('editor');
      };
    }
    assertValidLevel(level);
    this.walkers = [];
    this.flyers = [];
    this.hp = FEEL.maxHp;
    this.fruits = 0;
    this.won = false;

    this.makeTextures();
    this.cameras.main.setBackgroundColor('#87b5e8');

    // --- Solidos ---
    const solids = this.physics.add.staticGroup();
    let maxX = 0;
    let maxY = 0;
    for (const t of level.tiles) {
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
      if (t.t === 'ground') {
        const img = solids.create(t.x * T + T / 2, t.y * T + T / 2, 'tile', 0) as Phaser.Physics.Arcade.Image;
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
    const items = this.physics.add.staticGroup();
    const spikes = this.physics.add.staticGroup();
    let itemIdx = 0;
    for (const e of level.entities) {
      const cx = e.x * T + T / 2;
      const cy = e.y * T + T / 2;
      switch (e.kind) {
        case 'player_start': {
          this.startX = cx;
          // El body mide 18x28 (mitad 14px): spawnear al centro del tile deja
          // los pies 6px dentro del piso. Se apoya 1px arriba del solido.
          const floorBelow = level.tiles.some((t) => t.t === 'ground' && t.x === e.x && t.y === e.y + 1);
          this.startY = floorBelow ? (e.y + 1) * T - 15 : cy;
          break;
        }
        case 'item': {
          const tex = itemIdx % 2 === 0 ? 'apple' : 'strawberry';
          itemIdx++;
          const spr = items.create(cx, cy, tex, 0) as Phaser.Physics.Arcade.Image;
          spr.refreshBody();
          spr.setData('baseY', cy);
          spr.setData('phase', (cx % 10) * 0.35);
          break;
        }
        case 'walker': {
          const props = (e.props ?? {}) as { range?: number; speed?: number };
          const spr = this.physics.add.sprite(cx, cy, 'walker');
          spr.setCollideWorldBounds(false);
          this.walkers.push({
            spr,
            homeX: cx,
            rangePx: (props.range ?? 4) * T,
            dir: 1,
            speed: props.speed ?? FEEL.walkerSpeed,
          });
          break;
        }
        case 'flyer': {
          const props = (e.props ?? {}) as { amp?: number; freq?: number };
          const spr = this.physics.add.sprite(cx, cy, 'flyer');
          (spr.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          (spr.body as Phaser.Physics.Arcade.Body).setImmovable(true);
          this.flyers.push({
            spr,
            baseX: cx,
            baseY: cy,
            ampPx: (props.amp ?? 2) * T,
            freq: props.freq ?? 1.5,
            t: Math.random() * 10,
          });
          break;
        }
        case 'spikes': {
          const props = (e.props ?? {}) as { w?: number; h?: number };
          const w = Math.max(1, Math.floor(props.w ?? 1));
          const h = Math.max(1, Math.floor(props.h ?? 1));
          for (let dx = 0; dx < w; dx++) {
            for (let dy = 0; dy < h; dy++) {
              const s = spikes.create(cx + dx * T, cy + dy * T, 'spike') as Phaser.Physics.Arcade.Image;
              s.refreshBody();
              (s.body as Phaser.Physics.Arcade.Body).setSize(T, 10);
              (s.body as Phaser.Physics.Arcade.Body).setOffset(0, 6);
            }
          }
          break;
        }
        case 'exit': {
          const spr = this.add.image(cx, cy, 'exit-locked');
          this.exitZone = { spr, open: false, x: cx, y: cy };
          break;
        }
        default:
          break;
      }
    }
    this.fruitsTotal = itemIdx;

    // --- Player ---
    this.player = this.physics.add.sprite(this.startX, this.startY, 'pink', 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(18, 28);
    this.anims.create({ key: 'idle', frames: [{ key: 'pink', frame: 0 }], frameRate: 1, repeat: -1 });
    this.anims.create({ key: 'run', frames: [{ key: 'pink', frame: 1 }, { key: 'pink', frame: 2 }], frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'jump', frames: [{ key: 'pink', frame: 3 }], frameRate: 1, repeat: -1 });
    this.anims.create({ key: 'fall', frames: [{ key: 'pink', frame: 4 }], frameRate: 1, repeat: -1 });

    this.physics.add.collider(this.player, solids);
    for (const w of this.walkers) this.physics.add.collider(w.spr, solids);
    this.physics.add.collider(this.player, items, (_p, obj) => {
      obj.destroy();
      this.fruits++;
      this.refreshHud();
      this.showMsg('¡Item!');
      if (this.fruits >= this.fruitsTotal) this.openExit();
    });
    const hurt = () => this.damage(1, this.player.x - 8);
    this.physics.add.overlap(this.player, spikes, () => this.damage(1, this.player.x));
    for (const w of this.walkers) this.physics.add.overlap(this.player, w.spr, () => hurt());
    for (const f of this.flyers) this.physics.add.overlap(this.player, f.spr, () => hurt());

    // --- Camara + HUD ---
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudFruits = this.add.text(12, 8, '', { fontSize: '16px', color: '#223322' }).setScrollFactor(0);
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

  private makeTextures(): void {
    if (!this.textures.exists('walker')) {
      const g = this.add.graphics();
      g.fillStyle(0xcc3333, 1).fillRect(0, 0, 28, 28);
      g.fillStyle(0xffffff, 1).fillCircle(8, 10, 4);
      g.fillStyle(0xffffff, 1).fillCircle(20, 10, 4);
      g.fillStyle(0x000000, 1).fillCircle(9, 11, 2);
      g.fillStyle(0x000000, 1).fillCircle(21, 11, 2);
      g.generateTexture('walker', 28, 28);
      g.clear();
      g.fillStyle(0x3388ff, 1).fillCircle(16, 16, 12);
      g.fillStyle(0xffffff, 1).fillCircle(16, 16, 6);
      g.generateTexture('flyer', 32, 32);
      g.clear();
      g.fillStyle(0x555566, 1).fillRect(0, 0, 16, 32);
      g.fillStyle(0x888899, 1).fillRect(0, 0, 16, 4);
      g.generateTexture('exit-locked', 16, 32);
      g.clear();
      g.fillStyle(0xc084fc, 1).fillRect(0, 0, 16, 32);
      g.fillStyle(0xe9d5ff, 1).fillRect(0, 0, 16, 4);
      g.generateTexture('exit-open', 16, 32);
      g.destroy();
    }
  }

  private refreshHud(): void {
    this.hudFruits.setText(`Items: ${this.fruits}/${this.fruitsTotal}`);
    this.hudHp.setText('❤'.repeat(this.hp) + '🤍'.repeat(Math.max(0, FEEL.maxHp - this.hp)));
  }

  private showMsg(text: string): void {
    this.msg.setText(text);
    this.msgTimer = 2.5;
  }

  private openExit(): void {
    if (this.exitZone) {
      this.exitZone.open = true;
      this.exitZone.spr.setTexture('exit-open');
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

  override update(_time: number, deltaMs: number): void {
    const delta = Math.min(deltaMs / 1000, 0.05);
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.scene.restart({ level: this.currentLevel, fromEditor: this.fromEditor });
      return;
    }
    if (this.fromEditor && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.scene.start('editor');
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

    // Walkers: patrulla.
    for (const w of this.walkers) {
      w.spr.setVelocityX(w.dir * w.speed);
      if (Math.abs(w.spr.x - w.homeX) > w.rangePx) w.dir *= -1;
      const wb = w.spr.body as Phaser.Physics.Arcade.Body;
      if (wb.blocked.left) w.dir = 1;
      if (wb.blocked.right) w.dir = -1;
    }

    // Flyers: seno.
    for (const f of this.flyers) {
      f.t += delta;
      f.spr.setPosition(f.baseX, f.baseY + Math.sin(f.t * f.freq * Math.PI * 2) * f.ampPx);
    }

    // Items: flote (data guardada en cada sprite).
    for (const obj of this.children.list) {
      const img = obj as Phaser.GameObjects.Image;
      if (img.active && img.data && img.texture && (img.texture.key === 'apple' || img.texture.key === 'strawberry')) {
        const baseY = img.getData('baseY') as number;
        const phase = img.getData('phase') as number;
        img.y = baseY + Math.sin(this.time.now / 1000 + phase) * FEEL.itemFloatAmp;
      }
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
      if (d < 24) {
        if (this.exitZone.open) {
          this.won = true;
          this.showMsg(
            this.fromEditor ? '¡Nivel completo! R rejugar · E editor' : '¡Nivel completo! R para rejugar',
          );
        } else {
          this.showMsg(`Faltan ${this.fruitsTotal - this.fruits} items`);
        }
      }
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= delta;
      if (this.msgTimer <= 0) this.msg.setText('');
    }

    // Anims.
    this.player.setFlipX(this.facing < 0);
    if (!onFloor) {
      this.player.play(body.velocity.y < 0 ? 'jump' : 'fall', true);
    } else if (Math.abs(body.velocity.x) > 10) {
      this.player.play('run', true);
    } else {
      this.player.play('idle', true);
    }
  }
}
