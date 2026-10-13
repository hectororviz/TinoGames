import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import type { Entity, Level } from '@tinogames/level-schema';
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
  type SheetDef,
} from './catalog.js';
import {
  blankLevel,
  cloneLevel,
  createLevel,
  deleteLevel,
  findLevel,
  listLevels,
  setRemote,
  updateLevel,
} from './levels.js';
import type { EditorData } from './levels.js';
import { getToken, publishLevel, updateRemoteLevel } from './api.js';

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
  | 'erase';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

function selectEl(id: string): HTMLSelectElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLSelectElement)) throw new Error(`missing select #${id}`);
  return node;
}

function fillSelect(sel: HTMLSelectElement, groups: { label?: string; options: { value: string; label: string }[] }[]): void {
  sel.textContent = '';
  for (const g of groups) {
    const parent: HTMLOptGroupElement | HTMLSelectElement = g.label
      ? (() => {
          const og = document.createElement('optgroup');
          og.label = g.label;
          sel.appendChild(og);
          return og;
        })()
      : sel;
    for (const o of g.options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      parent.appendChild(opt);
    }
  }
}

export class EditorScene extends Phaser.Scene {
  private level!: Level;
  private openId: string | undefined;
  private pendingName = '';
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
      this.openId = data.openId;
      this.pendingName = data.name ?? '';
    } else if (data?.openId) {
      const entry = findLevel(data.openId);
      this.level = entry ? cloneLevel(entry.level) : blankLevel();
      this.openId = entry?.id;
      this.pendingName = entry?.name ?? '';
    } else {
      this.level = blankLevel();
      this.openId = undefined;
      this.pendingName = '';
    }
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

  private saveLevel(): void {
    const name = (document.getElementById('ed-name') as HTMLInputElement | null)?.value ?? '';
    if (this.openId) {
      const entry = updateLevel(this.openId, name, this.level);
      this.openId = entry.id;
      this.pendingName = entry.name;
    } else {
      const entry = createLevel(name, this.level);
      this.openId = entry.id;
      this.pendingName = entry.name;
    }
    this.dirty = false;
    this.syncNameInput();
    this.refreshOpenList();
  }

  private syncNameInput(): void {
    const input = document.getElementById('ed-name') as HTMLInputElement | null;
    if (input) input.value = this.pendingName;
  }

  private refreshOpenList(): void {
    const select = document.getElementById('ed-open') as HTMLSelectElement | null;
    if (!select) return;
    select.textContent = '';
    const hint = document.createElement('option');
    hint.value = '';
    hint.textContent = 'Abrir…';
    select.appendChild(hint);
    for (const e of listLevels()) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      if (e.id === this.openId) opt.selected = true;
      select.appendChild(opt);
    }
    if (!this.openId) select.value = '';
  }

  private openEntry(id: string): void {
    if (!id) return;
    if (!this.confirmDiscard()) return;
    const entry = findLevel(id);
    if (!entry) return;
    this.pushHistory();
    this.openId = entry.id;
    this.pendingName = entry.name;
    this.level = cloneLevel(entry.level);
    this.dirty = false;
    this.lastPaintKey = '';
    this.centerCamera();
    this.renderLevel();
    this.syncNameInput();
    this.refreshOpenList();
    this.updateStatus();
  }

  private newDraft(): void {
    if (!this.confirmDiscard()) return;
    this.pushHistory();
    this.openId = undefined;
    this.pendingName = '';
    this.level = blankLevel();
    this.dirty = false;
    this.lastPaintKey = '';
    this.centerCamera();
    this.renderLevel();
    this.syncNameInput();
    this.refreshOpenList();
    this.updateStatus();
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

  private toolTab(tool: Tool | null): string {
    switch (tool) {
      case 'ground': return 'piso';
      case 'player_start': return 'personaje';
      case 'enemy': return 'enemigos';
      case 'fruit': return 'frutas';
      case 'gem': return 'gemas';
      case 'spikes': return 'obstaculos';
      default: return 'otros';
    }
  }

  private gotoTab(tab: string): void {
    document.querySelectorAll<HTMLElement>('#ed-tabs [data-edtab]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-edtab') === tab);
    });
    document.querySelectorAll<HTMLElement>('#ed-grids [data-edgrid]').forEach((g) => {
      g.hidden = g.getAttribute('data-edgrid') !== tab;
    });
  }

  private setTool(tool: Tool | null): void {
    this.tool = tool;
    this.refreshSelection();
    if (tool) this.gotoTab(this.toolTab(tool));
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
  }

  private bindUi(): void {
    this.buildTabs();
    this.buildGrids();
    this.refreshSelection();

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
    el('ed-validate').onclick = () => this.updateStatus();
    el('ed-save').onclick = () => {
      try {
        this.saveLevel();
      } catch (err) {
        this.flashStatus(err instanceof Error ? err.message : 'No se pudo guardar', false);
        return;
      }
      // Validar automáticamente al guardar: si hay errores se muestran,
      // si está válido se confirma el guardado.
      const errors = validateLevel(this.level);
      if (errors.length === 0) {
        this.flashStatus(`Nivel "${this.pendingName}" guardado`, true);
      } else {
        this.updateStatus();
      }
    };
    el('ed-publish').onclick = () => {
      void this.publishLevel();
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
      openSelect.onchange = () => {
        this.openEntry(openSelect.value);
        openSelect.blur();
      };
    }
    el('ed-new').onclick = () => this.newDraft();
    el('ed-delete').onclick = () => {
      if (!this.openId) {
        this.flashStatus('Nada que borrar: abrí un nivel guardado', false);
        return;
      }
      if (!confirm(`¿Borrar "${this.pendingName}"?`)) return;
      deleteLevel(this.openId);
      this.newDraft();
      this.flashStatus('Nivel borrado', true);
    };
    this.syncNameInput();
    this.refreshOpenList();
  }

  private buildTabs(): void {
    const tabs = document.querySelectorAll<HTMLElement>('#ed-tabs [data-edtab]');
    tabs.forEach((btn) => {
      btn.onclick = () => {
        tabs.forEach((b) => b.classList.toggle('active', b === btn));
        const tab = btn.getAttribute('data-edtab');
        document.querySelectorAll<HTMLElement>('#ed-grids [data-edgrid]').forEach((g) => {
          g.hidden = g.getAttribute('data-edgrid') !== tab;
        });
      };
    });
  }

  /** Miniatura 40px de un frame de spritesheet (frame 0). */
  private sheetThumb(url: string, fw: number, fh: number, frames: number, h = 36): Record<string, string> {
    const k = h / fh;
    return {
      backgroundImage: `url("${url}")`,
      backgroundSize: `${Math.round(frames * fw * k)}px ${Math.round(fh * k)}px`,
      backgroundPosition: '0 0',
    };
  }

  private optBtn(
    grid: HTMLElement,
    title: string,
    style: Record<string, string>,
    select: () => void,
    isSel: () => boolean,
  ): void {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'opt';
    opt.title = title;
    opt.style.backgroundImage = style['backgroundImage'];
    opt.style.backgroundSize = style['backgroundSize'];
    opt.style.backgroundPosition = style['backgroundPosition'];
    opt.onclick = () => {
      select();
      this.refreshSelection();
      if (this.tool) this.gotoTab(this.toolTab(this.tool));
    };
    this.optBtns.push({ btn: opt, isSel });
    grid.appendChild(opt);
  }

  private sectLabel(grid: HTMLElement, text: string): void {
    const s = document.createElement('div');
    s.className = 'ed-sect';
    s.textContent = text;
    grid.appendChild(s);
  }

  private optBtns: { btn: HTMLButtonElement; isSel: () => boolean }[] = [];

  private gridEl(tab: string): HTMLElement {
    const grid = document.querySelector<HTMLElement>(`#ed-grids [data-edgrid="${tab}"]`);
    if (!grid) throw new Error(`missing grid ${tab}`);
    return grid;
  }

  private buildGrids(): void {
    this.optBtns = [];
    // Piso: 252 variantes.
    {
      const grid = this.gridEl('piso');
      for (let v = 0; v < TILE_VARIANTS; v++) {
        const style = this.tileThumb(v);
        this.optBtn(grid, `Piso ${v}`, style, () => {
          this.tileVariant = v;
          this.tool = 'ground';
        }, () => this.tool === 'ground' && this.tileVariant === v);
      }
    }
    // Personaje.
    {
      const grid = this.gridEl('personaje');
      for (const c of CHAR_SKINS) {
        this.optBtn(grid, c.label, this.sheetThumb(c.idle.url, 32, 32, c.idle.frames), () => {
          this.playerSkin = c.id;
          this.tool = 'player_start';
        }, () => this.tool === 'player_start' && this.playerSkin === c.id);
      }
    }
    // Enemigos.
    {
      const grid = this.gridEl('enemigos');
      this.sectLabel(grid, 'Caminantes');
      for (const e of ENEMIES.filter((x) => x.kind === 'walker')) {
        this.optBtn(grid, e.label, this.sheetThumb(e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
          this.enemySkin = e.id;
          this.tool = 'enemy';
        }, () => this.tool === 'enemy' && this.enemySkin === e.id);
      }
      this.sectLabel(grid, 'Voladores');
      for (const e of ENEMIES.filter((x) => x.kind === 'flyer')) {
        this.optBtn(grid, e.label, this.sheetThumb(e.tex.url, e.tex.fw, e.tex.fh, e.tex.frames), () => {
          this.enemySkin = e.id;
          this.tool = 'enemy';
        }, () => this.tool === 'enemy' && this.enemySkin === e.id);
      }
    }
    // Frutas.
    {
      const grid = this.gridEl('frutas');
      for (const f of FRUITS) {
        const sheet = FRUIT_SHEETS.find((s) => s.key === f.key)!;
        this.optBtn(grid, f.label, this.sheetThumb(sheet.url, 32, 32, sheet.frames), () => {
          this.fruitSkin = f.id;
          this.tool = 'fruit';
        }, () => this.tool === 'fruit' && this.fruitSkin === f.id);
      }
    }
    // Gemas.
    {
      const grid = this.gridEl('gemas');
      for (const g of GEMS) {
        this.optBtn(grid, g.label, this.sheetThumb(g.url, 32, 32, 1), () => {
          this.gemColor = g.id;
          this.tool = 'gem';
        }, () => this.tool === 'gem' && this.gemColor === g.id);
      }
    }
    // Obstáculos.
    {
      const grid = this.gridEl('obstaculos');
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
        this.optBtn(grid, o.label, this.sheetThumb(url, fw, fh, frames), () => {
          this.obstacle = o.id;
          this.tool = 'spikes';
        }, () => this.tool === 'spikes' && this.obstacle === o.id);
      }
    }
    // Otros.
    {
      const grid = this.gridEl('otros');
      this.optBtn(grid, 'Item', this.sheetThumb(FRUIT_SHEETS[0].url, 32, 32, 17), () => {
        this.tool = 'item';
      }, () => this.tool === 'item');
      this.optBtn(grid, 'Checkpoint', this.sheetThumb(CHECKPOINT.off.url, 64, 64, 1), () => {
        this.tool = 'checkpoint';
      }, () => this.tool === 'checkpoint');
      this.optBtn(grid, 'Plataforma móvil', this.sheetThumb(PLATFORMS.mover.url, 32, 8, 8), () => {
        this.platformAxis = 'x';
        this.tool = 'platform';
      }, () => this.tool === 'platform' && this.platformAxis === 'x');
      this.optBtn(grid, 'Plataforma que cae', this.sheetThumb(PLATFORMS.faller.url, 32, 10, 4), () => {
        this.platformAxis = 'fall';
        this.tool = 'platform';
      }, () => this.tool === 'platform' && this.platformAxis === 'fall');
      for (const d of DECOS) {
        this.optBtn(grid, d.label, this.sheetThumb(d.url, d.w, d.h, 1), () => {
          this.decoSkin = d.id;
          this.tool = 'deco';
        }, () => this.tool === 'deco' && this.decoSkin === d.id);
      }
      this.optBtn(grid, 'Salida', this.sheetThumb(EXIT_DOOR.idle.url, 64, 64, 1), () => {
        this.tool = 'exit';
      }, () => this.tool === 'exit');
      const erase = document.createElement('button');
      erase.type = 'button';
      erase.className = 'opt text';
      erase.textContent = '⌫ Goma';
      erase.title = 'Borrar';
      erase.onclick = () => {
        this.tool = 'erase';
        this.refreshSelection();
      };
      this.optBtns.push({ btn: erase, isSel: () => this.tool === 'erase' });
      grid.appendChild(erase);
    }
  }

  private refreshSelection(): void {
    for (const o of this.optBtns) o.btn.classList.toggle('sel', o.isSel());
    this.updateGhost(this.hoverX, this.hoverY);
  }

  private refreshToolHighlight(): void {
    this.refreshSelection();
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

  private async publishLevel(): Promise<void> {
    const errors = validateLevel(this.level);
    if (errors.length > 0) {
      this.flashStatus('Corrige los errores antes de publicar', false);
      return;
    }
    if (!getToken()) {
      this.flashStatus('Entrá con tu cuenta desde el menú para publicar', false);
      return;
    }
    try {
      this.saveLevel();
    } catch (err) {
      this.flashStatus(err instanceof Error ? err.message : 'No se pudo guardar', false);
      return;
    }
    const entry = findLevel(this.openId ?? '');
    if (!entry) return;
    try {
      const out = entry.remoteId
        ? await updateRemoteLevel(entry.remoteId, entry.name, entry.level)
        : await publishLevel(entry.name, entry.level);
      setRemote(entry.id, out.id, out.pin);
      this.flashStatus(`Publicado · PIN ${out.pin}`, true);
    } catch (err) {
      this.flashStatus(err instanceof Error ? err.message : 'No se pudo publicar', false);
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
      openId: this.openId,
      name: (document.getElementById('ed-name') as HTMLInputElement | null)?.value ?? this.pendingName,
    });
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.painting = true;
      this.panning = false;
      this.erasing = pointer.rightButtonDown();
      this.downX = pointer.x;
      this.downY = pointer.y;
      this.lastPaintKey = '';
      this.strokeSnapshot = cloneLevel(this.level);
      this.paintAt(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
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
      if (!this.panning) {
        const dx = pointer.x - this.downX;
        const dy = pointer.y - this.downY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.panning = true;
      }
      if (this.panning) {
        const dx = pointer.x - this.downX;
        const dy = pointer.y - this.downY;
        this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
        this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
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
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number,
      ) => {
        const next = Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.25, 4);
        this.cameras.main.setZoom(next);
      },
    );

    this.input.keyboard?.on('keydown-E', () => {
      this.setTool('erase');
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.setTool(null);
    });
    this.input.keyboard?.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (this.typing()) return;
      e.preventDefault();
      this.testLevel();
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
