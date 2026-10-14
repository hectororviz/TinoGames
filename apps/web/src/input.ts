/** Estado de entrada compartido entre teclado y botones tactiles. */
export const touchState = {
  left: false,
  right: false,
};

function bindHold(id: string, key: 'left' | 'right', onTap?: () => void): void {
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

export function bindTouch(jump: () => void, dash: () => void, shoot?: () => void): void {
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  document.getElementById('btn-jump')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jump();
  });
  document.getElementById('btn-dash')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dash();
  });
  document.getElementById('btn-shoot')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    shoot?.();
  });
}
