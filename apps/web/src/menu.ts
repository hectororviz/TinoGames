import Phaser from 'phaser';
import { deleteRemoteLevel, getByPin, getRemote, getToken, listMine, login, logout, me, register } from './api.js';
import { BG_BLUE } from './catalog.js';

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
  private bg!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('menu');
  }

  preload(): void {
    this.load.image(BG_BLUE.key, BG_BLUE.url);
  }

  override update(): void {
    if (this.bg) this.bg.tilePositionX += 0.3;
  }

  create(): void {
    document.body.classList.add('menu');
    document.body.classList.remove('playing', 'editing');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('menu');
    });
    this.bg = this.add.tileSprite(240, 135, 480, 270, BG_BLUE.key);

    // Home.
    closeModal();
    document.getElementById('home-profile')!.onclick = () => this.openProfile();
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
    openModal('Mis niveles');
    const box = document.getElementById('modal-content')!;
    if (!getToken()) {
      const msg = document.createElement('div');
      msg.textContent = 'Entrá con tu cuenta para ver tus niveles.';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'action primary';
      go.textContent = 'Entrar';
      go.onclick = () => this.openProfile('login');
      box.append(msg, go);
      return;
    }
    const list = document.createElement('div');
    list.className = 'lvl-list';
    const empty = document.createElement('div');
    empty.textContent = 'Todavía no tenés niveles. Creá el primero.';
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'action primary';
    create.textContent = 'Crear nivel';
    create.onclick = () => {
      closeModal();
      this.scene.start('editor', {});
    };
    box.append(list, empty, create);
    empty.style.display = 'none';
    create.style.display = 'none';
    listMine().then(
      (levels) => {
        if (levels.length === 0) {
          empty.style.display = 'block';
          create.style.display = 'block';
          return;
        }
        for (const entry of levels) {
          const row = document.createElement('div');
          row.className = 'lvl-row';
          const nm = document.createElement('span');
          nm.className = 'nm';
          nm.textContent = entry.title;
          const pin = document.createElement('span');
          pin.className = 'pin';
          pin.textContent = entry.pin ?? '';
          const play = document.createElement('button');
          play.type = 'button';
          play.textContent = 'Jugar';
          play.onclick = () => {
            getRemote(entry.id).then(
              (full) => {
                closeModal();
                this.scene.start('game', { level: full.body });
              },
              () => undefined,
            );
          };
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Editar';
          edit.onclick = () => {
            getRemote(entry.id).then(
              (full) => {
                closeModal();
                this.scene.start('editor', { remoteId: full.id, name: full.title, draft: full.body });
              },
              () => undefined,
            );
          };
          const del = document.createElement('button');
          del.type = 'button';
          del.textContent = 'Borrar';
          del.onclick = () => {
            if (!confirm(`¿Borrar "${entry.title}" del servidor?`)) return;
            deleteRemoteLevel(entry.id).then(
              () => this.openMine(),
              () => this.openMine(),
            );
          };
          row.append(nm, pin, play, edit, del);
          list.appendChild(row);
        }
      },
      () => {
        empty.style.display = 'block';
        empty.textContent = 'No se pudo cargar. Revisá tu conexión.';
      },
    );
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
}
