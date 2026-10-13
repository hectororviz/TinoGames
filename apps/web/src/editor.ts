import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import type { Entity, Level } from '@tinogames/level-schema';
import {
  blankLevel,
  cloneLevel,
  createLevel,
  deleteLevel,
  findLevel,
  listLevels,
  updateLevel,
} from './levels.js';
import type { EditorData } from './levels.js';
import tilesPaUrl from '../../../assets/tiles_pa.png?url';
import vendorSpikeUrl from '../../../assets/vendor_pa_spike.png?url';
import pinkUrl from '../../../assets/pink.png?url';
import appleUrl from '../../../assets/Apple.png?url';

const T = 16;
/** Distancia en px de pantalla para distinguir click (pintar) de drag (pan). */
const DRAG_THRESHOLD = 6;

type Tool = 'ground' | 'player_start' | 'walker' | 'flyer' | 'item' | 'spikes' | 'exit' | 'erase';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export class EditorScene extends Phaser.Scene {
  private level!: Level;
  private openId: string | undefined;
  private pendingName = '';
  private dirty = false;
  private tool: Tool = 'ground';
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
    this.load.spritesheet('tile', tilesPaUrl, { frameWidth: T, frameHeight: T });
    this.load.image('spike', vendorSpikeUrl);
    this.load.spritesheet('pink', pinkUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('apple', appleUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.once('complete', () => {
      this.makeTextures();
      this.setupScene();
    });
    this.load.start();
  }

  private makeTextures(): void {
    // En revisitas las texturas ya existen en el TextureManager global.
    if (this.textures.exists('walker') && this.textures.exists('flyer') && this.textures.exists('exit')) {
      return;
    }
    const g = this.add.graphics();
    if (!this.textures.exists('walker')) {
      g.fillStyle(0xcc3333, 1).fillRect(0, 0, 28, 28);
      g.fillStyle(0xffffff, 1).fillCircle(8, 10, 4);
      g.fillStyle(0xffffff, 1).fillCircle(20, 10, 4);
      g.fillStyle(0x000000, 1).fillCircle(9, 11, 2);
      g.fillStyle(0x000000, 1).fillCircle(21, 11, 2);
      g.generateTexture('walker', 28, 28);
      g.clear();
    }
    if (!this.textures.exists('flyer')) {
      g.fillStyle(0x3388ff, 1).fillCircle(16, 16, 12);
      g.fillStyle(0xffffff, 1).fillCircle(16, 16, 6);
      g.generateTexture('flyer', 32, 32);
      g.clear();
    }
    if (!this.textures.exists('exit')) {
      g.fillStyle(0xc084fc, 1).fillRect(0, 0, 16, 32);
      g.fillStyle(0xe9d5ff, 1).fillRect(0, 0, 16, 4);
      g.generateTexture('exit', 16, 32);
      g.clear();
    }
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

  private renderLevel(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];

    for (const tile of this.level.tiles) {
      const sprite = this.add.image(tile.x * T, tile.y * T, 'tile', 0);
      sprite.setOrigin(0, 0);
      this.sprites.push(sprite);
    }

    for (const entity of this.level.entities) {
      let texture = 'apple';
      let frame: number | undefined = 0;
      switch (entity.kind) {
        case 'player_start':
          texture = 'pink';
          frame = 0;
          break;
        case 'walker':
          texture = 'walker';
          frame = undefined;
          break;
        case 'flyer':
          texture = 'flyer';
          frame = undefined;
          break;
        case 'item':
          texture = 'apple';
          frame = 0;
          break;
        case 'spikes':
          texture = 'spike';
          frame = undefined;
          break;
        case 'exit':
          texture = 'exit';
          frame = undefined;
          break;
      }
      const cx = entity.x * T + T / 2;
      const cy = entity.y * T + T / 2;
      const sprite = this.add.image(cx, cy, texture, frame);
      sprite.setOrigin(0.5, 0.5);
      // Sprites de 32px (pink/apple/flyer) se escalan al tile de 16px.
      if (texture === 'pink' || texture === 'apple' || texture === 'flyer') {
        sprite.setDisplaySize(T, T);
      }
      this.sprites.push(sprite);
    }
  }

  private bindUi(): void {
    const tools = document.querySelectorAll<HTMLElement>('#ed-tools [data-tool]');
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

    el('ed-validate').onclick = () => this.updateStatus();
    el('ed-save').onclick = () => {
      try {
        this.saveLevel();
        this.flashStatus(`Nivel "${this.pendingName}" guardado`, true);
      } catch (err) {
        this.flashStatus(err instanceof Error ? err.message : 'No se pudo guardar', false);
      }
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

  private refreshToolHighlight(): void {
    const tools = document.querySelectorAll<HTMLElement>('#ed-tools [data-tool]');
    tools.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === this.tool);
    });
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

  private exportLevel(): void {
    const json = JSON.stringify(this.level, null, 2);
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
    this.level.tiles.push({ x, y, t: 'ground' });
  }

  private paintEntity(x: number, y: number): void {
    const kind = this.tool as Entity['kind'];
    if (kind === 'player_start' || kind === 'exit') {
      this.level.entities = this.level.entities.filter((e) => e.kind !== kind);
    }
    this.level.entities = this.level.entities.filter((e) => !(e.x === x && e.y === y));

    const entity: Entity = { kind, x, y };
    switch (kind) {
      case 'walker':
        entity.props = { range: 4, speed: 40 };
        break;
      case 'flyer':
        entity.props = { amp: 2, freq: 1.5 };
        break;
      case 'exit':
        entity.props = { needsAllItems: true };
        break;
    }
    this.level.entities.push(entity);
  }

  private eraseAt(x: number, y: number): void {
    this.level.tiles = this.level.tiles.filter((t) => !(t.x === x && t.y === y));
    this.level.entities = this.level.entities.filter((e) => !(e.x === x && e.y === y));
  }
}
