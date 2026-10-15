import type { Entity, Level } from './types.js';

export interface ValidationError {
  code: string;
  message: string;
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function solidAt(solids: Set<string>, x: number, y: number): boolean {
  return solids.has(`${x},${y}`);
}

/**
 * Valida un nivel v2. Reglas:
 * - 1 player_start y 1 exit.
 * - player_start / walker con solido debajo en los proximos 3 tiles (permite
 *   pintar 1 tile arriba del piso y caer al probar, sin quedar embebido).
 * - exit con tile solido (ground) justo debajo.
 * - flyer / item en el aire (la celda no es solida).
 * - spikes y obstaculos (saw/fire/arrow/rock/spikehead/trampoline): estaticos,
 *   se pueden poner en cualquier ubicacion en aire (solo se rechaza si quedan
 *   dentro de solido).
 * - powerup (bloques box1/box2/box3): se cabecean desde abajo, sueltan hongo.
 *   Solo exigen no estar en solido. 'item' legacy se trata como fruta.
 * - brick (ladrillo): se cabecea desde abajo; chico rebota, grande rompe.
 *   Solo exige no estar en solido.
 * - pipe (tubería w×h, por defecto 2×2, sólida, boca del lado `dir`):
 *   la huella no puede estar en solido; `target` vacío = tapada (válido);
 *   `target` a un pid inexistente = error `pipe-link`.
 */
export function validateLevel(level: Level): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (code: string, message: string) => errors.push({ code, message });

  if (typeof level !== 'object' || level === null) {
    return [{ code: 'not-object', message: 'level must be an object' }];
  }
  if (level.format !== 2) fail('format', 'level.format must be 2');
  if (typeof level.game !== 'string' || level.game.length === 0) {
    fail('game', 'level.game must be a non-empty string');
  }
  if (typeof level.theme !== 'string' || level.theme.length === 0) {
    fail('theme', 'level.theme must be a non-empty string');
  }
  if (!Array.isArray(level.tiles)) fail('tiles', 'level.tiles must be an array');
  if (!Array.isArray(level.entities)) fail('entities', 'level.entities must be an array');
  if (errors.length > 0) return errors;

  const solids = new Set<string>();
  for (const t of level.tiles) {
    if (!isInt(t.x) || !isInt(t.y) || typeof t.t !== 'string') {
      fail('tile-shape', `bad tile shape: ${JSON.stringify(t)}`);
      continue;
    }
    if (t.v !== undefined && (!isInt(t.v) || t.v < 0 || t.v > 251)) {
      fail('tile-variant', `bad tile variant: ${JSON.stringify(t)}`);
      continue;
    }
    if (t.t === 'ground') solids.add(`${t.x},${t.y}`);
  }

  const byKind = (kind: string): Entity[] => level.entities.filter((e) => e.kind === kind);
  const starts = byKind('player_start');
  const exits = byKind('exit');
  if (starts.length !== 1) fail('player-start', `need exactly 1 player_start, found ${starts.length}`);
  if (exits.length !== 1) fail('exit', `need exactly 1 exit, found ${exits.length}`);

  for (const e of level.entities) {
    if (!isInt(e.x) || !isInt(e.y) || typeof e.kind !== 'string') {
      fail('entity-shape', `bad entity shape: ${JSON.stringify(e)}`);
      continue;
    }
    switch (e.kind) {
      case 'player_start': {
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `player_start at (${e.x},${e.y}) is inside solid`);
          break;
        }
        let supported = false;
        for (let d = 1; d <= 3; d++) {
          if (solidAt(solids, e.x, e.y + d)) {
            supported = true;
            break;
          }
        }
        if (!supported) {
          fail('needs-ground', `player_start at (${e.x},${e.y}) needs ground within 3 below`);
        }
        break;
      }
      case 'walker': {
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `walker at (${e.x},${e.y}) is inside solid`);
          break;
        }
        let supported = false;
        for (let d = 1; d <= 3; d++) {
          if (solidAt(solids, e.x, e.y + d)) {
            supported = true;
            break;
          }
        }
        if (!supported) {
          fail('needs-ground', `walker at (${e.x},${e.y}) needs ground within 3 below`);
        }
        break;
      }
      case 'exit':
        if (!solidAt(solids, e.x, e.y + 1)) {
          fail('needs-ground', `${e.kind} at (${e.x},${e.y}) needs ground below`);
        }
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `${e.kind} at (${e.x},${e.y}) is inside solid`);
        }
        break;
      case 'flyer':
      case 'item':
      case 'fruit':
      case 'gem':
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `${e.kind} at (${e.x},${e.y}) is inside solid`);
        }
        break;
      case 'checkpoint':
        if (!solidAt(solids, e.x, e.y + 1)) {
          fail('needs-ground', `checkpoint at (${e.x},${e.y}) needs ground below`);
        }
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `checkpoint at (${e.x},${e.y}) is inside solid`);
        }
        break;
      case 'platform':
      case 'deco':
      case 'powerup':
      case 'brick':
        if (solidAt(solids, e.x, e.y)) {
          fail('inside-solid', `${e.kind} at (${e.x},${e.y}) is inside solid`);
        }
        break;
      case 'pipe': {
        const w = Math.max(1, Math.floor((e.props as { w?: number } | undefined)?.w ?? 2));
        const h = Math.max(1, Math.floor((e.props as { h?: number } | undefined)?.h ?? 2));
        const dir = (e.props as { dir?: unknown } | undefined)?.dir ?? 'up';
        if (dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') {
          fail('pipe-dir', `bad pipe dir: ${JSON.stringify(dir)}`);
          break;
        }
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            if (solidAt(solids, e.x + dx, e.y + dy)) {
              fail('inside-solid', `pipe at (${e.x},${e.y}) is inside solid`);
              break;
            }
          }
        }
        const target = (e.props as { target?: unknown } | undefined)?.target;
        if (typeof target === 'string' && target) {
          const pids = new Set(
            level.entities
              .filter((o) => o.kind === 'pipe')
              .map((o) => (o.props as { pid?: unknown } | undefined)?.pid),
          );
          if (!pids.has(target)) {
            fail('pipe-link', `pipe at (${e.x},${e.y}) targets missing ${target}`);
          }
        }
        break;
      }
      case 'spikes': {
        const w = Math.max(1, Math.floor((e.props as { w?: number } | undefined)?.w ?? 1));
        const h = Math.max(1, Math.floor((e.props as { h?: number } | undefined)?.h ?? 1));
        const variant = (e.props as { variant?: unknown } | undefined)?.variant ?? 'spikes';
        if (
          variant !== 'spikes' &&
          variant !== 'saw' &&
          variant !== 'fire' &&
          variant !== 'arrow' &&
          variant !== 'rock' &&
          variant !== 'spikehead' &&
          variant !== 'trampoline'
        ) {
          fail('spikes-variant', `bad spikes variant: ${JSON.stringify(variant)}`);
          break;
        }
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            if (solidAt(solids, e.x + dx, e.y + dy)) {
              fail('inside-solid', `spikes at (${e.x},${e.y}) is inside solid`);
              break;
            }
          }
        }
        break;
      }
      default:
        // Kinds futuros: solo forma valida, sin reglas.
        break;
    }
  }

  return errors;
}

export function assertValidLevel(level: Level): void {
  const errors = validateLevel(level);
  if (errors.length > 0) {
    throw new Error(`invalid level: ${errors.map((e) => e.message).join('; ')}`);
  }
}
