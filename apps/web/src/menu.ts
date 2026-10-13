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

let pendingCreate = false;

export function openModal(title: string): HTMLElement {
  const root = document.getElementById('modal-root')!;
  const box = document.getElementById('modal-content')!;
  box.textContent = '';
  const h = document.createElement('h2');
  h.textContent = title;
  box.appendChild(h);
  root.hidden = false;
  return box;
}

export function closeModal(): void {
  document.getElementById('modal-root')!.hidden = true;
  document.getElementById('modal-content')!.textContent = '';
}

function wireModalChrome(): void {
  document.getElementById('modal-x')!.onclick = () => closeModal();
  document.getElementById('modal-backdrop')!.onclick = () => closeModal();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-root')!.hidden) closeModal();
  });
}

wireModalChrome();

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
    // Home nuevo (paso 1).
    closeModal();
    document.getElementById('btn-profile')!.onclick = () => this.openProfile();
    document.getElementById('home-create')!.onclick = () => this.createLevel();
    document.getElementById('home-search')!.onclick = () => this.openSearch();
    document.getElementById('home-mine')!.onclick = () => this.openMine();
    this.renderHome();
  }

  private renderHome(): void {
    document.getElementById('home-mine')!.hidden = !getToken();
  }

  private createLevel(): void {
    if (getToken()) {
      this.scene.start('editor', {});
      return;
    }
    pendingCreate = true;
    this.openProfile('login');
  }

  private openSearch(): void {
    openModal('Buscar nivel');
    const box = document.getElementById('modal-content')!;
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const pinTab = document.createElement('button');
    pinTab.type = 'button';
    pinTab.textContent = 'Por PIN';
    pinTab.classList.add('active');
    const soonTab = document.createElement('button');
    soonTab.type = 'button';
    soonTab.textContent = 'Buscar (próximamente)';
    soonTab.setAttribute('disabled', '');
    tabs.append(pinTab, soonTab);
    const input = document.createElement('input');
    input.placeholder = 'PIN XXXX-XXXX';
    input.maxLength = 9;
    input.setAttribute('aria-label', 'PIN de nivel');
    const err = document.createElement('div');
    err.className = 'err';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'action primary';
    go.textContent = 'Jugar';
    go.onclick = () => {
      err.textContent = '';
      const pin = input.value.trim();
      if (!pin) return;
      go.setAttribute('disabled', '');
      getByPin(pin).then(
        (level) => {
          closeModal();
          this.scene.start('game', { level: level.body });
        },
        (e) => {
          go.removeAttribute('disabled');
          err.textContent = e instanceof Error ? e.message : 'No encontrado';
        },
      );
    };
    box.append(tabs, input, go, err);
  }

  private openMine(): void {
    // Paso 3: pantalla propia. Por ahora reutiliza la lista vieja.
    this.renderMine();
  }

  private openProfile(tab: 'login' | 'register' = 'login'): void {
    if (getToken()) {
      openModal('Perfil');
      const box = document.getElementById('modal-content')!;
      const who = document.createElement('div');
      who.textContent = '…';
      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'action';
      out.textContent = 'Salir';
      out.onclick = () => {
        logout();
        closeModal();
        this.renderHome();
        this.renderAuth();
        this.renderMine();
      };
      box.append(who, out);
      me().then(
        (u) => {
          who.textContent = u.email;
        },
        () => {
          logout();
          closeModal();
          this.renderHome();
        },
      );
      return;
    }
    openModal('Perfil');
    const box = document.getElementById('modal-content')!;
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const inTab = document.createElement('button');
    inTab.type = 'button';
    inTab.textContent = 'Iniciar sesión';
    const regTab = document.createElement('button');
    regTab.type = 'button';
    regTab.textContent = 'Crear cuenta';
    tabs.append(inTab, regTab);
    const email = document.createElement('input');
    email.type = 'email';
    email.placeholder = 'Email';
    const pass = document.createElement('input');
    pass.type = 'password';
    pass.placeholder = 'Contraseña (8+)';
    const err = document.createElement('div');
    err.className = 'err';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'action primary';
    let mode: 'login' | 'register' = tab;
    const paint = (): void => {
      inTab.classList.toggle('active', mode === 'login');
      regTab.classList.toggle('active', mode === 'register');
      go.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta';
    };
    inTab.onclick = () => {
      mode = 'login';
      paint();
    };
    regTab.onclick = () => {
      mode = 'register';
      paint();
    };
    go.onclick = () => {
      err.textContent = '';
      const fn = mode === 'login' ? login : register;
      fn(email.value, pass.value).then(
        () => {
          closeModal();
          this.renderHome();
          this.renderAuth();
          this.renderMine();
          if (pendingCreate) {
            pendingCreate = false;
            this.scene.start('editor', {});
          }
        },
        (e) => {
          err.textContent = e instanceof Error ? e.message : 'Error';
        },
      );
    };
    box.append(tabs, email, pass, go, err);
    paint();
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
