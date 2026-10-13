import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import { deleteLevel, listLevels } from './levels.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    document.body.classList.add('menu');
    document.body.classList.remove('playing', 'editing');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('menu');
    });
    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add
      .text(240, 40, 'TinoGames', {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(240, 76, 'Elegí un nivel para jugar o crear', {
        fontSize: '13px',
        color: '#aaaacc',
      })
      .setOrigin(0.5, 0);

    this.renderList();
    document.getElementById('menu-new')!.onclick = () => {
      this.scene.start('editor', {});
    };
  }

  private renderList(): void {
    const box = document.getElementById('menu-list')!;
    box.textContent = '';
    const entries = listLevels().sort((a, b) => b.updatedAt - a.updatedAt);
    document.getElementById('menu-empty')!.style.display = entries.length === 0 ? 'block' : 'none';
    for (const entry of entries) {
      const valid = validateLevel(entry.level).length === 0;
      const row = document.createElement('div');
      row.className = 'menu-row';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = entry.name;
      row.appendChild(nm);
      if (!valid) {
        const bad = document.createElement('span');
        bad.className = 'bad';
        bad.textContent = 'inválido';
        row.appendChild(bad);
      }
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = 'Jugar';
      play.disabled = !valid;
      play.onclick = () => {
        this.scene.start('game', { level: entry.level });
      };
      row.appendChild(play);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Editar';
      edit.onclick = () => {
        this.scene.start('editor', { openId: entry.id });
      };
      row.appendChild(edit);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Borrar';
      del.onclick = () => {
        if (!confirm(`¿Borrar "${entry.name}"?`)) return;
        deleteLevel(entry.id);
        this.renderList();
      };
      row.appendChild(del);
      box.appendChild(row);
    }
  }
}
