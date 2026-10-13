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
}

export type EntityKind =
  | 'player_start'
  | 'item'
  | 'walker'
  | 'flyer'
  | 'spikes'
  | 'exit'
  | (string & {});

export interface WalkerProps {
  /** Tiles a cada lado que patrulla. Por defecto 4. */
  range?: number;
  /** px/s. Por defecto 40. */
  speed?: number;
}

export interface FlyerProps {
  /** Amplitud vertical en tiles. Por defecto 2. */
  amp?: number;
  /** Oscilaciones por segundo. Por defecto 1. */
  freq?: number;
}

export interface SpikesProps {
  /** Ancho en tiles (tramo de piso). Por defecto 1. */
  w?: number;
  /** Alto en tiles (pared). Por defecto 1. */
  h?: number;
}

export interface ExitProps {
  /** Si true, abre solo con todos los items. Por defecto true. */
  needsAllItems?: boolean;
}

export interface Entity {
  kind: EntityKind;
  x: number;
  y: number;
  props?: WalkerProps | FlyerProps | SpikesProps | ExitProps | Record<string, unknown>;
}

export interface Level {
  format: 2;
  /** Version del juego que lo creo (compatibilidad futura). */
  game: string;
  /** Id del pack visual. El nivel no guarda sprites. */
  theme: string;
  tiles: Tile[];
  entities: Entity[];
}
