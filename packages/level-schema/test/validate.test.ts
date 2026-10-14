import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateLevel } from '../src/index.js';
import type { Level } from '../src/index.js';

function loadSample(): Level {
  const raw = readFileSync(new URL('../levels/sample-level-1.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as Level;
}

describe('validateLevel', () => {
  it('accepts the bundled sample level', () => {
    expect(validateLevel(loadSample())).toEqual([]);
  });

  it('requires exactly one player_start and one exit', () => {
    const level = loadSample();
    level.entities = level.entities.filter((e) => e.kind !== 'player_start');
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('player-start');
  });

  it('accepts the new kinds with valid shape', () => {
    const level = loadSample();
    const ground = level.tiles.find((t) => t.t === 'ground')!;
    level.entities.push(
      { kind: 'fruit', x: ground.x, y: ground.y - 2 },
      { kind: 'gem', x: ground.x, y: ground.y - 3 },
      { kind: 'checkpoint', x: ground.x, y: ground.y - 1 },
      { kind: 'platform', x: ground.x, y: ground.y - 4 },
      { kind: 'deco', x: ground.x, y: ground.y - 1 },
    );
    expect(validateLevel(level)).toEqual([]);
  });

  it('rejects a checkpoint floating in the air', () => {
    const level = loadSample();
    level.entities.push({ kind: 'checkpoint', x: 3, y: 0 });
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('needs-ground');
  });

  it('accepts ground tile variants', () => {
    const level = loadSample();
    level.tiles[0].v = 42;
    expect(validateLevel(level)).toEqual([]);
  });

  it('rejects a bad tile variant', () => {
    const level = loadSample();
    level.tiles[0].v = 999;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('tile-variant');
  });

  it('accepts spikes variants', () => {
    const level = loadSample();
    const spikes = level.entities.find((e) => e.kind === 'spikes')!;
    spikes.props = { ...(spikes.props as object), variant: 'saw' };
    expect(validateLevel(level)).toEqual([]);
  });

  it('rejects a bad spikes variant', () => {
    const level = loadSample();
    const spikes = level.entities.find((e) => e.kind === 'spikes')!;
    spikes.props = { ...(spikes.props as object), variant: 'lava' };
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('spikes-variant');
  });
  it('accepts player_start up to 3 tiles above ground', () => {
    const level = loadSample();
    const start = level.entities.find((e) => e.kind === 'player_start')!;
    // Subir el piso 1..3 debajo sigue valido (cae al probar).
    start.y -= 1;
    expect(validateLevel(level).filter((e) => e.code === 'needs-ground')).toEqual([]);
  });

  it('rejects player_start floating with no ground near', () => {
    const level = loadSample();
    const start = level.entities.find((e) => e.kind === 'player_start')!;
    start.y = 0;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('needs-ground');
  });

  it('rejects player_start inside solid', () => {
    const level = loadSample();
    const start = level.entities.find((e) => e.kind === 'player_start')!;
    const ground = level.tiles.find((t) => t.t === 'ground')!;
    start.x = ground.x;
    start.y = ground.y;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('inside-solid');
  });
  it('rejects a walker floating in the air', () => {
    const level = loadSample();
    const walker = level.entities.find((e) => e.kind === 'walker');
    walker!.y = 2;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('needs-ground');
  });

  it('rejects an item inside solid ground', () => {
    const level = loadSample();
    const item = level.entities.find((e) => e.kind === 'item');
    item!.x = 2;
    item!.y = 10;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('inside-solid');
  });

  it('accepts spikes floating in the air (static, no support needed)', () => {
    const level = loadSample();
    const spikes = level.entities.find((e) => e.kind === 'spikes');
    spikes!.x = 40;
    spikes!.y = 1;
    expect(validateLevel(level).filter((e) => e.code === 'spikes-support')).toEqual([]);
  });

  it('rejects a wrong format version', () => {
    const level = loadSample();
    (level as unknown as Record<string, unknown>).format = 1;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('format');
  });

  it('ignores unknown future kinds with valid shape', () => {
    const level = loadSample();
    level.entities.push({ kind: 'portal', x: 5, y: 5, props: { to: 'level-2' } });
    expect(validateLevel(level)).toEqual([]);
  });
});
