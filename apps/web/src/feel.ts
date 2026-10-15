/**
 * Feel estilo SMB1/SMB3 con sprites propios.
 * 1 tile = 16px. Unidades: px y segundos.
 *
 * Chico = 1 tile de alto, grande (powerup) = casi 2 tiles.
 */
export const FEEL = {
  tile: 16,
  /** Velocidad caminando (sin correr). */
  walkMax: 95,
  /** Velocidad corriendo (botón B / Shift / J). */
  runMax: 165,
  /** Aceleración en piso. */
  accel: 380,
  /** Fricción al soltar (piso). */
  decel: 460,
  /** Frenado al invertir dirección (derrape). */
  skid: 700,
  /** Fricción en aire (menor control). */
  airAccel: 260,
  /** Salto base caminando. ~4 tiles con gravityUp. */
  jumpVelWalk: 300,
  /** Salto extra a máxima corrida. ~4.8 tiles. */
  jumpVelRun: 360,
  /** Gravedad subiendo con botón (flote). */
  gravityUp: 650,
  /** Gravedad cayendo o con botón suelto (caída SMB). */
  gravityDown: 1150,
  /** Corte de salto al soltar: vy se recorta a este tope. */
  jumpCut: 110,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  /** Patrulla lateral de flyers en px/s. */
  flyerSpeed: 50,
  /** Rebote pisotón: corto si soltás, alto si mantenés salto. */
  stompLow: 210,
  stompHigh: 340,
  /** Trampolín clásico. */
  trampolineVel: 460,
  /** Flote de items: seno +-3px a 3 rad/s. */
  itemFloatAmp: 3,
  itemFloatFreq: 3,
  walkerSpeed: 40,
  killMargin: 96,
  /** Invencible tras perder el powerup (parpadeo). */
  invulnTime: 2.0,
  /** Cuerpos: chico 1 tile, grande ~2 tiles. */
  smallW: 12,
  smallH: 14,
  bigW: 12,
  bigH: 28,
} as const;
