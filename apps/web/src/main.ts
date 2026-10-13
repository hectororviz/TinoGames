import Phaser from 'phaser';
import { FEEL } from './feel.js';
import { GameScene } from './game.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 480,
  height: 270,
  backgroundColor: '#87b5e8',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: FEEL.gravity }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
