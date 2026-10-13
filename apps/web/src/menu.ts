import Phaser from 'phaser';
import { validateLevel } from '@tinogames/level-schema';
import { deleteLevel, importRemote, listLevels } from './levels.js';
import {
  deleteRemoteLevel,
  getByPin,
  getRemote,
  getToken,
  listMine,
  login,
  logout,
  me,
  register,
  type RemoteLevelMeta,
} from './api.js';

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

    this.renderAuth();
    this.renderPin();
    this.renderMine();
    this.renderList();
    document.getElementById('menu-new')!.onclick = () => {
      this.scene.start('editor', {});
    };
  }

  private row(box: HTMLElement, name: string, opts: { badge?: string; buttons: { label: string; disabled?: boolean; onClick: () => void }[] }): void {
    const row = document.createElement('div');
    row.className = 'menu-row';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = name;
    row.appendChild(nm);
    if (opts.badge) {
      const bad = document.createElement('span');
      bad.className = 'bad';
      bad.textContent = opts.badge;
      row.appendChild(bad);
    }
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.disabled = b.disabled ?? false;
      btn.onclick = b.onClick;
      row.appendChild(btn);
    }
    box.appendChild(row);
  }

  private renderAuth(): void {
    const box = document.getElementById('menu-auth')!;
    box.textContent = '';
    if (!getToken()) {
      const email = document.createElement('input');
      email.type = 'email';
      email.placeholder = 'Email';
      email.setAttribute('aria-label', 'Email');
      const pass = document.createElement('input');
      pass.type = 'password';
      pass.placeholder = 'Contraseña (8+)';
      pass.setAttribute('aria-label', 'Contraseña');
      const err = document.createElement('span');
      err.className = 'bad';
      const go = async (fn: (e: string, p: string) => Promise<unknown>): Promise<void> => {
        err.textContent = '';
        try {
          await fn(email.value, pass.value);
          this.renderAuth();
          this.renderMine();
        } catch (e) {
          err.textContent = e instanceof Error ? e.message : 'Error';
        }
      };
      const inBtn = document.createElement('button');
      inBtn.type = 'button';
      inBtn.textContent = 'Entrar';
      inBtn.onclick = () => void go(login);
      const regBtn = document.createElement('button');
      regBtn.type = 'button';
      regBtn.textContent = 'Registrarme';
      regBtn.onclick = () => void go(register);
      box.append(email, pass, inBtn, regBtn, err);
      return;
    }
    const who = document.createElement('span');
    who.className = 'nm';
    who.textContent = 'Hola…';
    const outBtn = document.createElement('button');
    outBtn.type = 'button';
    outBtn.textContent = 'Salir';
    outBtn.onclick = () => {
      logout();
      this.renderAuth();
      this.renderMine();
    };
    box.append(who, outBtn);
    me().then(
      (u) => {
        who.textContent = `Hola, ${u.email}`;
      },
      () => {
        logout();
        this.renderAuth();
        this.renderMine();
      },
    );
  }

  private renderPin(): void {
    const input = document.getElementById('menu-pin') as HTMLInputElement;
    const btn = document.getElementById('menu-pin-go')!;
    const err = document.getElementById('menu-pin-err')!;
    btn.onclick = () => {
      err.textContent = '';
      const pin = input.value.trim();
      if (!pin) return;
      btn.setAttribute('disabled', '');
      getByPin(pin).then(
        (level) => {
          btn.removeAttribute('disabled');
          this.scene.start('game', { level: level.body });
        },
        (e) => {
          btn.removeAttribute('disabled');
          err.textContent = e instanceof Error ? e.message : 'No encontrado';
        },
      );
    };
  }

  private renderMine(): void {
    const box = document.getElementById('menu-mine')!;
    box.textContent = '';
    if (!getToken()) {
      const empty = document.createElement('div');
      empty.id = 'menu-empty';
      empty.textContent = 'Entrá con tu cuenta para ver tus niveles del servidor.';
      box.appendChild(empty);
      return;
    }
    const loading = document.createElement('div');
    loading.id = 'menu-empty';
    loading.textContent = 'Cargando mis niveles…';
    box.appendChild(loading);
    listMine().then(
      (levels: RemoteLevelMeta[]) => {
        box.textContent = '';
        if (levels.length === 0) {
          const empty = document.createElement('div');
          empty.id = 'menu-empty';
          empty.textContent = 'Todavía no publicaste niveles.';
          box.appendChild(empty);
          return;
        }
        for (const entry of levels) {
          this.row(box, `${entry.title}`, {
            badge: entry.pin ?? undefined,
            buttons: [
              {
                label: 'Editar',
                onClick: () => {
                  getRemote(entry.id).then(
                    (full) => {
                      const local = importRemote(full.title, full.id, full.pin ?? '', full.body);
                      this.scene.start('editor', { openId: local.id });
                    },
                    () => this.renderMine(),
                  );
                },
              },
              {
                label: 'Borrar',
                onClick: () => {
                  if (!confirm(`¿Borrar "${entry.title}" del servidor?`)) return;
                  deleteRemoteLevel(entry.id).then(
                    () => this.renderMine(),
                    () => this.renderMine(),
                  );
                },
              },
            ],
          });
        }
      },
      () => {
        box.textContent = '';
      },
    );
  }

  private renderList(): void {
    const box = document.getElementById('menu-list')!;
    box.textContent = '';
    const entries = listLevels().sort((a, b) => b.updatedAt - a.updatedAt);
    document.getElementById('menu-empty')!.style.display = entries.length === 0 ? 'block' : 'none';
    for (const entry of entries) {
      const valid = validateLevel(entry.level).length === 0;
      this.row(box, entry.pin ? `${entry.name} · ${entry.pin}` : entry.name, {
        badge: valid ? undefined : 'inválido',
        buttons: [
          {
            label: 'Jugar',
            disabled: !valid,
            onClick: () => {
              this.scene.start('game', { level: entry.level });
            },
          },
          {
            label: 'Editar',
            onClick: () => {
              this.scene.start('editor', { openId: entry.id });
            },
          },
          {
            label: 'Borrar',
            onClick: () => {
              if (!confirm(`¿Borrar "${entry.name}"?`)) return;
              deleteLevel(entry.id);
              this.renderList();
            },
          },
        ],
      });
    }
  }
}
