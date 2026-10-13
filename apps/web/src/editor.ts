import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import type { Entity, Level } from '@tinogames/level-schema';
import {
  BG_BLUE,
  BIOMES,
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
  type SheetDef,
} from './catalog.js';
import { blankLevel, cloneLevel } from './levels.js';
import { PISO_GROUPS } from './piso-groups.js';
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
  | 'fruit'
  | 'gem'
  | 'item'
  | 'checkpoint'
  | 'platform'
  | 'spikes'
  | 'deco'
  | 'exit'
  | 'erase'
  | 'hand';

type RailCat = 'piso' | 'personaje' | 'enemigos' | 'frutas' | 'gemas' | 'obstaculos' | 'fondo' | 'otros';

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
  private playerSkin = 'pink';
  private enemySkin = 'pig';
  private fruitSkin = 'apple';
  private gemColor = 'purple';
  private platformAxis = 'x';
  private obstacle = 'spikes';
  private decoSkin = 'box1';
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private guideGraphics!: Phaser.GameObjects.Graphics;
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
    for (const g of GEMS) this.load.image(g.key, g.url);
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
    this.ghost = this.add.image(0, 0, 'tile', 0).setAlpha(0.5).setDepth(100).setVisible(false);
    this.ghostRect = this.add.graphics().setDepth(100).setVisible(false);
    this.centerCamera();
    this.renderLevel();
    this.bindUi();
    this.setupInput();
    this.updateStatus();
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
    this.refreshRail();
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
  /** Redibuja la grid solo sobre el rectángulo visible (cubre bordes con zoom/pan). */
  private drawGrid(): void {
    if (!this.gridGraphics) return;
    const cam = this.cameras.main;
    const viewW = this.scale.width / cam.zoom;
    const viewH = this.scale.height / cam.zoom;
    const left = Math.floor(cam.scrollX / T) * T - T;
    const top = Math.floor(cam.scrollY / T) * T - T;
    const right = Math.ceil(cam.scrollX + viewW) + T;
    const bottom = Math.ceil(cam.scrollY + viewH) + T;
    const key = `${left},${top},${right},${bottom}`;
    if (key === this.lastGridKey) return;
    this.lastGridKey = key;
    const g = this.gridGraphics;
    g.clear();
    g.lineStyle(1, 0x444466, 0.6);
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
        const gem = GEMS.find((x) => x.id === props?.['color']) ?? GEMS[0];
        return { tex: gem.key, h: 14, fh: 32 };
      }
      case 'item':
        return { tex: 'apple', frame: 0, h: 14, fh: 32 };
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
        if (def.id === 'arrow') return { tex: def.tex!.key, frame: 0, h: 18, fh: 18 };
        if (def.id === 'trampoline') return { tex: TRAMP_IDLE.key, h: 18, fh: 28 };
        if (def.id === 'rock') return { tex: def.image!.key, h: 18, fh: 42 };
        if (def.id === 'spikehead') return { tex: def.image!.key, h: 18, fh: 52 };
        return { tex: 'spike', h: 18, fh: 16 };
      }
      case 'deco': {
        const d = DECOS.find((x) => x.id === props?.['skin']) ?? DECOS[0];
        return { tex: d.key, h: 18, fh: d.h };
      }
      case 'exit':
        return { tex: 'exit', h: 24, fh: 32 };
      default:
        return { tex: 'apple', frame: 0, h: 14, fh: 32 };
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
    this.centerCamera();
    this.renderLevel();
    this.syncNameInput();
    this.updateStatus();
  }

  private openCat: RailCat | null = null;
  private recents: { label: string; style: Record<string, string>; apply: () => void }[] = [];

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
    else if (cat === 'frutas') this.buildFrutasFlyout(fly);
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
      this.fopt(grid, c.label, this.sheetThumb(c.idle.url, 32, 32, c.idle.frames), () => {
        this.playerSkin = c.id;
        this.tool = 'player_start';
      });
    }
  }

  private buildEnemigosFlyout(fly: HTMLElement): void {
    const walk = this.fsect(fly, 'Caminantes', true);
    for (const e of ENEMIES.filter((x) => x.kind === 'walker')) {
      this.fopt(walk, e.label, this.sheetThumb(e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
        this.enemySkin = e.id;
        this.tool = 'enemy';
      });
    }
    const air = this.fsect(fly, 'Voladores', true);
    for (const e of ENEMIES.filter((x) => x.kind === 'flyer')) {
      this.fopt(air, e.label, this.sheetThumb(e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
        this.enemySkin = e.id;
        this.tool = 'enemy';
      });
    }
  }

  private buildFrutasFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const f of FRUITS) {
      const sheet = FRUIT_SHEETS.find((s) => s.key === f.key)!;
      this.fopt(grid, f.label, this.sheetThumb(sheet.url, 32, 32, sheet.frames), () => {
        this.fruitSkin = f.id;
        this.tool = 'fruit';
      });
    }
  }

  private buildGemasFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    for (const g of GEMS) {
      this.fopt(grid, g.label, this.sheetThumb(g.url, 32, 32, 1), () => {
        this.gemColor = g.id;
        this.tool = 'gem';
      });
    }
  }

  private buildObstaculosFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    const dims: Record<string, [string, number, number, number]> = {
      spikes: [OBSTACLES[0].image!.url, 16, 16, 1],
      saw: [OBSTACLES[1].tex!.url, 38, 38, 8],
      fire: [OBSTACLES[2].tex!.url, 16, 32, 3],
      arrow: [OBSTACLES[3].tex!.url, 18, 18, 10],
      rock: [OBSTACLES[4].image!.url, 42, 42, 1],
      spikehead: [OBSTACLES[5].image!.url, 54, 52, 1],
      trampoline: [TRAMP_IDLE.url, 28, 28, 1],
    };
    for (const o of OBSTACLES) {
      const [url, fw, fh, frames] = dims[o.id]!;
      this.fopt(grid, o.label, this.sheetThumb(url, fw, fh, frames), () => {
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
        this.flashStatus(`Fondo: ${b.label} (guardá para aplicar)`, true);
      };
      grid.appendChild(wrap);
    }
  }

  private buildOtrosFlyout(fly: HTMLElement): void {
    const grid = this.fgrid(fly);
    this.fopt(grid, 'Item', this.sheetThumb(FRUIT_SHEETS[0].url, 32, 32, 17), () => {
      this.tool = 'item';
    });
    this.fopt(grid, 'Checkpoint', this.sheetThumb(CHECKPOINT.off.url, 64, 64, 1), () => {
      this.tool = 'checkpoint';
    });
    this.fopt(grid, 'Plataforma móvil', this.sheetThumb(PLATFORMS.mover.url, 32, 8, 8), () => {
      this.platformAxis = 'x';
      this.tool = 'platform';
    });
    this.fopt(grid, 'Plataforma que cae', this.sheetThumb(PLATFORMS.faller.url, 32, 10, 4), () => {
      this.platformAxis = 'fall';
      this.tool = 'platform';
    });
    for (const d of DECOS) {
      this.fopt(grid, d.label, this.sheetThumb(d.url, d.w, d.h, 1), () => {
        this.decoSkin = d.id;
        this.tool = 'deco';
      });
    }
    this.fopt(grid, 'Salida', this.sheetThumb(EXIT_DOOR.idle.url, 64, 64, 1), () => {
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
    const p = this.preview(sel.kind, sel.props);
    let url = '';
    let fw = 16;
    let fh = p.fh;
    let frames = 1;
    if (sel.kind === 'player_start') {
      const c = CHAR_SKINS.find((x) => x.id === sel.props['skin']) ?? CHAR_SKINS[0];
      url = c.idle.url; fw = 32; frames = c.idle.frames;
    } else if (sel.kind === 'walker' || sel.kind === 'flyer') {
      const s = ENEMIES.find((x) => x.id === sel.props['skin']) ?? ENEMIES[0];
      url = s.tex.url; fw = s.tex.fw; frames = s.tex.frames;
    } else if (sel.kind === 'fruit') {
      const sheet = FRUIT_SHEETS.find((s) => s.key === (FRUITS.find((f) => f.id === sel.props['skin']) ?? FRUITS[0]).key)!;
      url = sheet.url; fw = 32; frames = sheet.frames;
    } else if (sel.kind === 'gem') {
      url = (GEMS.find((g) => g.id === sel.props['color']) ?? GEMS[0]).url; fw = 32; frames = 1;
    } else if (sel.kind === 'item') {
      url = FRUIT_SHEETS[0].url; fw = 32; frames = 17;
    } else if (sel.kind === 'checkpoint') {
      url = CHECKPOINT.off.url; fw = 64; frames = 1;
    } else if (sel.kind === 'platform') {
      const plat = sel.props['axis'] === 'fall' ? PLATFORMS.faller : PLATFORMS.mover;
      url = plat.url; fw = plat.fw; frames = plat.frames;
    } else if (sel.kind === 'spikes') {
      const o = OBSTACLES.find((x) => x.id === (sel.props['variant'] ?? 'spikes')) ?? OBSTACLES[0];
      if (o.tex) { url = o.tex.url; fw = o.tex.fw; frames = o.tex.frames; }
      else { url = o.image!.url; fw = p.fh; frames = 1; }
    } else if (sel.kind === 'deco') {
      const d = DECOS.find((x) => x.id === sel.props['skin']) ?? DECOS[0];
      url = d.url; fw = d.w; frames = 1;
    } else if (sel.kind === 'exit') {
      url = EXIT_DOOR.idle.url; fw = 64; frames = 1;
    }
    void fh;
    return { label: this.toolLabel(), style: this.sheetThumb(url, fw, p.fh, frames, 40) };
  }

  private toolLabel(): string {
    switch (this.tool) {
      case 'ground': return `Piso ${this.tileVariant}`;
      case 'player_start': return (CHAR_SKINS.find((c) => c.id === this.playerSkin) ?? CHAR_SKINS[0]).label;
      case 'enemy': return (ENEMIES.find((e) => e.id === this.enemySkin) ?? ENEMIES[0]).label;
      case 'fruit': return (FRUITS.find((f) => f.id === this.fruitSkin) ?? FRUITS[0]).label;
      case 'gem': return (GEMS.find((g) => g.id === this.gemColor) ?? GEMS[0]).label;
      case 'item': return 'Item';
      case 'checkpoint': return 'Checkpoint';
      case 'platform': return this.platformAxis === 'fall' ? 'Plataforma que cae' : 'Plataforma móvil';
      case 'spikes': return (OBSTACLES.find((o) => o.id === this.obstacle) ?? OBSTACLES[0]).label;
      case 'deco': return (DECOS.find((d) => d.id === this.decoSkin) ?? DECOS[0]).label;
      case 'exit': return 'Salida';
      case 'erase': return 'Borrar';
      case 'hand': return 'Mano';
      default: return '—';
    }
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

  private updateStatus(): void {
    const errors = validateLevel(this.level);
    if (errors.length === 0) {
      this.setStatus('Nivel válido', true);
    } else {
      this.setStatus(errors.map((e) => e.message).join(' · '), false);
    }
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
            this.centerCamera();
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
      this.paintAt(pointer);
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
      const panMode = this.tool === 'hand' || this.spaceDown || pointer.middleButtonDown();
      if (panMode) {
        this.panBy(pointer.x - this.downX, pointer.y - this.downY);
        this.downX = pointer.x;
        this.downY = pointer.y;
        return;
      }
      if (!this.panning) {
        const dx = pointer.x - this.downX;
        const dy = pointer.y - this.downY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.panning = true;
      }
      if (this.panning) {
        this.panBy(pointer.x - this.downX, pointer.y - this.downY);
        this.downX = pointer.x;
        this.downY = pointer.y;
      } else {
        this.paintAt(pointer);
      }
    });

    const stop = (): void => {
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
      ) => {
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
      else this.setTool(null);
    });
    this.input.keyboard?.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (this.typing()) return;
      e.preventDefault();
      this.spaceDown = true;
    });
    this.input.keyboard?.on('keyup-SPACE', () => {
      this.spaceDown = false;
    });
    const digits: (Tool | null)[] = ['ground', 'player_start', 'enemy', 'fruit', 'gem', 'spikes', 'checkpoint', 'platform', 'deco'];
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

    if (this.tool === 'erase') {
      this.eraseAt(tileX, tileY);
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
  }

  private currentSelection(): { kind: Entity['kind']; props: Record<string, unknown> } | null {
    switch (this.tool) {
      case 'player_start':
        return { kind: 'player_start', props: this.playerSkin !== 'pink' ? { skin: this.playerSkin } : {} };
      case 'enemy': {
        const skin = ENEMIES.find((s) => s.id === this.enemySkin) ?? ENEMIES[0];
        const props: Record<string, unknown> = { skin: skin.id };
        if (skin.kind === 'walker') {
          props['range'] = skin.range ?? 4;
          props['speed'] = skin.speed ?? 40;
        }
        return { kind: skin.kind, props };
      }
      case 'fruit':
        return { kind: 'fruit', props: { skin: this.fruitSkin } };
      case 'gem':
        return { kind: 'gem', props: { color: this.gemColor } };
      case 'item':
        return { kind: 'item', props: {} };
      case 'checkpoint':
        return { kind: 'checkpoint', props: {} };
      case 'platform':
        return { kind: 'platform', props: { axis: this.platformAxis, range: 3, speed: 50 } };
      case 'spikes':
        return { kind: 'spikes', props: this.obstacle !== 'spikes' ? { variant: this.obstacle } : {} };
      case 'deco':
        return { kind: 'deco', props: { skin: this.decoSkin } };
      case 'exit':
        return { kind: 'exit', props: { needsAllItems: true } };
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
  }

  private eraseAt(x: number, y: number): void {
    this.level.tiles = this.level.tiles.filter((t) => !(t.x === x && t.y === y));
    this.level.entities = this.level.entities.filter((e) => !(e.x === x && e.y === y));
  }
}
