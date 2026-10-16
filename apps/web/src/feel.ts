/**
 * Feel estilo SuperTux portado a tile 16px (SuperTux usa tile 32px).
 * Fuente: src/object/player.cpp (GPLv3) - WALK_ACCEL 300, RUN_ACCEL 400,
 * MAX_WALK 230, MAX_RUN 320, WALK_SPEED 100, fricción x1.5, skid x2-2.5,
 * salto -520 walk / -580 run, apex temprano x3, coyote 0.10, gracia 0.25.
 * Todo escalado x0.5 para mantener tiles/seg iguales.
 *
 * Chico = ~1 tile, grande = ~2 tiles.
 */
export const FEEL = {
  tile: 16,
  /** Velocidad caminando (sin correr). ST MAX_WALK_XM 230 -> 115. */
  walkMax: 115,
  /** Velocidad corriendo (botón B / Shift / J). ST MAX_RUN_XM 320 -> 160. */
  runMax: 160,
  /** Aceleración en piso caminando. ST WALK_ACCELERATION_X 300 -> 150. */
  accel: 150,
  /** Aceleración extra corriendo. ST RUN_ACCELERATION_X 400 -> 200. */
  runAccel: 200,
  /** Velocidad mínima instantánea al arrancar. ST WALK_SPEED 100 -> 50. */
  walkSpeed: 50,
  /** Fricción al soltar (piso). ST NORMAL_FRICTION x1.5 del walk accel. */
  decel: 225,
  /** Frenado al invertir dirección (derrape). ST x2, x2.5 si supera SKID_XM. */
  skid: 300,
  skidWide: 375,
  /** Umbral para derrape fuerte con polvo/sonido. ST SKID_XM 200 -> 100. */
  skidThreshold: 100,
  /** Fricción en aire (menor control, x2 al cambiar de dirección). */
  airAccel: 130,
  /** Salto base caminando. ST -520 -> 260. ~4.2 tiles. */
  jumpVelWalk: 260,
  /** Salto extra a máxima corrida. ST -580 -> 290. ~5 tiles. */
  jumpVelRun: 290,
  /** Gravedad base con botón (flote). ST ~1000 -> 500. */
  gravityUp: 500,
  /** Gravedad con apex temprano al soltar. ST JUMP_EARLY_APEX_FACTOR x3. */
  gravityDown: 1500,
  /** Corte de salto al soltar: 160 deja toques rápidos útiles (~2.5 tiles).
   * Mantener da el completo (~4.2). */
  jumpCut: 160,
  coyoteTime: 0.1,
  /** ST JUMP_GRACE_TIME 0.25 (antes 0.12). */
  jumpBuffer: 0.25,
  /** Baja la velocidad si se supera el máximo (ST OVERSPEED 100 -> 50). */
  overspeedDecel: 50,
  /** Patrulla lateral de flyers en px/s. */
  flyerSpeed: 50,
  /** Rebote pisotón: corto si soltás, alto si mantenés salto. */
  stompLow: 210,
  stompHigh: 340,
  /** Trampolín clásico. */
  trampolineVel: 460,
  /** Trampolín con impulso (caída fuerte o salto mantenido). */
  trampolineHigh: 600,
  /** Flote de items: seno +-3px a 3 rad/s. */
  itemFloatAmp: 3,
  itemFloatFreq: 3,
  walkerSpeed: 40,
  killMargin: 96,
  /** Invencible tras perder el powerup (parpadeo). ST TUX_SAFE_TIME 1.8. */
  invulnTime: 1.8,
  /** Cuerpos ST: small 31.8x30.8, big 31.8x62.8 en tile 32 -> x0.5.
   * Se usa 14px de ancho (no 15.9) para que el túnel de 1 tile siga pasable. */
  smallW: 14,
  smallH: 15,
  bigW: 14,
  bigH: 30,
} as const;
