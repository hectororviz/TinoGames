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

  it('rejects spikes with no support', () => {
    const level = loadSample();
    const spikes = level.entities.find((e) => e.kind === 'spikes');
    spikes!.x = 40;
    spikes!.y = 1;
    const codes = validateLevel(level).map((e) => e.code);
    expect(codes).toContain('spikes-support');
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
