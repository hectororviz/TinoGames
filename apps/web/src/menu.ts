import Phaser from 'phaser';
import sampleLevel from '@tinogames/level-schema/levels/sample-level-1.json';
import type { Level } from '@tinogames/level-schema';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    document.body.classList.remove('playing', 'editing');
    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add
      .text(240, 60, 'TinoGames', {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 100, 'Plataformas 2D con editor de niveles', {
        fontSize: '13px',
        color: '#aaaacc',
      })
      .setOrigin(0.5);

    const playBtn = this.add
      .text(240, 150, '  Jugar  ', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#4a9eff',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playBtn.on('pointerover', () => playBtn.setStyle({ backgroundColor: '#6ab0ff' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ backgroundColor: '#4a9eff' }));
    playBtn.on('pointerdown', () => {
      this.scene.start('game', { level: sampleLevel as Level });
    });

    const editorBtn = this.add
      .text(240, 200, '  Editor  ', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#555555',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    editorBtn.on('pointerover', () => editorBtn.setStyle({ backgroundColor: '#777777' }));
    editorBtn.on('pointerout', () => editorBtn.setStyle({ backgroundColor: '#555555' }));
    editorBtn.on('pointerdown', () => {
      this.scene.start('editor');
    });
  }
}
