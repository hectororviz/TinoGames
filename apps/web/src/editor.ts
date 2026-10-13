import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import type { Entity, Level } from '@tinogames/level-schema';
import tilesPaUrl from '../../../assets/tiles_pa.png?url';
import vendorSpikeUrl from '../../../assets/vendor_pa_spike.png?url';
import pinkUrl from '../../../assets/pink.png?url';
import appleUrl from '../../../assets/Apple.png?url';

const T = 16;
const STORAGE_KEY = 'tinogames-level';
const UI_HEIGHT = 100;

type Tool = 'ground' | 'player_start' | 'walker' | 'flyer' | 'item' | 'spikes' | 'exit' | 'erase';

export class EditorScene extends Phaser.Scene {
  private level!: Level;
  private tool: Tool = 'ground';
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.GameObject[] = [];
  private paletteTexts = new Map<Tool, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor() {
    super('editor');
  }

  create(): void {
    this.level = this.loadLevel();
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.loadSprites();
  }

  private loadSprites(): void {
    this.load.spritesheet('tile', tilesPaUrl, { frameWidth: T, frameHeight: T });
    this.load.image('spike', vendorSpikeUrl);
    this.load.image('walker', pinkUrl);
    this.load.image('flyer', pinkUrl);
    this.load.image('exit', pinkUrl);
    this.load.image('player', pinkUrl);
    this.load.image('item', appleUrl);
    this.load.once('complete', () => {
      this.makeTextures();
      this.setupScene();
    });
    this.load.start();
  }

  private makeTextures(): void {
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
    g.fillStyle(0xc084fc, 1).fillRect(0, 0, 16, 32);
    g.fillStyle(0xe9d5ff, 1).fillRect(0, 0, 16, 4);
    g.generateTexture('exit', 16, 32);
    g.destroy();
  }

  private setupScene(): void {
    this.drawGrid();
    this.renderLevel();
    this.createPalette();
    this.createButtons();
    this.setupInput();
    this.updateStatus();
  }

  private loadLevel(): Level {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Level;
        if (parsed.format === 2) return parsed;
      }
    } catch {
      // ignorar
    }
    return { format: 2, game: '0.2', theme: 'pixel-adventure', tiles: [], entities: [] };
  }

  private saveLevel(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.level));
  }

  private drawGrid(): void {
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(1, 0x333333, 0.5);
    const w = this.scale.width;
    const h = this.scale.height;
    for (let x = 0; x <= w; x += T) this.gridGraphics.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += T) this.gridGraphics.lineBetween(0, y, w, y);
    this.gridGraphics.setScrollFactor(0);
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
      let texture = 'item';
      switch (entity.kind) {
        case 'player_start':
          texture = 'player';
          break;
        case 'walker':
          texture = 'walker';
          break;
        case 'flyer':
          texture = 'flyer';
          break;
        case 'item':
          texture = 'item';
          break;
        case 'spikes':
          texture = 'spike';
          break;
        case 'exit':
          texture = 'exit';
          break;
      }
      const sprite = this.add.image(entity.x * T, entity.y * T, texture);
      sprite.setOrigin(0, 0);
      this.sprites.push(sprite);
    }
  }

  private createPalette(): void {
    const tools: { tool: Tool; label: string; x: number }[] = [
      { tool: 'ground', label: 'Piso', x: 10 },
      { tool: 'erase', label: 'Borrar', x: 70 },
      { tool: 'player_start', label: 'Inicio', x: 130 },
      { tool: 'walker', label: 'Walker', x: 190 },
      { tool: 'flyer', label: 'Flyer', x: 250 },
      { tool: 'item', label: 'Item', x: 310 },
      { tool: 'spikes', label: 'Pinchos', x: 370 },
      { tool: 'exit', label: 'Salida', x: 430 },
    ];

    for (const item of tools) {
      const text = this.add
        .text(item.x, 10, item.label, {
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#333333',
          padding: { x: 6, y: 4 },
        })
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => {
        this.tool = item.tool;
        this.updatePaletteHighlight();
      });
      this.paletteTexts.set(item.tool, text);
    }
    this.updatePaletteHighlight();
  }

  private updatePaletteHighlight(): void {
    for (const [tool, text] of this.paletteTexts) {
      text.setStyle({ backgroundColor: tool === this.tool ? '#4a9eff' : '#333333' });
    }
  }

  private createButtons(): void {
    const buttons = [
      { id: 'validate', label: 'Validar', x: 10 },
      { id: 'save', label: 'Guardar', x: 80 },
      { id: 'export', label: 'Exportar', x: 150 },
      { id: 'import', label: 'Importar', x: 220 },
      { id: 'test', label: 'Probar', x: 290 },
    ];

    for (const btn of buttons) {
      this.add
        .text(btn.x, 40, btn.label, {
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: '#555555',
          padding: { x: 6, y: 4 },
        })
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.handleAction(btn.id));
    }

    this.statusText = this.add
      .text(10, 70, '', { fontSize: '11px', color: '#ff4444' })
      .setScrollFactor(0);
  }

  private handleAction(action: string): void {
    switch (action) {
      case 'validate':
        this.updateStatus();
        break;
      case 'save':
        this.saveLevel();
        this.flashStatus('Nivel guardado', '#44ff44');
        break;
      case 'export':
        this.exportLevel();
        break;
      case 'import':
        this.importLevel();
        break;
      case 'test':
        this.testLevel();
        break;
    }
  }

  private updateStatus(): void {
    const errors = validateLevel(this.level);
    if (errors.length === 0) {
      this.statusText.setText('Nivel valido');
      this.statusText.setColor('#44ff44');
    } else {
      this.statusText.setText(errors.map((e) => e.message).join('\n'));
      this.statusText.setColor('#ff4444');
    }
  }

  private flashStatus(message: string, color: string): void {
    this.statusText.setText(message);
    this.statusText.setColor(color);
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
            this.renderLevel();
            this.updateStatus();
            this.flashStatus('Nivel importado', '#44ff44');
          } else {
            this.flashStatus('Formato invalido', '#ff4444');
          }
        } catch {
          this.flashStatus('Error al leer archivo', '#ff4444');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private testLevel(): void {
    const errors = validateLevel(this.level);
    if (errors.length > 0) {
      this.flashStatus('Corrige los errores antes de probar', '#ff4444');
      return;
    }
    this.scene.start('game', { level: this.level });
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < UI_HEIGHT) return;
      this.isPanning = true;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
        this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
      } else if (pointer.isDown && pointer.y >= UI_HEIGHT) {
        this.paintAt(pointer);
      }
    });

    this.input.on('pointerup', () => {
      this.isPanning = false;
    });

    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number,
      ) => {
        const newZoom = Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.25, 4);
        this.cameras.main.setZoom(newZoom);
      },
    );

    this.input.keyboard?.on('keydown-SPACE', () => {
      this.tool = 'erase';
      this.updatePaletteHighlight();
    });
  }

  private paintAt(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / T);
    const tileY = Math.floor(worldPoint.y / T);
    if (tileX < 0 || tileY < 0) return;

    if (this.tool === 'erase') {
      this.eraseAt(tileX, tileY);
    } else if (this.tool === 'ground') {
      this.paintGround(tileX, tileY);
    } else {
      this.paintEntity(tileX, tileY);
    }
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
