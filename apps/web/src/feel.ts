/**
 * Feel portado del prototipo Godot (scripts/player.gd, chaser.gd, collectible.gd).
 * 1 tile = 16px. Unidades: px y segundos.
 */
export const FEEL = {
  tile: 16,
  speed: 110,
  jumpVelocity: 320,
  doubleJumpMult: 0.9,
  gravity: 700,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  dashSpeed: 260,
  dashTime: 0.25,
  dashCooldown: 0.8,
  /** Patrulla lateral de flyers en px/s. */
  flyerSpeed: 50,
  /** Alto del body agachado durante el dash-deslizamiento (entra en 1 tile). */
  slideH: 14,
  /** Rebote alto del pisotón (salto normal 320, trampolín 460). */
  stompBounce: 380,
  /** Disparo: velocidad px/s, alcance en tiles y cadencia. */
  bulletSpeed: 260,
  bulletRangeTiles: 10,
  shootCooldown: 0.25,
  maxHp: 3,
  invulnTime: 1.0,
  knockbackX: 160,
  knockbackY: 180,
  /** Flote de items: seno +-3px a 3 rad/s. */
  itemFloatAmp: 3,
  itemFloatFreq: 3,
  walkerSpeed: 40,
  killMargin: 96,
} as const;
