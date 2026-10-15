/** Configuración persistente por dispositivo (localStorage).
 * Táctil auto/siempre/nunca, sonido (placeholder hasta WebAudio) y
 * re-mapeo de teclas por `KeyboardEvent.code`.
 */

export type TouchMode = 'auto' | 'always' | 'never';

export interface KeyMap {
  left: string;
  right: string;
  down: string;
  jump: string;
  run: string;
  pause: string;
  restart: string;
}

export type Action = keyof KeyMap;

export interface Settings {
  touch: TouchMode;
  sound: boolean;
  volume: number;
  keys: KeyMap;
}

const STORE = 'tino-settings-v1';

export const DEFAULT_SETTINGS: Settings = {
  touch: 'auto',
  sound: true,
  volume: 0.7,
  keys: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    down: 'ArrowDown',
    jump: 'Space',
    run: 'ShiftLeft',
    pause: 'Escape',
    restart: 'KeyR',
  },
};

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'left', label: 'Izquierda' },
  { id: 'right', label: 'Derecha' },
  { id: 'down', label: 'Abajo / agacharse' },
  { id: 'jump', label: 'Saltar' },
  { id: 'run', label: 'Correr' },
  { id: 'pause', label: 'Pausa' },
  { id: 'restart', label: 'Reiniciar' },
];

/** Segundas teclas fijas (no remapeables): ↑ salta, J corre, P pausa. */
export const FIXED_ALTS: Partial<Record<Action, string[]>> = {
  jump: ['ArrowUp'],
  run: ['KeyJ'],
  pause: ['KeyP'],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...p,
      keys: { ...DEFAULT_SETTINGS.keys, ...(p.keys ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // almacenamiento privado: se sigue jugando con defaults en memoria.
  }
  updateTouchVisibility(s);
}

/** Muestra/oculta los botones táctiles (solo en partida). */
export function updateTouchVisibility(s: Settings = loadSettings()): void {
  const el = document.getElementById('touch');
  if (!el) return;
  if (!document.body.classList.contains('playing') || s.touch === 'never') {
    el.style.display = 'none';
    return;
  }
  if (s.touch === 'always') {
    el.style.display = 'flex';
    return;
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  el.style.display = coarse ? 'flex' : 'none';
}

export function prettyKey(code: string): string {
  const known: Record<string, string> = {
    ArrowLeft: '◀',
    ArrowRight: '▶',
    ArrowUp: '▲',
    ArrowDown: '▼',
    Space: 'Espacio',
    Escape: 'Esc',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
  };
  if (known[code]) return known[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function hideSettings(): void {
  document.getElementById('modal-root')!.hidden = true;
  document.getElementById('modal-content')!.textContent = '';
}

/** Modal de configuración. `onKeysChanged` se llama al remapear (vivo en juego). */
export function openSettingsModal(onKeysChanged?: () => void): void {
  const root = document.getElementById('modal-root')!;
  const box = document.getElementById('modal-content')!;
  box.textContent = '';
  const s = loadSettings();
  const save = (): void => saveSettings(s);

  const h = document.createElement('h2');
  h.textContent = 'Configuración';
  box.appendChild(h);

  // --- Táctil ---
  const tLabel = document.createElement('div');
  tLabel.textContent = 'Botones táctiles';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  const modes: { id: TouchMode; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'always', label: 'Siempre' },
    { id: 'never', label: 'Nunca' },
  ];
  const paintTouch = (): void => {
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', (b.dataset['mode'] as TouchMode) === s.touch);
    });
  };
  for (const m of modes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.dataset['mode'] = m.id;
    b.onclick = () => {
      s.touch = m.id;
      save();
      paintTouch();
    };
    tabs.appendChild(b);
  }
  paintTouch();
  box.append(tLabel, tabs);

  // --- Sonido (placeholder) ---
  const sRow = document.createElement('div');
  sRow.className = 'row';
  const sChk = document.createElement('input');
  sChk.type = 'checkbox';
  sChk.checked = s.sound;
  sChk.setAttribute('aria-label', 'Sonido activado');
  sChk.onchange = () => {
    s.sound = sChk.checked;
    save();
  };
  const sLbl = document.createElement('span');
  sLbl.textContent = 'Sonido (llega pronto)';
  const sVol = document.createElement('input');
  sVol.type = 'range';
  sVol.min = '0';
  sVol.max = '100';
  sVol.value = String(Math.round(s.volume * 100));
  sVol.setAttribute('aria-label', 'Volumen');
  sVol.onchange = () => {
    s.volume = Number(sVol.value) / 100;
    save();
  };
  sRow.append(sChk, sLbl, sVol);
  box.appendChild(sRow);

  // --- Teclas (↑ salta, J corre y P pausa siempre, además de las elegidas) ---
  const kLabel = document.createElement('div');
  kLabel.textContent = 'Teclas (clic y presioná la nueva)';
  box.appendChild(kLabel);
  for (const a of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.textContent = a.label;
    lab.style.flex = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action';
    btn.textContent = prettyKey(s.keys[a.id]);
    btn.style.minWidth = '110px';
    btn.onclick = () => {
      btn.textContent = '…';
      const capture = (e: KeyboardEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') hideSettings();
        else {
          s.keys[a.id] = e.code;
          save();
          onKeysChanged?.();
          btn.textContent = prettyKey(s.keys[a.id]);
        }
        window.removeEventListener('keydown', capture, true);
      };
      window.addEventListener('keydown', capture, true);
    };
    row.append(lab, btn);
    box.appendChild(row);
  }

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'action primary';
  done.textContent = 'Listo';
  done.onclick = hideSettings;
  box.appendChild(done);

  root.hidden = false;
}
