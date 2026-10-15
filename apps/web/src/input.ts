/** Estado de entrada compartido entre teclado y botones tactiles. */
export const touchState = {
  left: false,
  right: false,
  /** B/correr mantenido (botón B táctil o Shift/J en teclado). */
  run: false,
  /** Salto mantenido (para salto variable y rebote de pisotón). */
  jump: false,
  /** Abajo mantenido (agacharse / entrar a tuberías). */
  down: false,
};

function bindHold(id: string, key: 'left' | 'right' | 'run' | 'down', onTap?: () => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e: Event) => {
    e.preventDefault();
    touchState[key] = true;
  };
  const up = (e: Event) => {
    e.preventDefault();
    touchState[key] = false;
    onTap?.();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

export function bindTouch(jumpDown: () => void, jumpUp: () => void): void {
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  bindHold('btn-dash', 'run');
  bindHold('btn-down', 'down');
  const jumpBtn = document.getElementById('btn-jump');
  if (jumpBtn) {
    const down = (e: Event) => {
      e.preventDefault();
      touchState.jump = true;
      jumpDown();
    };
    const up = (e: Event) => {
      e.preventDefault();
      touchState.jump = false;
      jumpUp();
    };
    jumpBtn.addEventListener('pointerdown', down);
    jumpBtn.addEventListener('pointerup', up);
    jumpBtn.addEventListener('pointercancel', up);
    jumpBtn.addEventListener('pointerleave', up);
  }
}
