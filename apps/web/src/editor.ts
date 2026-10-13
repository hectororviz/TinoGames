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
  private tool: Tool = 'ground';
  private tileVariant = 0;
  private playerSkin = 'pink';
  private enemySkin = 'pig';
  private fruitSkin = 'apple';
  private gemColor = 'purple';
  private platformAxis = 'x';
  private obstacle = 'spikes';
  private decoSkin = 'box1';
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.GameObject[] = [];
  private lastGridKey = '';
  private painting = false;
  private panning = false;
  private downX = 0;
  private downY = 0;
  private lastPaintKey = '';

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

  private preview(kind: string, props?: Record<string, unknown>): { tex: string; frame?: number; h: number } {
    switch (kind) {
      case 'player_start': {
        const skin = CHAR_SKINS.find((c) => c.id === props?.['skin']) ?? CHAR_SKINS[0];
        return { tex: skin.idle.key, frame: 0, h: 16 };
      }
      case 'walker':
      case 'flyer': {
        const skin = ENEMIES.find((s) => s.id === props?.['skin'] && s.kind === kind)
          ?? ENEMIES.find((s) => s.kind === kind)!;
        return { tex: skin.tex.key, frame: 0, h: 18 };
      }
      case 'fruit': {
        const f = FRUITS.find((x) => x.id === props?.['skin']) ?? FRUITS[0];
        return { tex: f.key, frame: 0, h: 14 };
      }
      case 'gem': {
        const gem = GEMS.find((x) => x.id === props?.['color']) ?? GEMS[0];
        return { tex: gem.key, h: 14 };
      }
      case 'item':
        return { tex: 'apple', frame: 0, h: 14 };
      case 'checkpoint':
        return { tex: CHECKPOINT.off.key, h: 24 };
      case 'platform': {
        const axis = props?.['axis'];
        return { tex: axis === 'fall' ? PLATFORMS.faller.key : PLATFORMS.mover.key, frame: 0, h: 10 };
      }
      case 'spikes': {
        const variant = (props?.['variant'] as string | undefined) ?? 'spikes';
        const def = OBSTACLES.find((o) => o.id === variant) ?? OBSTACLES[0];
        if (def.tex) return { tex: def.tex.key, frame: 0, h: def.id === 'saw' ? 22 : 18 };
        return { tex: def.image!.key, h: 18 };
      }
      case 'deco': {
        const d = DECOS.find((x) => x.id === props?.['skin']) ?? DECOS[0];
        return { tex: d.key, h: 18 };
      }
      case 'exit':
        return { tex: 'exit', h: 24 };
      default:
        return { tex: 'apple', frame: 0, h: 14 };
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
      const fh = this.textures.get(p.tex).getSourceImage() as { height?: number };
      const scale = p.h / ((fh.height as number | undefined) ?? p.h);
      sprite.setScale(scale);
      this.sprites.push(sprite);
    }
  }

  private bindUi(): void {
    const tools = document.querySelectorAll<HTMLElement>('#editor-ui [data-tool]');
    tools.forEach((btn) => {
      btn.onclick = () => {
        const next = btn.getAttribute('data-tool') as Tool | null;
        if (next) {
          this.tool = next;
          this.refreshToolHighlight();
        }
      };
    });
    this.refreshToolHighlight();
    this.buildTileGrid();
    this.refreshTileButton();

    const wire = (id: string, fn: (value: string) => void, current: () => string): void => {
      const s = selectEl(id);
      s.value = current();
      s.onchange = () => {
        fn(s.value);
        this.refreshToolHighlight();
      };
    };
    wire('ed-player', (v) => { this.playerSkin = v; this.tool = 'player_start'; }, () => this.playerSkin);
    wire('ed-enemy', (v) => { this.enemySkin = v; this.tool = 'enemy'; }, () => this.enemySkin);
    wire('ed-fruit', (v) => { this.fruitSkin = v; this.tool = 'fruit'; }, () => this.fruitSkin);
    wire('ed-gem', (v) => { this.gemColor = v; this.tool = 'gem'; }, () => this.gemColor);
    wire('ed-platform', (v) => { this.platformAxis = v; this.tool = 'platform'; }, () => this.platformAxis);
    wire('ed-obstacle', (v) => { this.obstacle = v; this.tool = 'spikes'; }, () => this.obstacle);
    wire('ed-deco', (v) => { this.decoSkin = v; this.tool = 'deco'; }, () => this.decoSkin);
    this.fillCatalogSelects();

    el('ed-collapse').onclick = () => {
      document.body.classList.toggle('ed-collapsed');
    };
    el('ed-validate').onclick = () => this.updateStatus();
    el('ed-save').onclick = () => {
      try {
        this.saveLevel();
        this.flashStatus(`Nivel "${this.pendingName}" guardado`, true);
      } catch (err) {
        this.flashStatus(err instanceof Error ? err.message : 'No se pudo guardar', false);
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

  private fillCatalogSelects(): void {
    fillSelect(selectEl('ed-player'), [
      { options: CHAR_SKINS.map((c) => ({ value: c.id, label: c.label })) },
    ]);
    fillSelect(selectEl('ed-enemy'), [
      { label: 'Caminantes', options: ENEMIES.filter((e) => e.kind === 'walker').map((e) => ({ value: e.id, label: e.label })) },
      { label: 'Voladores', options: ENEMIES.filter((e) => e.kind === 'flyer').map((e) => ({ value: e.id, label: e.label })) },
    ]);
    fillSelect(selectEl('ed-fruit'), [
      { options: FRUITS.map((f) => ({ value: f.id, label: f.label })) },
    ]);
    fillSelect(selectEl('ed-gem'), [
      { options: GEMS.map((g) => ({ value: g.id, label: g.label })) },
    ]);
    fillSelect(selectEl('ed-obstacle'), [
      { options: OBSTACLES.map((o) => ({ value: o.id, label: o.label })) },
    ]);
    fillSelect(selectEl('ed-deco'), [
      { options: DECOS.map((d) => ({ value: d.id, label: d.label })) },
    ]);
    selectEl('ed-player').value = this.playerSkin;
    selectEl('ed-enemy').value = this.enemySkin;
    selectEl('ed-fruit').value = this.fruitSkin;
    selectEl('ed-gem').value = this.gemColor;
    selectEl('ed-platform').value = this.platformAxis;
    selectEl('ed-obstacle').value = this.obstacle;
    selectEl('ed-deco').value = this.decoSkin;
  }

  private refreshToolHighlight(): void {
    const tools = document.querySelectorAll<HTMLElement>('#editor-ui [data-tool]');
    tools.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === this.tool);
    });
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

  private refreshTileButton(): void {
    const btn = document.getElementById('ed-tile-btn');
    if (!btn) return;
    const style = this.tileThumb(this.tileVariant);
    btn.style.backgroundImage = style['backgroundImage'];
    btn.style.backgroundSize = style['backgroundSize'];
    btn.style.backgroundPosition = style['backgroundPosition'];
  }

  private buildTileGrid(): void {
    const grid = document.getElementById('ed-tile-grid');
    const btn = document.getElementById('ed-tile-btn');
    if (!grid || !btn || grid.childElementCount > 0) return;
    for (let v = 0; v < TILE_VARIANTS; v++) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.title = `Piso ${v}`;
      opt.dataset['v'] = String(v);
      const style = this.tileThumb(v);
      opt.style.backgroundImage = style['backgroundImage'];
      opt.style.backgroundSize = style['backgroundSize'];
      opt.style.backgroundPosition = style['backgroundPosition'];
      opt.onclick = () => {
        this.tileVariant = v;
        this.tool = 'ground';
        this.refreshToolHighlight();
        this.refreshTileButton();
        grid.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('sel', b === opt);
        });
        grid.hidden = true;
      };
      grid.appendChild(opt);
    }
    btn.onclick = () => {
      grid.hidden = !grid.hidden;
      if (!grid.hidden) {
        const r = btn.getBoundingClientRect();
        grid.style.top = `${r.bottom + 4}px`;
        grid.style.left = `${Math.max(4, r.left)}px`;
      }
    };
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
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.painting = true;
      this.panning = false;
      this.downX = pointer.x;
      this.downY = pointer.y;
      this.lastPaintKey = '';
      this.paintAt(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.painting || !pointer.isDown) return;
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
      this.painting = false;
      this.panning = false;
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
      this.tool = 'erase';
      this.refreshToolHighlight();
    });
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

  private paintEntity(x: number, y: number): void {
    let kind: Entity['kind'];
    const props: Record<string, unknown> = {};
    switch (this.tool) {
      case 'player_start':
        kind = 'player_start';
        if (this.playerSkin !== 'pink') props['skin'] = this.playerSkin;
        break;
      case 'enemy': {
        const skin = ENEMIES.find((s) => s.id === this.enemySkin) ?? ENEMIES[0];
        kind = skin.kind;
        props['skin'] = skin.id;
        if (skin.kind === 'walker') {
          props['range'] = skin.range ?? 4;
          props['speed'] = skin.speed ?? 40;
        }
        break;
      }
      case 'fruit':
        kind = 'fruit';
        props['skin'] = this.fruitSkin;
        break;
      case 'gem':
        kind = 'gem';
        props['color'] = this.gemColor;
        break;
      case 'item':
        kind = 'item';
        break;
      case 'checkpoint':
        kind = 'checkpoint';
        break;
      case 'platform':
        kind = 'platform';
        props['axis'] = this.platformAxis;
        props['range'] = 3;
        props['speed'] = 50;
        break;
      case 'spikes':
        kind = 'spikes';
        if (this.obstacle !== 'spikes') props['variant'] = this.obstacle;
        break;
      case 'deco':
        kind = 'deco';
        props['skin'] = this.decoSkin;
        break;
      case 'exit':
        kind = 'exit';
        props['needsAllItems'] = true;
        break;
      default:
        return;
    }
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
