import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import type { Entity, Level } from '@tinogames/level-schema';
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
  POWERUP_CONTENTS,
  TILES_BASE,
  TILES_EXTRA,
  TRAMP_IDLE,
  powerupLook,
  type SheetDef,
} from './catalog.js';
import { blankLevel, cloneLevel } from './levels.js';
import { PISO_GROUPS, type PisoGroup } from './piso-groups.js';
import type { EditorData } from './levels.js';
import { getToken, publishLevel, updateRemoteLevel, deleteRemoteLevel } from './api.js';

const T = 16;
/** Distancia en px de pantalla para distinguir click (pintar) de drag (pan). */
const DRAG_THRESHOLD = 6;
/** Variantes de piso: 0-9 plancha base, 10-251 plancha extendida. */
const TILE_VARIANTS = 252;
const TERRAIN_COLS = 22;

type Tool =
  | 'ground'
  | 'player_start'
  | 'enemy'
  | 'gem'
  | 'checkpoint'
  | 'platform'
  | 'spikes'
  | 'powerup'
  | 'brick'
  | 'pipe'
  | 'link'
  | 'exit'
  | 'erase'
  | 'hand';

type RailCat = 'piso' | 'personaje' | 'enemigos' | 'gemas' | 'obstaculos' | 'fondo' | 'otros';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export class EditorScene extends Phaser.Scene {
  private level!: Level;
  private remoteId: string | undefined;
  private pendingName = '';
  private pendingPin = '';
  private dirty = false;
  private tool: Tool | null = 'ground';
  private tileVariant = 0;
  private playerSkin = 'tux';
  private enemySkin = 'pig';
  private gemColor = 'purple';
  private platformAxis: 'x' | 'y' | 'fall' = 'x';
  private selected: Entity | null = null;
  private obstacle = 'spikes';
  private powerSkin = 'box1';
  private powerContains = 'mushroom';
  private pipeDir = 'up';
  private linkFirst: Entity | null = null;
  /** Auto-borde de piso: elige la variante según vecinos (toggle en topbar). */
  private autoEdge = true;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private guideGraphics!: Phaser.GameObjects.Graphics;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  private bgObjs: Phaser.GameObjects.GameObject[] = [];
  private bgLayers: { ts: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private ghost!: Phaser.GameObjects.Image;
  private ghostRect!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.GameObject[] = [];
  private lastGridKey = '';
  private painting = false;
  private panning = false;
  private downX = 0;
  private downY = 0;
  private lastPaintKey = '';
  private erasing = false;
  private hoverX = -1;
  private hoverY = -1;
  private spaceDown = false;
  private pinchDist = 0;
  private past: Level[] = [];
  private future: Level[] = [];
  private strokeSnapshot: Level | null = null;

  constructor() {
    super('editor');
  }

  create(data?: EditorData): void {
    document.body.classList.add('editing');
    document.body.classList.remove('playing');
    document.getElementById('touch')!.style.display = '';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('editing');
    });
    if (data?.draft) {
      this.level = cloneLevel(data.draft);
      this.remoteId = data.remoteId;
      this.pendingName = data.name ?? '';
    } else {
      this.level = blankLevel();
      this.remoteId = undefined;
      this.pendingName = '';
    }
    this.pendingPin = '';
    this.dirty = false;
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.lastGridKey = '';
    this.painting = false;
    this.panning = false;
    this.loadSprites();
  }

  override update(): void {
    this.drawGrid();
    if (this.bgLayers.length > 0 && this.cameras.main) {
      const sx = this.cameras.main.scrollX;
      for (const l of this.bgLayers) l.ts.tilePositionX = sx * l.factor;
    }
    if (this.cameras.main) this.clampCamera();
  }

  private loadSprites(): void {
    const sheets: SheetDef[] = [
      { key: 'tile', url: TILES_BASE.url, fw: 16, fh: 16, frames: 10 },
      { key: 'terrain', url: TILES_EXTRA.url, fw: 16, fh: 16, frames: 242 },
      ...CHAR_SKINS.flatMap((c) => [c.idle]),
      ...FRUIT_SHEETS,
      ...ENEMIES.map((e) => e.tex),
      ...OBSTACLES.flatMap((o) => (o.tex ? [o.tex] : [])),
      CHECKPOINT.on,
      PLATFORMS.mover,
      PLATFORMS.faller,
    ];
    for (const s of sheets) {
      this.load.spritesheet(s.key, s.url, { frameWidth: s.fw, frameHeight: s.fh });
    }
    this.load.image('spike', OBSTACLES[0].image!.url);
    this.load.image('rock', OBSTACLES.find((o) => o.id === 'rock')!.image!.url);
    this.load.image('spikehead', OBSTACLES.find((o) => o.id === 'spikehead')!.image!.url);
    this.load.image(TRAMP_IDLE.key, TRAMP_IDLE.url);
    for (const g of COINS) this.load.image(g.key, g.url);
    for (const b of BIOMES) {
      for (const l of b.layers) this.load.image(l.key, l.url);
    }
    this.load.image(PIPE.rim.key, PIPE.rim.url);
    this.load.image(PIPE.body.key, PIPE.body.url);
    this.load.image(CHECKPOINT.off.key, CHECKPOINT.off.url);
    this.load.image(EXIT_DOOR.idle.key, EXIT_DOOR.idle.url);
    for (const d of DECOS) this.load.image(d.key, d.url);
    this.load.image(BG_BLUE.key, BG_BLUE.url);
    this.load.once('complete', () => {
      this.makeTextures();
      this.setupScene();
    });
    this.load.start();
  }

  private makeTextures(): void {
    // La salida sigue generada. En revisitas ya existe.
    if (this.textures.exists('exit')) return;
    const g = this.add.graphics();
    g.fillStyle(0xc084fc, 1).fillRect(0, 0, 16, 32);
    g.fillStyle(0xe9d5ff, 1).fillRect(0, 0, 16, 4);
    g.generateTexture('exit', 16, 32);
    g.destroy();
  }

  private setupScene(): void {
    this.gridGraphics = this.add.graphics();
    this.guideGraphics = this.add.graphics().setDepth(90);
    this.boundsGraphics = this.add.graphics().setDepth(80);
    this.ghost = this.add.image(0, 0, 'tile', 0).setAlpha(0.5).setDepth(100).setVisible(false);
    this.ghostRect = this.add.graphics().setDepth(100).setVisible(false);
    this.buildThumbs();
    this.centerCamera();
    this.renderBackground();
    this.renderLevel();
    this.bindUi();
    this.setupInput();
    this.updateStatus();
  }

  /** Rectángulo del nivel en tiles (lo pintado + margen de aire). */
  private levelBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of this.level.tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
    }
    for (const e of this.level.entities) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x);
      maxY = Math.max(maxY, e.y);
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 29, maxY: 15 };
    return { minX, minY, maxX, maxY };
  }

  /** Fondo del bioma en vivo (igual que en juego) + velo oscuro para legibilidad. */
  private renderBackground(): void {
    for (const o of this.bgObjs) o.destroy();
    this.bgObjs = [];
    this.bgLayers = [];
    const biome = BIOMES.find((b) => b.id === this.level.bg) ?? BIOMES.find((b) => b.id === 'blue')!;
    for (const l of biome.layers) {
      let obj: Phaser.GameObjects.GameObject;
      if (l.factor === 0 && l.anchor === 'fill' && l.h === 64) {
        obj = this.add.tileSprite(240, 135, 480, 270, l.key).setScrollFactor(0).setDepth(-10);
      } else if (l.factor === 0) {
        obj = this.add.image(240, 135, l.key).setScrollFactor(0).setDepth(-10).setDisplaySize(480, 270);
      } else {
        const y = l.anchor === 'top' ? l.h / 2 : 270 - l.h / 2;
        const ts = this.add.tileSprite(240, y, 480, l.h, l.key).setScrollFactor(0).setDepth(-10);
        if (l.anchor === 'fill') {
          const src = this.textures.get(l.key).getSourceImage() as { width: number; height: number };
          ts.setTileScale(480 / src.width, 270 / src.height);
        }
        this.bgLayers.push({ ts, factor: l.factor });
        obj = ts;
      }
      this.bgObjs.push(obj);
    }
    // Velo para que grilla y sprites se lean sobre biomas claros.
    const veil = this.add
      .rectangle(240, 135, 480, 270, 0x0a0a18, 0.3)
      .setScrollFactor(0)
      .setDepth(-9);
    this.bgObjs.push(veil);
  }

  /** No deja perder la cámara fuera del nivel + margen. */
  private clampCamera(): void {
    const cam = this.cameras.main;
    const b = this.levelBounds();
    const M = 20 * T;
    const minCX = b.minX * T - M;
    const maxCX = (b.maxX + 1) * T + M;
    const minCY = Math.min(0, b.minY * T) - M;
    const maxCY = (b.maxY + 1) * T + M;
    const viewW = this.scale.width / cam.zoom;
    const viewH = this.scale.height / cam.zoom;
    const clampAxis = (scroll: number, view: number, lo: number, hi: number): number => {
      if (hi - lo <= view) return (lo + hi) / 2 - view / 2;
      return Phaser.Math.Clamp(scroll, lo - view / 2, hi - view / 2);
    };
    cam.scrollX = clampAxis(cam.scrollX, viewW, minCX, maxCX);
    cam.scrollY = clampAxis(cam.scrollY, viewH, minCY, maxCY);
  }

  private centerCamera(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of this.level.tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
    }
    for (const e of this.level.entities) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x);
      maxY = Math.max(maxY, e.y);
    }
    if (minX === Infinity) {
      this.cameras.main.centerOn(15 * T, 8 * T);
    } else {
      this.cameras.main.centerOn(((minX + maxX + 1) / 2) * T, ((minY + maxY + 1) / 2) * T);
    }
  }

  /** Guarda en el servidor (requiere sesión). Devuelve el PIN. */
  private async saveLevel(): Promise<string> {
    if (!getToken()) throw new Error('Entrá con tu cuenta para guardar');
    const name = (document.getElementById('ed-name') as HTMLInputElement | null)?.value ?? '';
    const clean = name.trim();
    if (!clean) throw new Error('Poné un nombre al nivel');
    this.pendingName = clean;
    this.syncNameInput();
    const out = this.remoteId
      ? await updateRemoteLevel(this.remoteId, clean, this.level)
      : await publishLevel(clean, this.level);
    this.remoteId = out.id;
    this.pendingPin = out.pin;
    this.dirty = false;
    return out.pin;
  }

  private syncNameInput(): void {
    const input = document.getElementById('ed-name') as HTMLInputElement | null;
    if (input) input.value = this.pendingName;
  }

  private confirmDiscard(): boolean {
    if (!this.dirty) return true;
    return confirm('Cambios sin guardar. ¿Seguir igual?');
  }

  private pushHistory(): void {
    this.past.push(cloneLevel(this.level));
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }

  private restore(level: Level): void {
    this.level = cloneLevel(level);
    this.dirty = true;
    this.lastPaintKey = '';
    this.selected = null;
    this.hideProps();
    this.renderLevel();
    this.updateStatus();
  }

  private undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(cloneLevel(this.level));
    this.restore(prev);
  }

  private redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(cloneLevel(this.level));
    if (this.past.length > 60) this.past.shift();
    this.restore(next);
  }

  private setTool(tool: Tool | null): void {
    this.tool = tool;
    this.selected = null;
    this.hideProps();
    this.refreshRail();
  }

  /** Clic con la mano (sin arrastrar): selecciona la entidad para el inspector. */
  private selectAt(x: number, y: number): void {
    this.selected = this.entityAt(x, y);
    this.renderProps();
    this.renderLevel();
  }

  private hideProps(): void {
    const panel = document.getElementById('ed-props');
    if (panel) panel.hidden = true;
  }

  private propsOf(e: Entity): Record<string, unknown> {
    if (!e.props || typeof e.props !== 'object') e.props = {};
    return e.props as Record<string, unknown>;
  }

  /** Aplica un cambio de propiedad con undo. */
  private setProp(mut: (p: Record<string, unknown>) => void): void {
    if (!this.selected || !this.level.entities.includes(this.selected)) return;
    this.pushHistory();
    mut(this.propsOf(this.selected));
    this.dirty = true;
    this.renderLevel();
    this.updateStatus();
  }

  private numField(
    host: HTMLElement, label: string, value: number,
    min: number, max: number, step: number,
    set: (v: number) => void,
  ): void {
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.onchange = () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      set(Math.min(max, Math.max(min, v)));
    };
    lab.appendChild(input);
    host.appendChild(lab);
  }

  private selectField(
    host: HTMLElement, label: string, value: string,
    options: { id: string; label: string }[],
    set: (v: string) => void,
  ): void {
    const lab = document.createElement('label');
    lab.textContent = label;
    const sel = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    sel.value = value;
    sel.onchange = () => set(sel.value);
    lab.appendChild(sel);
    host.appendChild(lab);
  }

  private deleteSelected(): void {
    const e = this.selected;
    if (!e || !this.level.entities.includes(e)) return;
    this.pushHistory();
    if (e.kind === 'pipe') {
      const pid = (e.props as { pid?: unknown } | undefined)?.pid;
      if (typeof pid === 'string' && pid) this.clearLinksTo(pid);
    }
    this.level.entities = this.level.entities.filter((o) => o !== e);
    if (this.linkFirst === e) this.linkFirst = null;
    this.selected = null;
    this.dirty = true;
    this.hideProps();
    this.renderLevel();
    this.updateStatus();
  }

  /** Nombre legible para el inspector (el kind técnico confunde). */
  private friendlyKind(e: Entity): string {
    const p = (e.props ?? {}) as Record<string, unknown>;
    switch (e.kind) {
      case 'player_start': return 'Personaje';
      case 'walker':
      case 'flyer':
        return (ENEMIES.find((x) => x.id === p['skin']) ?? ENEMIES[0]).label;
      case 'fruit': return 'Hongo (nivel viejo: sale solo de cajas)';
      case 'item': return 'Item (nivel viejo)';
      case 'gem': return `Moneda ${(COINS.find((g) => g.id === p['color']) ?? COINS[0]).label}`;
      case 'platform':
        return p['axis'] === 'fall' ? 'Plataforma que cae' : 'Plataforma móvil';
      case 'spikes': {
        const v = typeof p['variant'] === 'string' ? p['variant'] : 'spikes';
        return (OBSTACLES.find((o) => o.id === v) ?? OBSTACLES[0]).label;
      }
      case 'powerup': {
        const has = (POWERUP_CONTENTS.find((c) => c.id === p['contains']) ?? POWERUP_CONTENTS[0]).label;
        return `Caja ? (${has})`;
      }
      case 'brick': return 'Ladrillo';
      case 'pipe': return 'Tubería';
      case 'checkpoint': return 'Checkpoint';
      case 'deco': return 'Decoración';
      case 'exit': return 'Salida';
      default: return e.kind;
    }
  }

  /** Inspector de propiedades de la entidad seleccionada. */
  private renderProps(): void {
    const panel = document.getElementById('ed-props');
    if (!panel) return;
    const e = this.selected && this.level.entities.includes(this.selected) ? this.selected : null;
    if (!e) {
      this.selected = null;
      panel.hidden = true;
      return;
    }
    this.selected = e;
    panel.hidden = false;
    panel.textContent = '';
    const title = document.createElement('h3');
    title.textContent = `${this.friendlyKind(e)} (${e.x},${e.y})`;
    panel.appendChild(title);
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:#aaaacc;margin:-4px 0 8px;';
    sub.textContent = 'Propiedades del sprite seleccionado';
    panel.appendChild(sub);
    const p = this.propsOf(e);
    const num = (k: string, dflt: number, min: number, max: number, step = 1): void => {
      this.numField(panel, k, typeof p[k] === 'number' ? (p[k] as number) : dflt, min, max, step, (v) => {
        this.setProp((pp) => {
          pp[k] = v;
        });
      });
    };
    switch (e.kind) {
      case 'walker':
      case 'flyer':
        num('range', 4, 0, 20);
        num('speed', 40, 0, 200);
        break;
      case 'platform':
        this.selectField(panel, 'axis', typeof p['axis'] === 'string' ? (p['axis'] as string) : 'x', [
          { id: 'x', label: 'Horizontal →' },
          { id: 'y', label: 'Vertical ↕' },
          { id: 'fall', label: 'Se cae' },
        ], (v) => {
          this.setProp((pp) => {
            pp['axis'] = v;
          });
        });
        num('range', 3, 0, 20);
        num('speed', 50, 10, 200);
        break;
      case 'spikes': {
        num('w', 1, 1, 12);
        num('h', 1, 1, 12);
        break;
      }
      case 'pipe': {
        num('w', 2, 1, 8);
        num('h', 2, 1, 8);
        this.selectField(panel, 'dir', typeof p['dir'] === 'string' ? (p['dir'] as string) : 'up', [
          { id: 'up', label: 'Boca ↑' },
          { id: 'down', label: 'Boca ↓' },
          { id: 'left', label: 'Boca ←' },
          { id: 'right', label: 'Boca →' },
        ], (v) => {
          this.setProp((pp) => {
            pp['dir'] = v;
          });
        });
        const ids = document.createElement('div');
        ids.style.cssText = 'font-size:12px;color:#aaaacc;margin-bottom:8px;';
        ids.textContent = `${String(p['pid'] ?? '?')} → ${String(p['target'] ?? 'tapada')}`;
        panel.appendChild(ids);
        break;
      }
      case 'fruit':
        this.selectField(panel, 'skin', typeof p['skin'] === 'string' ? (p['skin'] as string) : 'bananas',
          FRUITS.map((f) => ({ id: f.id, label: f.label })), (v) => {
            this.setProp((pp) => {
              pp['skin'] = v;
            });
          });
        break;
      case 'gem':
        this.selectField(panel, 'color', typeof p['color'] === 'string' ? (p['color'] as string) : 'purple',
          COINS.map((g) => ({ id: g.id, label: `Moneda ${g.label}` })), (v) => {
            this.setProp((pp) => {
              pp['color'] = v;
            });
          });
        break;
      case 'player_start':
        this.selectField(panel, 'skin', typeof p['skin'] === 'string' ? (p['skin'] as string) : 'tux',
          CHAR_SKINS.map((c) => ({ id: c.id, label: c.label })), (v) => {
            this.setProp((pp) => {
              pp['skin'] = v;
            });
          });
        break;
      case 'powerup':
        this.selectField(panel, 'Caja', typeof p['skin'] === 'string' ? (p['skin'] as string) : 'box1',
          POWERUPS.map((d) => ({ id: d.id, label: d.label })), (v) => {
            this.powerSkin = v;
            this.setProp((pp) => {
              pp['skin'] = v;
            });
          });
        this.selectField(panel, 'Contiene', typeof p['contains'] === 'string' ? (p['contains'] as string) : 'mushroom',
          POWERUP_CONTENTS.map((c) => ({ id: c.id, label: c.label })), (v) => {
            this.powerContains = v;
            this.setProp((pp) => {
              pp['contains'] = v;
            });
          });
        {
          // Vista previa del contenido elegido (placeholder con arte existente).
          const look = powerupLook(typeof p['contains'] === 'string' ? (p['contains'] as string) : 'mushroom');
          const prev = document.createElement('div');
          prev.style.cssText = 'width:44px;height:44px;background-size:contain;background-repeat:no-repeat;background-position:center;margin:4px 0;';
          const thumb = this.thumbFor(look.key, look.url, look.fw, look.fh, look.frames);
          prev.style.backgroundImage = thumb['backgroundImage'];
          prev.title = (POWERUP_CONTENTS.find((c) => c.id === p['contains']) ?? POWERUP_CONTENTS[0]).label;
          panel.appendChild(prev);
        }
        break;
      default:
        break;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'Borrar';
    del.onclick = () => this.deleteSelected();
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Cerrar';
    close.onclick = () => {
      this.selected = null;
      this.hideProps();
      this.renderLevel();
    };
    row.append(del, close);
    panel.appendChild(row);
  }

  /** Fantasma del objeto actual bajo el cursor. */
  private updateGhost(tileX: number, tileY: number): void {
    if (tileX < 0 || tileY < 0) {
      this.ghost.setVisible(false);
      this.ghostRect.setVisible(false);
      return;
    }
    if (this.tool === 'erase' || this.erasing) {
      this.ghost.setVisible(false);
      this.ghostRect.clear();
      this.ghostRect.lineStyle(2, 0xff5555, 0.9);
      this.ghostRect.strokeRect(tileX * T, tileY * T, T, T);
      this.ghostRect.setVisible(true);
      return;
    }
    this.ghostRect.setVisible(false);
    if (this.tool === 'ground') {
      const v = this.tileVariant;
      const [tex, frame]: [string, number] = v < 10 ? ['tile', v] : ['terrain', v - 10];
      this.ghost.setTexture(tex, frame).setOrigin(0, 0).setScale(1);
      this.ghost.setPosition(tileX * T, tileY * T);
      this.ghost.setVisible(true);
      return;
    }
    const sel = this.currentSelection();
    if (!sel) {
      this.ghost.setVisible(false);
      return;
    }
    const p = this.preview(sel.kind, sel.props);
    this.ghost.setTexture(p.tex, p.frame).setOrigin(0.5, 0.5).setScale(p.h / p.fh);
    this.ghost.setPosition(tileX * T + T / 2, tileY * T + T / 2);
    this.ghost.setVisible(true);
  }
  /** Redibuja la grid solo sobre el rectángulo visible (cubre bordes con zoom/pan).
   * Ancho 1/zoom: siempre 1px en pantalla, ni se pierde ni se engrosa. */
  private drawGrid(): void {
    if (!this.gridGraphics) return;
    const cam = this.cameras.main;
    const viewW = this.scale.width / cam.zoom;
    const viewH = this.scale.height / cam.zoom;
    const left = Math.floor(cam.scrollX / T) * T - T;
    const top = Math.floor(cam.scrollY / T) * T - T;
    const right = Math.ceil(cam.scrollX + viewW) + T;
    const bottom = Math.ceil(cam.scrollY + viewH) + T;
    const key = `${left},${top},${right},${bottom},${cam.zoom.toFixed(3)}`;
    if (key === this.lastGridKey) return;
    this.lastGridKey = key;
    const g = this.gridGraphics;
    g.clear();
    g.lineStyle(1 / cam.zoom, 0x444466, 0.6);
    for (let x = left; x <= right; x += T) g.lineBetween(x, top, x, bottom);
    for (let y = top; y <= bottom; y += T) g.lineBetween(left, y, right, y);
  }

  private preview(kind: string, props?: Record<string, unknown>): { tex: string; frame?: number; h: number; fh: number } {
    switch (kind) {
      case 'player_start': {
        const skin = CHAR_SKINS.find((c) => c.id === props?.['skin']) ?? CHAR_SKINS[0];
        return { tex: skin.idle.key, frame: 0, h: 16, fh: 32 };
      }
      case 'walker':
      case 'flyer': {
        const skin = ENEMIES.find((s) => s.id === props?.['skin'] && s.kind === kind)
          ?? ENEMIES.find((s) => s.kind === kind)!;
        return { tex: skin.tex.key, frame: 0, h: 18, fh: skin.tex.fh };
      }
      case 'fruit': {
        const f = FRUITS.find((x) => x.id === props?.['skin']) ?? FRUITS[0];
        return { tex: f.key, frame: 0, h: 14, fh: 32 };
      }
      case 'gem': {
        const gem = COINS.find((x) => x.id === props?.['color']) ?? COINS[0];
        return { tex: gem.key, h: 14, fh: 32 };
      }
      case 'item':
        return { tex: FRUITS[0].key, frame: 0, h: 14, fh: 32 };
      case 'checkpoint':
        return { tex: CHECKPOINT.off.key, h: 24, fh: 64 };
      case 'platform': {
        const axis = props?.['axis'];
        return axis === 'fall'
          ? { tex: PLATFORMS.faller.key, frame: 0, h: 10, fh: 10 }
          : { tex: PLATFORMS.mover.key, frame: 0, h: 10, fh: 8 };
      }
      case 'spikes': {
        const variant = (props?.['variant'] as string | undefined) ?? 'spikes';
        const def = OBSTACLES.find((o) => o.id === variant) ?? OBSTACLES[0];
        if (def.id === 'saw') return { tex: def.tex!.key, frame: 0, h: 22, fh: 38 };
        if (def.id === 'fire') return { tex: def.tex!.key, frame: 0, h: 18, fh: 32 };
        if (def.id === 'trampoline') return { tex: TRAMP_IDLE.key, h: 18, fh: 28 };
        if (def.id === 'rock') return { tex: def.image!.key, h: 18, fh: 42 };
        if (def.id === 'spikehead') return { tex: def.image!.key, h: 18, fh: 52 };
        return { tex: 'spike', h: 18, fh: 16 };
      }
      case 'powerup': {
        const d = POWERUPS.find((x) => x.id === props?.['skin']) ?? POWERUPS[0];
        return { tex: d.key, h: 18, fh: d.h };
      }
      case 'brick': {
        return { tex: BRICK.key, h: 18, fh: BRICK.h };
      }
      case 'pipe': {
        return { tex: PIPE.rim.key, h: 16, fh: 16 };
      }
      case 'deco': {
        const d = DECOS.find((x) => x.id === props?.['skin']) ?? DECOS[0];
        return { tex: d.key, h: 18, fh: d.h };
      }
      case 'exit':
        return { tex: 'exit', h: 24, fh: 32 };
      default:
        return { tex: FRUITS[0].key, frame: 0, h: 14, fh: 32 };
    }
  }

  private renderLevel(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];

    for (const tile of this.level.tiles) {
      const v = tile.v ?? 0;
      const [tex, frame]: [string, number] = v < 10 ? ['tile', v] : ['terrain', v - 10];
      const sprite = this.add.image(tile.x * T, tile.y * T, tex, frame);
      sprite.setOrigin(0, 0);
      this.sprites.push(sprite);
    }

    for (const entity of this.level.entities) {
      const cx = entity.x * T + T / 2;
      const cy = entity.y * T + T / 2;
      if (entity.kind === 'platform') {
        // Mosaico 2×32px como en juego (el recorrido se dibuja al final).
        const pr = (entity.props ?? {}) as { axis?: unknown };
        const fall = pr.axis === 'fall';
        const tex = fall ? PLATFORMS.faller.key : PLATFORMS.mover.key;
        for (const ox of [-16, 16]) {
          const sprite = this.add.image(cx + ox, cy, tex, 0);
          sprite.setOrigin(0.5, 0.5);
          this.sprites.push(sprite);
        }
        continue;
      }
      if (entity.kind === 'pipe') {
        // Huella w×h: boca (rim) del lado dir, cuerpo en el resto.
        const pr = (entity.props ?? {}) as { w?: unknown; h?: unknown; dir?: unknown };
        const w = Math.max(1, Math.floor(typeof pr.w === 'number' ? pr.w : 2));
        const h = Math.max(1, Math.floor(typeof pr.h === 'number' ? pr.h : 2));
        const dir = pr.dir === 'down' || pr.dir === 'left' || pr.dir === 'right' ? pr.dir : 'up';
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            const rim =
              dir === 'up' ? dy === 0
              : dir === 'down' ? dy === h - 1
              : dir === 'left' ? dx === 0
              : dx === w - 1;
            const tex = rim ? PIPE.rim.key : PIPE.body.key;
            const sprite = this.add.image((entity.x + dx) * T, (entity.y + dy) * T, tex);
            sprite.setOrigin(0, 0);
            this.sprites.push(sprite);
          }
        }
        const pid = typeof (entity.props as { pid?: unknown } | undefined)?.pid === 'string'
          ? ((entity.props as { pid?: string }).pid as string)
          : '';
        const target = typeof (entity.props as { target?: unknown } | undefined)?.target === 'string'
          ? ((entity.props as { target?: string }).target as string)
          : '';
        const label = this.add
          .text(entity.x * T + (w * T) / 2, entity.y * T + 8, pid || '?', {
            fontSize: '10px',
            color: target ? '#7de0a8' : '#ff8888',
          })
          .setOrigin(0.5, 0);
        this.sprites.push(label);
        continue;
      }
      const p = this.preview(entity.kind, entity.props as Record<string, unknown> | undefined);
      const sprite = this.add.image(cx, cy, p.tex, p.frame);
      sprite.setOrigin(0.5, 0.5);
      sprite.setScale(p.h / p.fh);
      this.sprites.push(sprite);
    }

    // Guía: rectángulo de lo que ve el jugador (480x270) alrededor del inicio.
    this.guideGraphics.clear();
    const start = this.level.entities.find((e) => e.kind === 'player_start');
    if (start) {
      this.guideGraphics.lineStyle(2, 0xffd23f, 0.6);
      this.guideGraphics.strokeRect(start.x * T + T / 2 - 240, start.y * T + T / 2 - 135, 480, 270);
    }

    // Límites: caja del nivel, techo y=0 y línea de muerte (maxY+3, como en juego).
    const g = this.boundsGraphics;
    g.clear();
    const b = this.levelBounds();
    const x0 = b.minX * T;
    const y0 = b.minY * T;
    const x1 = (b.maxX + 1) * T;
    const y1 = (b.maxY + 1) * T;
    g.lineStyle(2, 0xffd23f, 0.8);
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(2, 0x33ddff, 0.7);
    g.lineBetween(x0 - T, 0, x1 + T, 0);
    const killY = (b.maxY + 3) * T;
    g.lineStyle(2, 0xff4444, 0.8);
    g.lineBetween(x0 - T, killY, x1 + T, killY);

    // Enlaces de tuberías: línea entre bocas vinculadas.
    const pipes = this.level.entities.filter((e) => e.kind === 'pipe');
    const centerOf = (e: Entity): [number, number] => {
      const pr = (e.props ?? {}) as { w?: unknown; h?: unknown };
      const w = Math.max(1, Math.floor(typeof pr.w === 'number' ? pr.w : 2));
      const h = Math.max(1, Math.floor(typeof pr.h === 'number' ? pr.h : 2));
      return [e.x * T + (w * T) / 2, e.y * T + (h * T) / 2];
    };
    g.lineStyle(2, 0x7de0a8, 0.7);
    for (const e of pipes) {
      const target = (e.props as { target?: unknown } | undefined)?.target;
      if (typeof target !== 'string' || !target) continue;
      const dest = pipes.find(
        (o) => (o.props as { pid?: unknown } | undefined)?.pid === target,
      );
      if (!dest) continue;
      const [ax, ay] = centerOf(e);
      const [bx, by] = centerOf(dest);
      g.lineBetween(ax, ay, bx, by);
    }
    // Origen pendiente del enlazador.
    if (this.linkFirst && pipes.includes(this.linkFirst)) {
      const [lx, ly] = centerOf(this.linkFirst);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(lx, ly, T);
    }
    // Recorrido de plataformas móviles (eje + rango) + huella real 2×1.
    g.lineStyle(2, 0x33ddff, 0.7);
    for (const e of this.level.entities) {
      if (e.kind !== 'platform') continue;
      const pr = (e.props ?? {}) as { axis?: unknown; range?: unknown };
      const cx = e.x * T + T / 2;
      const cy = e.y * T + T / 2;
      if (pr.axis === 'fall') {
        g.lineStyle(2, 0xffffff, 0.4);
        g.strokeRect(cx - 32, cy - 5, 64, 10);
        g.lineStyle(2, 0x33ddff, 0.7);
        continue;
      }
      const range = Math.max(0, Math.floor(typeof pr.range === 'number' ? pr.range : 3)) * T;
      if (pr.axis === 'y') g.lineBetween(cx, cy - range, cx, cy + range);
      else g.lineBetween(cx - range, cy, cx + range, cy);
      g.lineStyle(2, 0xffffff, 0.4);
      g.strokeRect(cx - 32, cy - 4, 64, 8);
      g.lineStyle(2, 0x33ddff, 0.7);
    }
    // Entidad seleccionada (inspector).
    if (this.selected && this.level.entities.includes(this.selected)) {
      const ex = this.selected.x * T;
      const ey = this.selected.y * T;
      g.lineStyle(3, 0xffffff, 0.95);
      g.strokeRect(ex - 2, ey - 2, T + 4, T + 4);
    }
  }

  private bindUi(): void {
    this.buildRail();
    this.refreshRail();

    el('ed-collapse').onclick = () => {
      document.body.classList.toggle('ed-collapsed');
    };
    el('ed-rotate').onclick = () => {
      el('ed-rotate').style.display = 'none';
    };
    const moreMenu = el('ed-more-menu');
    el('ed-more').onclick = () => {
      moreMenu.hidden = !moreMenu.hidden;
    };
    el('ed-save').onclick = () => {
      void this.saveFlow(false);
    };
    el('ed-publish').onclick = () => {
      void this.saveFlow(true);
    };
    el('ed-export').onclick = () => this.exportLevel();
    el('ed-import').onclick = () => this.importLevel();
    el('ed-test').onclick = () => this.testLevel();
    el('ed-auto').onclick = () => {
      this.autoEdge = !this.autoEdge;
      el('ed-auto').textContent = this.autoEdge ? 'Auto-borde: ON' : 'Auto-borde: OFF';
    };
    el('ed-exit').onclick = () => {
      if (!this.confirmDiscard()) return;
      this.scene.start('menu');
    };
    const openSelect = document.getElementById('ed-open') as HTMLSelectElement | null;
    if (openSelect) {
      openSelect.remove();
    }
    el('ed-new').onclick = () => this.newDraft();
    el('ed-delete').onclick = () => {
      if (!this.remoteId) {
        this.flashStatus('Nada que borrar: abrí un nivel de Mis niveles', false);
        return;
      }
      if (!confirm(`¿Borrar "${this.pendingName}" del servidor?`)) return;
      deleteRemoteLevel(this.remoteId).then(
        () => {
          this.newDraft();
          this.flashStatus('Nivel borrado', true);
        },
        (err) => {
          this.flashStatus(err instanceof Error ? err.message : 'No se pudo borrar', false);
        },
      );
    };
    this.syncNameInput();
  }

  private newDraft(): void {
    if (!this.confirmDiscard()) return;
    this.pushHistory();
    this.remoteId = undefined;
    this.pendingName = '';
    this.pendingPin = '';
    this.level = blankLevel();
    this.dirty = false;
    this.lastPaintKey = '';
    this.selected = null;
    this.hideProps();
    this.centerCamera();
    this.renderBackground();
    this.renderLevel();
    this.syncNameInput();
    this.updateStatus();
  }

  private openCat: RailCat | null = null;
  private recents: { label: string; style: Record<string, string>; apply: () => void }[] = [];
  /** Miniaturas exactas (frame 0) generadas de las texturas cargadas. */
  private thumbCache = new Map<string, string>();

  /** Genera thumbs 1:1 del frame 0 (sin matemática de strips CSS). */
  private buildThumbs(): void {
    this.thumbCache = new Map();
    const put = (key: string, fw: number, fh: number): void => {
      if (!this.textures.exists(key)) return;
      try {
        const src = this.textures.get(key).getSourceImage() as CanvasImageSource;
        const S = 44;
        const k = Math.min(S / fw, S / fh);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(fw * k));
        cv.height = Math.max(1, Math.round(fh * k));
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0, fw, fh, 0, 0, cv.width, cv.height);
        this.thumbCache.set(key, cv.toDataURL());
      } catch {
        // sin thumb: usa fallback CSS
      }
    };
    const putSheet = (s: SheetDef): void => put(s.key, s.fw, s.fh);
    for (const c of CHAR_SKINS) putSheet(c.idle);
    for (const s of FRUIT_SHEETS) putSheet(s);
    for (const e of ENEMIES) putSheet(e.tex);
    for (const o of OBSTACLES) {
      if (o.tex) putSheet(o.tex);
    }
    putSheet(CHECKPOINT.on);
    putSheet(PLATFORMS.mover);
    putSheet(PLATFORMS.faller);
    // Imágenes simples: frame completo.
    const putImg = (key: string): void => {
      if (!this.textures.exists(key)) return;
      const fr = this.textures.get(key).get();
      put(key, fr.width, fr.height);
    };
    putImg('spike');
    for (const o of OBSTACLES) if (o.image) putImg(o.image.key);
    putImg(TRAMP_IDLE.key);
    for (const g of COINS) putImg(g.key);
    putImg(CHECKPOINT.off.key);
    putImg(EXIT_DOOR.idle.key);
    for (const d of DECOS) putImg(d.key);
    putImg(PIPE.rim.key);
  }

  /** Estilo de miniatura: canvas exacto si está, CSS legacy si no. */
  private thumbFor(key: string, url: string, fw: number, fh: number, frames: number): Record<string, string> {
    const hit = this.thumbCache.get(key);
    if (hit) {
      return {
        backgroundImage: `url("${hit}")`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
      };
    }
    return this.sheetThumb(url, fw, fh, frames);
  }

  /** Miniatura 44px de un frame de spritesheet (frame 0). */
  private sheetThumb(url: string, fw: number, fh: number, frames: number, h = 40): Record<string, string> {
    const k = h / fh;
    return {
      backgroundImage: `url("${url}")`,
      backgroundSize: `${Math.round(frames * fw * k)}px ${Math.round(fh * k)}px`,
      backgroundPosition: '0 0',
    };
  }

  private flyout(): HTMLElement {
    return el('ed-flyout');
  }

  private closeFlyout(): void {
    this.flyout().hidden = true;
    this.openCat = null;
    document.querySelectorAll<HTMLElement>('#ed-rail [data-edcat]').forEach((b) => {
      b.classList.remove('open');
    });
  }

  private buildRail(): void {
    document.querySelectorAll<HTMLElement>('#ed-rail [data-edcat]').forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const cat = btn.getAttribute('data-edcat') as RailCat;
        if (this.openCat === cat && !this.flyout().hidden) {
          this.closeFlyout();
          return;
        }
        this.openFlyout(cat, btn);
      };
    });
    document.querySelectorAll<HTMLElement>('#ed-rail [data-edtool]').forEach((btn) => {
      btn.onclick = () => {
        const t = btn.getAttribute('data-edtool') as Tool;
        this.closeFlyout();
        this.setTool(t);
      };
    });
    document.addEventListener('pointerdown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('#ed-flyout,#ed-rail,#ed-topbar')) return;
      if (!this.flyout().hidden) this.closeFlyout();
    });
  }

  private openFlyout(cat: RailCat, anchor: HTMLElement): void {
    const fly = this.flyout();
    fly.textContent = '';
    this.openCat = cat;
    document.querySelectorAll<HTMLElement>('#ed-rail [data-edcat]').forEach((b) => {
      b.classList.toggle('open', b === anchor);
    });
    if (cat === 'piso') this.buildPisoFlyout(fly);
    else if (cat === 'personaje') this.buildPersonajeFlyout(fly);
    else if (cat === 'enemigos') this.buildEnemigosFlyout(fly);
    else if (cat === 'gemas') this.buildGemasFlyout(fly);
    else if (cat === 'obstaculos') this.buildObstaculosFlyout(fly);
    else if (cat === 'fondo') this.buildFondoFlyout(fly);
    else this.buildOtrosFlyout(fly);
    const r = anchor.getBoundingClientRect();
    fly.hidden = false;
    fly.style.left = '140px';
    fly.style.top = `${Math.max(52, Math.min(r.top, window.innerHeight - 200))}px`;
    fly.scrollTop = 0;
  }

  private fgrid(fly: HTMLElement): HTMLElement {
    const g = document.createElement('div');
    g.className = 'ed-fgrid';
    fly.appendChild(g);
    return g;
  }

  private fsect(fly: HTMLElement, title: string, open: boolean): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'ed-fsect';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${open ? '▾' : '▸'} ${title}`;
    const grid = document.createElement('div');
    grid.className = 'ed-fgrid';
    grid.hidden = !open;
    btn.onclick = () => {
      grid.hidden = !grid.hidden;
      btn.textContent = `${grid.hidden ? '▸' : '▾'} ${title}`;
    };
    wrap.appendChild(btn);
    wrap.appendChild(grid);
    fly.appendChild(wrap);
    return grid;
  }

  private fopt(
    grid: HTMLElement,
    title: string,
    style: Record<string, string>,
    apply: () => void,
  ): void {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'opt';
    opt.title = title;
    opt.style.backgroundImage = style['backgroundImage'];
    opt.style.backgroundSize = style['backgroundSize'];
    opt.style.backgroundPosition = style['backgroundPosition'];
    opt.onclick = () => {
      apply();
      this.pushRecent(title, style, apply);
      this.closeFlyout();
      this.refreshRail();
    };
    grid.appendChild(opt);
  }

  private buildPisoFlyout(fly: HTMLElement): void {
    for (const [gi, group] of PISO_GROUPS.entries()) {
      const grid = this.fsect(fly, `${group.name} (${group.variants.length})`, gi === 0);
      for (const v of group.variants) {
        const style = this.tileThumb(v);
        this.fopt(grid, `Piso ${v}`, style, () => {
          this.tileVariant = v;
          this.tool = 'ground';
        });
      }
    }
  }

  private buildPersonajeFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const c of CHAR_SKINS) {
      this.fopt(grid, c.label, this.thumbFor(c.idle.key, c.idle.url, 32, 32, c.idle.frames), () => {
        this.playerSkin = c.id;
        this.tool = 'player_start';
      });
    }
  }

  private buildEnemigosFlyout(fly: HTMLElement): void {
    const walk = this.fsect(fly, 'Caminantes', true);
    for (const e of ENEMIES.filter((x) => x.kind === 'walker')) {
      this.fopt(walk, e.label, this.thumbFor(e.tex.key, e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
        this.enemySkin = e.id;
        this.tool = 'enemy';
      });
    }
    const air = this.fsect(fly, 'Voladores', true);
    for (const e of ENEMIES.filter((x) => x.kind === 'flyer')) {
      this.fopt(air, e.label, this.thumbFor(e.tex.key, e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
        this.enemySkin = e.id;
        this.tool = 'enemy';
      });
    }
  }

  private buildGemasFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const g of COINS) {
      this.fopt(grid, `Moneda ${g.label}`, this.thumbFor(g.key, g.url, 32, 32, 1), () => {
        this.gemColor = g.id;
        this.tool = 'gem';
      });
    }
  }

  private buildObstaculosFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const o of OBSTACLES) {
      const style = o.tex
        ? this.thumbFor(o.tex.key, o.tex.url, o.tex.fw, o.tex.fh, o.tex.frames)
        : this.thumbFor(o.image!.key, o.image!.url, o.bw, o.bh, 1);
      this.fopt(grid, o.label, style, () => {
        this.obstacle = o.id;
        this.tool = 'spikes';
      });
    }
  }

  private buildFondoFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const b of BIOMES) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'opt wide';
      opt.title = b.label;
      opt.style.backgroundImage = `url("${b.thumbUrl}")`;
      opt.style.backgroundSize = 'cover';
      opt.style.backgroundPosition = 'center';
      const label = document.createElement('span');
      label.textContent = b.label + (this.level.bg === b.id || (!this.level.bg && b.id === 'blue') ? ' ✓' : '');
      label.className = 'opt-label';
      const wrap = document.createElement('div');
      wrap.className = 'opt-wrap';
      wrap.append(opt, label);
      opt.onclick = () => {
        this.pushHistorySilent();
        this.level.bg = b.id;
        this.dirty = true;
        this.closeFlyout();
        this.refreshRail();
        this.renderBackground();
        this.flashStatus(`Fondo: ${b.label}`, true);
      };
      grid.appendChild(wrap);
    }
  }

  private buildOtrosFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    this.fopt(grid, 'Checkpoint', this.thumbFor(CHECKPOINT.off.key, CHECKPOINT.off.url, 64, 64, 1), () => {
      this.tool = 'checkpoint';
    });
    this.fopt(grid, 'Plataforma → (horizontal)', this.thumbFor(PLATFORMS.mover.key, PLATFORMS.mover.url, 32, 8, 8), () => {
      this.platformAxis = 'x';
      this.tool = 'platform';
    });
    this.fopt(grid, 'Plataforma ↕ (vertical)', this.thumbFor(PLATFORMS.mover.key, PLATFORMS.mover.url, 32, 8, 8), () => {
      this.platformAxis = 'y';
      this.tool = 'platform';
    });
    this.fopt(grid, 'Plataforma que cae', this.thumbFor(PLATFORMS.faller.key, PLATFORMS.faller.url, 32, 10, 4), () => {
      this.platformAxis = 'fall';
      this.tool = 'platform';
    });
    for (const d of POWERUPS) {
      this.fopt(grid, d.label, this.thumbFor(d.key, d.url, d.w, d.h, 1), () => {
        this.powerSkin = d.id;
        this.tool = 'powerup';
      });
    }
    this.fopt(grid, 'Ladrillo', this.thumbFor(BRICK.key, BRICK.url, BRICK.w, BRICK.h, 1), () => {
      this.tool = 'brick';
    });
    const pipeDirs = [
      ['up', 'Tubería ↑'],
      ['down', 'Tubería ↓'],
      ['left', 'Tubería ←'],
      ['right', 'Tubería →'],
    ] as const;
    for (const [dir, label] of pipeDirs) {
      this.fopt(grid, label, this.thumbFor(PIPE.rim.key, PIPE.rim.url, 16, 16, 1), () => {
        this.pipeDir = dir;
        this.tool = 'pipe';
      });
    }
    this.fopt(grid, 'Salida', this.thumbFor(EXIT_DOOR.idle.key, EXIT_DOOR.idle.url, 64, 64, 1), () => {
      this.tool = 'exit';
    });
  }

  /** Guarda estado para undo sin limpiar redo (usado por cambios no-pincel). */
  private pushHistorySilent(): void {
    this.past.push(cloneLevel(this.level));
    if (this.past.length > 60) this.past.shift();
  }

  private pushRecent(label: string, style: Record<string, string>, apply: () => void): void {
    this.recents = this.recents.filter((r) => r.label !== label);
    this.recents.unshift({ label, style, apply });
    this.recents = this.recents.slice(0, 4);
  }

  private thumbForTool(): { label: string; style: Record<string, string> } {
    const sel = this.currentSelection();
    if (this.tool === 'ground') return { label: `Piso ${this.tileVariant}`, style: this.tileThumb(this.tileVariant) };
    if (this.tool === 'erase') return { label: 'Borrar', style: {} };
    if (this.tool === 'hand') return { label: 'Mano', style: {} };
    if (!sel) return { label: '—', style: {} };
    if (sel.kind === 'player_start') {
      const c = CHAR_SKINS.find((x) => x.id === sel.props['skin']) ?? CHAR_SKINS[0];
      return this.thumbKeyed(c.idle.key, c.idle.url, 32, c.idle.frames);
    } else if (sel.kind === 'walker' || sel.kind === 'flyer') {
      const s = ENEMIES.find((x) => x.id === sel.props['skin']) ?? ENEMIES[0];
      return this.thumbKeyed(s.tex.key, s.tex.url, s.tex.fw, s.tex.frames);
    } else if (sel.kind === 'gem') {
      const gm = COINS.find((g) => g.id === sel.props['color']) ?? COINS[0];
      return this.thumbKeyed(gm.key, gm.url, 32, 1);
    } else if (sel.kind === 'checkpoint') {
      return this.thumbKeyed(CHECKPOINT.off.key, CHECKPOINT.off.url, 64, 1);
    } else if (sel.kind === 'platform') {
      const plat = sel.props['axis'] === 'fall' ? PLATFORMS.faller : PLATFORMS.mover;
      return this.thumbKeyed(plat.key, plat.url, plat.fw, plat.frames);
    } else if (sel.kind === 'spikes') {
      const o = OBSTACLES.find((x) => x.id === (sel.props['variant'] ?? 'spikes')) ?? OBSTACLES[0];
      if (o.tex) return this.thumbKeyed(o.tex.key, o.tex.url, o.tex.fw, o.tex.frames);
      return this.thumbKeyed(o.image!.key, o.image!.url, o.bw, 1);
    } else if (sel.kind === 'powerup') {
      const d = POWERUPS.find((x) => x.id === sel.props['skin']) ?? POWERUPS[0];
      return this.thumbKeyed(d.key, d.url, d.w, 1);
    } else if (sel.kind === 'brick') {
      return this.thumbKeyed(BRICK.key, BRICK.url, BRICK.w, 1);
    } else if (sel.kind === 'pipe') {
      return this.thumbKeyed(PIPE.rim.key, PIPE.rim.url, 16, 1);
    } else if (sel.kind === 'deco') {
      const d = DECOS.find((x) => x.id === sel.props['skin']) ?? DECOS[0];
      return this.thumbKeyed(d.key, d.url, d.w, 1);
    } else if (sel.kind === 'exit') {
      return this.thumbKeyed(EXIT_DOOR.idle.key, EXIT_DOOR.idle.url, 64, 1);
    }
    return { label: this.toolLabel(), style: {} };
  }

  private thumbKeyed(key: string, url: string, fw: number, frames: number): { label: string; style: Record<string, string> } {
    // El cache (frame 0 exacto) ignora estas medidas; solo importan en fallback.
    return { label: this.toolLabel(), style: this.thumbFor(key, url, fw, 32, frames) };
  }

  private toolLabel(): string {
    switch (this.tool) {
      case 'ground': return `Piso ${this.tileVariant}`;
      case 'player_start': return (CHAR_SKINS.find((c) => c.id === this.playerSkin) ?? CHAR_SKINS[0]).label;
      case 'enemy': return (ENEMIES.find((e) => e.id === this.enemySkin) ?? ENEMIES[0]).label;
      case 'gem': return `Moneda ${(COINS.find((g) => g.id === this.gemColor) ?? COINS[0]).label}`;
      case 'checkpoint': return 'Checkpoint';
      case 'platform': {
        const axis = this.platformAxis;
        if (axis === 'fall') return 'Plataforma que cae';
        return axis === 'y' ? 'Plataforma ↕' : 'Plataforma →';
      }
      case 'spikes': return (OBSTACLES.find((o) => o.id === this.obstacle) ?? OBSTACLES[0]).label;
      case 'powerup': {
        const box = (POWERUPS.find((d) => d.id === this.powerSkin) ?? POWERUPS[0]).label;
        const has = (POWERUP_CONTENTS.find((c) => c.id === this.powerContains) ?? POWERUP_CONTENTS[0]).label;
        return `${box} (${has})`;
      }
      case 'brick': return 'Ladrillo';
      case 'pipe': return `Tubería ${this.pipeDirArrow()}`;
      case 'link': return 'Enlazar';
      case 'exit': return 'Salida';
      case 'erase': return 'Borrar';
      case 'hand': return 'Mano';
      default: return '—';
    }
  }

  private pipeDirArrow(): string {
    return this.pipeDir === 'down' ? '↓' : this.pipeDir === 'left' ? '←' : this.pipeDir === 'right' ? '→' : '↑';
  }

  private refreshRail(): void {
    document.querySelectorAll<HTMLElement>('#ed-rail [data-edtool]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-edtool') === this.tool);
    });
    const cur = document.getElementById('ed-current');
    if (cur) {
      const t = this.thumbForTool();
      cur.title = t.label;
      cur.style.backgroundImage = t.style['backgroundImage'] ?? '';
      cur.style.backgroundSize = t.style['backgroundSize'] ?? '';
      cur.style.backgroundPosition = t.style['backgroundPosition'] ?? '';
    }
    const rec = document.getElementById('ed-recents');
    if (rec) {
      rec.textContent = '';
      for (const r of this.recents) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = r.label;
        btn.style.backgroundImage = r.style['backgroundImage'];
        btn.style.backgroundSize = r.style['backgroundSize'];
        btn.style.backgroundPosition = r.style['backgroundPosition'];
        btn.onclick = () => {
          r.apply();
          this.closeFlyout();
          this.refreshRail();
        };
        rec.appendChild(btn);
      }
    }
    this.updateGhost(this.hoverX, this.hoverY);
  }

  private refreshSelection(): void {
    this.refreshRail();
  }

  private refreshToolHighlight(): void {
    this.refreshRail();
  }
  /** Estilo de miniatura para una variante de piso (escala 2x). */
  private tileThumb(v: number): Record<string, string> {
    if (v < 10) {
      return {
        backgroundImage: `url("${TILES_BASE.url}")`,
        backgroundSize: '320px 32px',
        backgroundPosition: `-${v * 32}px 0`,
      };
    }
    const i = v - 10;
    const col = i % TERRAIN_COLS;
    const row = Math.floor(i / TERRAIN_COLS);
    return {
      backgroundImage: `url("${TILES_EXTRA.url}")`,
      backgroundSize: '704px 352px',
      backgroundPosition: `-${col * 32}px -${row * 32}px`,
    };
  }

  private updateCoords(x: number, y: number): void {
    const node = document.getElementById('ed-coords');
    if (node) node.textContent = x >= 0 && y >= 0 ? `celda ${x},${y}` : '';
  }

  private panBy(dx: number, dy: number): void {
    this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
    this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
  }

  /** Pinch con dos dedos: zoom centrado en el punto medio. True si lo manejó. */
  private pinchZoom(pointer: Phaser.Input.Pointer): boolean {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (!p1.isDown || !p2 || !p2.isDown || pointer === p1) {
      if (!p2 || !p2.isDown) this.pinchDist = 0;
      return false;
    }
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    if (this.pinchDist > 0 && d > 0) {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(mx, my);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (d / this.pinchDist), 0.25, 4));
      const after = cam.getWorldPoint(mx, my);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    }
    this.pinchDist = d;
    return true;
  }

  /** Ajusta zoom para que el nivel entre completo. */
  private fitToScreen(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of this.level.tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
    }
    for (const e of this.level.entities) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x);
      maxY = Math.max(maxY, e.y);
    }
    const cam = this.cameras.main;
    if (minX === Infinity) {
      cam.setZoom(1);
      cam.centerOn(15 * T, 8 * T);
      return;
    }
    const w = (maxX - minX + 1) * T + T * 2;
    const h = (maxY - minY + 1) * T + T * 2;
    cam.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width / w, this.scale.height / h), 0.25, 4));
    cam.centerOn(((minX + maxX + 1) / 2) * T, ((minY + maxY + 1) / 2) * T);
  }

  private setStatus(text: string, ok: boolean): void {
    const node = el('ed-status');
    node.textContent = text;
    node.classList.toggle('ok', ok);
    node.classList.toggle('err', !ok);
  }

  /** Lleva la cámara al tile y lo resalta un momento. */
  private gotoTile(x: number, y: number): void {
    this.cameras.main.centerOn(x * T + T / 2, y * T + T / 2);
    this.hoverX = x;
    this.hoverY = y;
    this.updateCoords(x, y);
    this.flashStatus(`celda ${x},${y}`, true);
  }

  private updateStatus(): void {
    const errors = validateLevel(this.level);
    const node = el('ed-status');
    node.textContent = '';
    if (errors.length === 0) {
      this.setStatus('Nivel válido', true);
      return;
    }
    node.classList.toggle('ok', false);
    node.classList.toggle('err', true);
    errors.forEach((e, i) => {
      if (i > 0) node.append(' · ');
      const m = /\((-?\d+),\s*(-?\d+)\)/.exec(e.message);
      if (!m) {
        node.append(e.message);
        return;
      }
      const [full, sx, sy] = m;
      const idx = e.message.indexOf(full);
      node.append(e.message.slice(0, idx));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ed-errlink';
      btn.textContent = full;
      btn.title = `Ir a la celda ${sx},${sy}`;
      const tx = Number(sx);
      const ty = Number(sy);
      btn.onclick = () => this.gotoTile(tx, ty);
      node.appendChild(btn);
      node.append(e.message.slice(idx + full.length));
    });
  }

  private flashStatus(message: string, ok: boolean): void {
    this.setStatus(message, ok);
    this.time.delayedCall(2000, () => this.updateStatus());
  }

  /** Guardar en el servidor (con validación). showPin muestra el PIN. */
  private async saveFlow(showPin: boolean): Promise<void> {
    const errors = validateLevel(this.level);
    if (errors.length > 0) {
      this.flashStatus('Corrige los errores antes de guardar', false);
      return;
    }
    try {
      const pin = await this.saveLevel();
      this.flashStatus(showPin ? `Publicado · PIN ${pin}` : `Nivel "${this.pendingName}" guardado`, true);
    } catch (err) {
      this.flashStatus(err instanceof Error ? err.message : 'No se pudo guardar', false);
    }
  }

  private exportLevel(): void {    const json = JSON.stringify(this.level, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nivel-tinogames.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private importLevel(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const level = JSON.parse(reader.result as string) as Level;
          if (level.format === 2) {
            this.pushHistory();
            this.level = level;
            this.dirty = true;
            this.selected = null;
            this.hideProps();
            this.centerCamera();
            this.renderBackground();
            this.renderLevel();
            this.updateStatus();
            this.flashStatus('Nivel importado', true);
          } else {
            this.flashStatus('Formato inválido', false);
          }
        } catch {
          this.flashStatus('Error al leer archivo', false);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private testLevel(): void {
    const errors = validateLevel(this.level);
    if (errors.length > 0) {
      this.flashStatus('Corrige los errores antes de probar', false);
      return;
    }
    this.scene.start('game', {
      level: cloneLevel(this.level),
      fromEditor: true,
      remoteId: this.remoteId,
      name: (document.getElementById('ed-name') as HTMLInputElement | null)?.value ?? this.pendingName,
    });
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(2);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.painting = true;
      this.panning = false;
      this.erasing = pointer.rightButtonDown();
      this.pinchDist = 0;
      this.downX = pointer.x;
      this.downY = pointer.y;
      this.lastPaintKey = '';
      this.strokeSnapshot = cloneLevel(this.level);
      // Botón central: solo panea, nunca pinta.
      if (!pointer.middleButtonDown()) this.paintAt(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pinchZoom(pointer)) return;
      const hover = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const hx = Math.floor(hover.x / T);
      const hy = Math.floor(hover.y / T);
      this.hoverX = hx;
      this.hoverY = hy;
      this.updateGhost(hx, hy);
      this.updateCoords(hx, hy);
      if (!this.painting || !pointer.isDown) return;
      if (this.erasing) {
        this.paintAt(pointer);
        return;
      }
      // Paneo solo en modo pan (mano/espacio/botón central). Con el resto,
      // arrastrar pinta el trazo (izquierdo) sin cambiar a paneo.
      const panMode = this.tool === 'hand' || this.spaceDown || pointer.middleButtonDown();
      if (panMode) {
        this.panBy(pointer.x - this.downX, pointer.y - this.downY);
        this.downX = pointer.x;
        this.downY = pointer.y;
        this.panning = true;
        return;
      }
      this.paintAt(pointer);
    });

    const stop = (pointer: Phaser.Input.Pointer): void => {
      if (this.tool === 'hand' && pointer) {
        const moved = Math.hypot(pointer.x - this.downX, pointer.y - this.downY);
        if (!this.panning && moved <= DRAG_THRESHOLD && !this.erasing) {
          const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.selectAt(Math.floor(wp.x / T), Math.floor(wp.y / T));
        }
      }
      if (this.strokeSnapshot && JSON.stringify(this.strokeSnapshot) !== JSON.stringify(this.level)) {
        this.past.push(this.strokeSnapshot);
        if (this.past.length > 60) this.past.shift();
        this.future = [];
      }
      this.strokeSnapshot = null;
      this.painting = false;
      this.panning = false;
      this.erasing = false;
    };
    this.input.on('pointerup', stop);
    this.input.on('pointerupoutside', stop);

    this.input.on(
      'wheel',
      (
        pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number,
        _deltaZ: number,
      ) => {
        // Girar = zoom centrado en el cursor.
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(pointer.x, pointer.y);
        const next = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.25, 4);
        cam.setZoom(next);
        const after = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      },
    );

    this.input.keyboard?.on('keydown-E', () => {
      if (this.typing()) return;
      this.setTool('erase');
    });
    this.input.keyboard?.on('keydown-H', () => {
      if (this.typing()) return;
      this.setTool('hand');
    });
    this.input.keyboard?.on('keydown-F', () => {
      if (this.typing()) return;
      this.fitToScreen();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.flyout().hidden) this.closeFlyout();
      else if (this.selected) {
        this.selected = null;
        this.hideProps();
        this.renderLevel();
      } else this.setTool(null);
    });
    this.input.keyboard?.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (this.typing()) return;
      e.preventDefault();
      this.spaceDown = true;
    });
    this.input.keyboard?.on('keyup-SPACE', () => {
      this.spaceDown = false;
    });
    const digits: (Tool | null)[] = ['ground', 'player_start', 'enemy', 'gem', 'spikes', 'checkpoint', 'platform', 'powerup'];
    digits.forEach((tool, i) => {
      this.input.keyboard?.on(`keydown-${i + 1}`, () => {
        if (this.typing()) return;
        this.setTool(tool);
      });
    });
    this.input.keyboard?.on('keydown-Z', (e: KeyboardEvent) => {
      if (this.typing() || !e.ctrlKey) return;
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    });
    this.input.keyboard?.on('keydown-Y', (e: KeyboardEvent) => {
      if (this.typing() || !e.ctrlKey) return;
      e.preventDefault();
      this.redo();
    });
  }

  /** True si el foco está en un campo de texto (no robar atajos). */
  private typing(): boolean {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  }

  private paintAt(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / T);
    const tileY = Math.floor(worldPoint.y / T);
    if (tileX < 0 || tileY < 0) return;
    if (this.tool === 'hand') return;
    // En drag-pintado, no repetir el mismo tile.
    const key = `${this.tool}:${tileX},${tileY}`;
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;
    this.updateCoords(tileX, tileY);

    if (this.tool === 'erase') {
      this.eraseAt(tileX, tileY);
    } else if (this.tool === 'link') {
      this.linkAt(tileX, tileY);
      return;
    } else if (this.erasing) {
      // Clic derecho: borrar sin cambiar la herramienta activa.
      this.eraseAt(tileX, tileY);
    } else if (this.tool === 'ground') {
      this.paintGround(tileX, tileY);
    } else {
      this.paintEntity(tileX, tileY);
    }
    this.dirty = true;
    this.renderLevel();
    this.updateStatus();
  }

  private paintGround(x: number, y: number): void {
    const idx = this.level.tiles.findIndex((t) => t.x === x && t.y === y);
    if (idx >= 0) this.level.tiles.splice(idx, 1);
    if (this.tileVariant === 0) {
      this.level.tiles.push({ x, y, t: 'ground' });
    } else {
      this.level.tiles.push({ x, y, t: 'ground', v: this.tileVariant });
    }
    if (this.autoEdge) this.fixEdges(x, y);
  }

  private groundAt(x: number, y: number): boolean {
    return this.level.tiles.some((t) => t.t === 'ground' && t.x === x && t.y === y);
  }

  /** Variante del grupo según vecinos (matriz 1-9 del cubo). */
  private autoVariant(x: number, y: number, g: PisoGroup): number {
    const vs = g.variants;
    if (g.auto === 'row') {
      const left = this.groundAt(x - 1, y);
      const right = this.groundAt(x + 1, y);
      if (!left) return vs[0];
      if (!right) return vs[vs.length - 1];
      return vs[Math.min(1, vs.length - 1)];
    }
    if (g.auto === 'pair') {
      return vs[Math.abs(x) % vs.length];
    }
    // cube 3x3: esquinas primero, después bordes, centro al final.
    const n = this.groundAt(x, y - 1);
    const s = this.groundAt(x, y + 1);
    const w = this.groundAt(x - 1, y);
    const e = this.groundAt(x + 1, y);
    const at = (i: number): number => vs[Math.min(i, vs.length - 1)];
    if (!n && !w) return at(0);
    if (!n && !e) return at(2);
    if (!s && !w) return at(6);
    if (!s && !e) return at(8);
    if (!n) return at(1);
    if (!s) return at(7);
    if (!w) return at(3);
    if (!e) return at(5);
    return at(4);
  }

  /** Recalcula el tile + vecinos del mismo grupo tras pintar/borrar. */
  private fixEdges(x: number, y: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.level.tiles.find(
          (tt) => tt.t === 'ground' && tt.x === x + dx && tt.y === y + dy,
        );
        if (!t) continue;
        const g = PISO_GROUPS.find((gr) => gr.variants.includes(t.v ?? 0));
        if (!g || g.auto === 'off') continue;
        t.v = this.autoVariant(t.x, t.y, g);
        if (t.v === 0) delete t.v;
      }
    }
  }

  private currentSelection(): { kind: Entity['kind']; props: Record<string, unknown> } | null {
    switch (this.tool) {
      case 'player_start':
        return { kind: 'player_start', props: this.playerSkin !== 'tux' ? { skin: this.playerSkin } : {} };
      case 'enemy': {
        const skin = ENEMIES.find((s) => s.id === this.enemySkin) ?? ENEMIES[0];
        const props: Record<string, unknown> = { skin: skin.id };
        if (skin.kind === 'walker') {
          props['range'] = skin.range ?? 4;
          props['speed'] = skin.speed ?? 40;
        } else {
          props['axis'] = 'x';
          props['range'] = 3;
          props['speed'] = 50;
        }
        return { kind: skin.kind, props };
      }
      case 'gem':
        return { kind: 'gem', props: { color: this.gemColor } };
      case 'checkpoint':
        return { kind: 'checkpoint', props: {} };
      case 'platform':
        return { kind: 'platform', props: { axis: this.platformAxis, range: 3, speed: 50 } };
      case 'spikes':
        return { kind: 'spikes', props: this.obstacle !== 'spikes' ? { variant: this.obstacle } : {} };
      case 'powerup':
        return { kind: 'powerup', props: { skin: this.powerSkin, contains: this.powerContains } };
      case 'brick':
        return { kind: 'brick', props: {} };
      case 'pipe':
        return { kind: 'pipe', props: { w: 2, h: 2, dir: this.pipeDir } };
      case 'exit':
        return { kind: 'exit', props: {} };
      default:
        return null;
    }
  }

  private paintEntity(x: number, y: number): void {
    const sel = this.currentSelection();
    if (!sel) return;
    const { kind, props } = sel;
    if (kind === 'player_start' || kind === 'exit') {
      this.level.entities = this.level.entities.filter((e) => e.kind !== kind);
    }
    this.level.entities = this.level.entities.filter((e) => !(e.x === x && e.y === y));

    const entity: Entity = Object.keys(props).length > 0 ? { kind, x, y, props } : { kind, x, y };
    this.level.entities.push(entity as Entity);
    if (kind === 'pipe') this.linkPipe(entity as Entity);
  }

  /** Auto-enlaza la tubería recién pintada con la última boca sin destino (ida y vuelta). */
  private linkPipe(pipe: Entity): void {
    this.ensurePid(pipe);
    const pipes = this.level.entities.filter((e) => e.kind === 'pipe' && e !== pipe);
    const lone = [...pipes].reverse().find((e) => {
      const q = (e.props ?? {}) as Record<string, unknown>;
      return !q['target'];
    });
    if (lone) this.linkPair(pipe, lone);
  }

  /** Asegura pid único P#. */
  private ensurePid(pipe: Entity): string {
    const pp = (pipe.props ?? {}) as Record<string, unknown>;
    if (typeof pp['pid'] === 'string' && pp['pid']) return pp['pid'];
    const used = new Set<number>();
    for (const e of this.level.entities) {
      if (e.kind !== 'pipe') continue;
      const m = /^P(\d+)$/.exec(((e.props as { pid?: unknown } | undefined)?.pid as string) ?? '');
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    pp['pid'] = `P${n}`;
    pipe.props = pp as Entity['props'];
    return pp['pid'] as string;
  }

  /** Vincula dos bocas ida y vuelta, limpiando enlaces previos de ambas. */
  private linkPair(a: Entity, b: Entity): void {
    const pa = this.ensurePid(a);
    const pb = this.ensurePid(b);
    this.clearLinksTo(pa);
    this.clearLinksTo(pb);
    ((a.props ?? {}) as Record<string, unknown>)['target'] = pb;
    ((b.props ?? {}) as Record<string, unknown>)['target'] = pa;
  }

  /** Saca el target que apunte a pid (y el propio de la boca pid si se pide). */
  private clearLinksTo(pid: string): void {
    for (const e of this.level.entities) {
      if (e.kind !== 'pipe') continue;
      const p = (e.props ?? {}) as Record<string, unknown>;
      if (p['target'] === pid) delete p['target'];
    }
  }

  /** Desvincula una boca por completo (ambos lados). */
  private unlinkPipe(pipe: Entity): void {
    const p = (pipe.props ?? {}) as Record<string, unknown>;
    const mine = p['pid'];
    delete p['target'];
    if (typeof mine === 'string' && mine) this.clearLinksTo(mine);
  }

  /** Tubería cuya huella contiene el tile (x,y), si hay. */
  private pipeAt(x: number, y: number): Entity | null {
    for (const e of this.level.entities) {
      if (e.kind !== 'pipe') continue;
      const pr = (e.props ?? {}) as { w?: unknown; h?: unknown };
      const w = Math.max(1, Math.floor(typeof pr.w === 'number' ? pr.w : 2));
      const h = Math.max(1, Math.floor(typeof pr.h === 'number' ? pr.h : 2));
      if (x >= e.x && x < e.x + w && y >= e.y && y < e.y + h) return e;
    }
    return null;
  }

  /** Entidad bajo el tile (respeta huellas de tubería y pinchos). */
  private entityAt(x: number, y: number): Entity | null {
    const pipe = this.pipeAt(x, y);
    if (pipe) return pipe;
    for (const e of this.level.entities) {
      if (e.kind === 'spikes') {
        const pr = (e.props ?? {}) as { w?: unknown; h?: unknown };
        const w = Math.max(1, Math.floor(typeof pr.w === 'number' ? pr.w : 1));
        const h = Math.max(1, Math.floor(typeof pr.h === 'number' ? pr.h : 1));
        if (x >= e.x && x < e.x + w && y >= e.y && y < e.y + h) return e;
        continue;
      }
      if (e.x === x && e.y === y) return e;
    }
    return null;
  }

  /** Herramienta enlazar: clic A, clic B → vinculadas; clic A, clic A → tapada. */
  private linkAt(x: number, y: number): void {
    const pipe = this.pipeAt(x, y);
    if (!pipe) {
      this.linkFirst = null;
      return;
    }
    if (!this.linkFirst || this.linkFirst === pipe) {
      if (this.linkFirst === pipe) {
        this.unlinkPipe(pipe);
        this.linkFirst = null;
        this.flashStatus('Tubería tapada', true);
      } else {
        this.linkFirst = pipe;
        const pid = this.ensurePid(pipe);
        this.flashStatus(`Origen ${pid}: elegí destino`, true);
      }
    } else {
      this.linkPair(this.linkFirst, pipe);
      const a = ((this.linkFirst.props ?? {}) as Record<string, unknown>)['pid'];
      const b = ((pipe.props ?? {}) as Record<string, unknown>)['pid'];
      this.linkFirst = null;
      this.flashStatus(`Vinculadas ${a}↔${b}`, true);
    }
    this.dirty = true;
    this.renderLevel();
    this.updateStatus();
  }

  private eraseAt(x: number, y: number): void {
    // Al borrar una boca (cualquier tile de su huella), las que apuntaban
    // a ella quedan tapadas.
    const gone = this.pipeAt(x, y);
    const gonePid = (gone?.props as { pid?: unknown } | undefined)?.pid;
    this.level.tiles = this.level.tiles.filter((t) => !(t.x === x && t.y === y));
    this.level.entities = this.level.entities.filter((e) => {
      if (e.x === x && e.y === y) return false;
      // Tubería: borrar cualquier tile de la huella borra la boca entera.
      if (gone && e === gone) return false;
      return true;
    });
    if (typeof gonePid === 'string' && gonePid) this.clearLinksTo(gonePid);
    if (this.linkFirst && !this.level.entities.includes(this.linkFirst)) this.linkFirst = null;
    if (this.autoEdge) this.fixEdges(x, y);
  }
}
