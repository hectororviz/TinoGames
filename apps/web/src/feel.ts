/**
 * Feel portado del prototipo Godot (scripts/player.gd, chaser.gd, collectible.gd).
 * 1 tile = 16px. Unidades: px y segundos.
 */
export const FEEL = {
  tile: 16,
  speed: 110,
  jumpVelocity: 280,
  doubleJumpMult: 0.9,
  gravity: 700,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  dashSpeed: 260,
  dashTime: 0.12,
  dashCooldown: 0.8,
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
