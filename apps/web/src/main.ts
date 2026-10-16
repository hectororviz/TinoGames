import Phaser from 'phaser';
import { FEEL } from './feel.js';
import { GameScene } from './game.js';
import { MenuScene } from './menu.js';
import { EditorScene } from './editor.js';

const debugHitbox = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 270,
  backgroundColor: '#87b5e8',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: FEEL.gravityUp }, debug: debugHitbox },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, GameScene, EditorScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
