/**
 * Formato canonico de niveles TinoGames v2.
 *
 * - JSON versionado, disperso (el aire no se guarda) y sin techo de tamaño.
 * - Coordenadas en tiles enteros, origen arriba-izquierda, 1 tile = 16px.
 * - El nivel dice QUE es cada cosa; el tema (textures) dice COMO se ve.
 * - Kinds nuevos entran como id + props opcionales, sin migrar niveles viejos.
 */

export const LEVEL_FORMAT = 2 as const;

/** Bloque solido / decoracion con colision. */
export interface Tile {
  x: number;
  y: number;
  /** Tipo de tile. Anadir tipos nuevos no rompe niveles viejos. */
  t: 'ground' | 'spikes' | (string & {});
  /** Variante visual (solo estetica, misma colision). 0-9: plancha base,
   *  10+: plancha extendida de terreno. Ausente = 0. */
  v?: number;
}

export type EntityKind =
  | 'player_start'
  | 'fruit'
  | 'gem'
  | 'walker'
  | 'flyer'
  | 'spikes'
  | 'checkpoint'
  | 'platform'
  | 'deco'
  | 'powerup'
  | 'brick'
  | 'pipe'
  | 'exit'
  | (string & {});

export interface PlayerProps {
  /** Skin del personaje: pink | frog | mask | guy. Por defecto pink. */
  skin?: string;
}

export interface WalkerProps {
  /** Tiles a cada lado que patrulla. Por defecto 4. */
  range?: number;
  /** px/s. Por defecto 40. */
  speed?: number;
  /** Skin del enemigo (id de la tabla del tema). Por defecto pig. */
  skin?: string;
}

export interface FlyerProps {
  /** Eje de patrulla: 'x' lateral | 'y' vertical clásico. Por defecto 'x'. */
  axis?: string;
  /** Recorrido lateral en tiles (eje x). Por defecto 3. */
  range?: number;
  /** Velocidad lateral en px/s (eje x). Por defecto 50. */
  speed?: number;
  /** Amplitud vertical en tiles. Por defecto 2. */
  amp?: number;
  /** Oscilaciones por segundo. Por defecto 1. */
  freq?: number;
  /** Skin del enemigo (id de la tabla del tema). Por defecto bluebird. */
  skin?: string;
}

export interface FruitProps {
  /** Powerup estilo hongo (agranda): apple | strawberry | bananas | cherries | kiwi | melon | orange | pineapple. */
  skin?: string;
}

export interface GemProps {
  /** Moneda: purple | blue | red. Por defecto purple. Solo puntaje, no abre la salida. */
  color?: string;
}

export interface PlatformProps {
  /** 'x' móvil horizontal | 'y' móvil vertical | 'fall' se cae al pisarla. Por defecto 'x'. */
  axis?: string;
  /** Tiles de recorrido (móvil). Por defecto 3. */
  range?: number;
  /** px/s (móvil). Por defecto 50. */
  speed?: number;
}

export interface DecoProps {
  /** Decoración legacy: box1 | box2 | box3. Por defecto box1. */
  skin?: string;
}

export interface PowerupProps {
  /** Bloque "?": box1 | box2 | box3. Se cabecea desde abajo y suelta un hongo móvil. */
  skin?: string;
}

export interface PipeProps {
  /** Id de esta boca (auto: P1, P2...). */
  pid?: string;
  /** Id de la boca destino. Sin target la tubería es decorado sólido. */
  target?: string;
  /** Ancho en tiles. Por defecto 2. */
  w?: number;
  /** Alto en tiles. Por defecto 2. */
  h?: number;
  /** Lado de la boca: 'up' | 'down' | 'left' | 'right'. Por defecto 'up'. */
  dir?: string;
}

export interface SpikesProps {
  /** Ancho en tiles (tramo de piso). Por defecto 1. */
  w?: number;
  /** Alto en tiles (pared). Por defecto 1. */
  h?: number;
  /** Variante del obstaculo. Por defecto 'spikes'. */
  variant?: 'spikes' | 'saw' | 'fire' | 'arrow' | 'rock' | 'spikehead' | 'trampoline';
}

export interface ExitProps {
  /** Legacy: si true pedía todas las gemas. Hoy la salida abre siempre. */
  needsAllItems?: boolean;
}

export interface Entity {
  kind: EntityKind;
  x: number;
  y: number;
  props?: WalkerProps | FlyerProps | SpikesProps | ExitProps | FruitProps | GemProps | PlatformProps | DecoProps | PowerupProps | PipeProps | PlayerProps | Record<string, unknown>;
}

export interface Level {
  format: 2;
  /** Version del juego que lo creo (compatibilidad futura). */
  game: string;
  /** Id del pack visual. El nivel no guarda sprites. */
  theme: string;
  /** Bioma de fondo (dia | noche | bosque | cueva | fabrica | blue). Ausente = blue. */
  bg?: string;
  tiles: Tile[];
  entities: Entity[];
}
