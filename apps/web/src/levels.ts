import type { Level } from '@tinogames/level-schema';

export interface SavedLevel {
  id: string;
  name: string;
  updatedAt: number;
  level: Level;
  /** Id y PIN en el servidor (si se publicó). */
  remoteId?: string;
  pin?: string;
}

export interface EditorData {
  remoteId?: string;
  draft?: Level;
  name?: string;
}

const LIB_KEY = 'tinogames-levels';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function isLevel(value: unknown): value is Level {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['format'] === 2 && Array.isArray(v['tiles']) && Array.isArray(v['entities']);
}

export function blankLevel(): Level {
  return { format: 2, game: '0.2', theme: 'pixel-adventure', tiles: [], entities: [] };
}

export function cloneLevel(level: Level): Level {
  return JSON.parse(JSON.stringify(level)) as Level;
}

export function listLevels(): SavedLevel[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedLevel =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as SavedLevel).id === 'string' &&
        typeof (e as SavedLevel).name === 'string' &&
        isLevel((e as SavedLevel).level),
    );
  } catch {
    return [];
  }
}

function persist(entries: SavedLevel[]): void {
  localStorage.setItem(LIB_KEY, JSON.stringify(entries));
}

function checkName(name: string, entries: SavedLevel[], ignoreId?: string): string {
  const clean = name.trim();
  if (clean.length === 0) throw new Error('Poné un nombre al nivel');
  const dup = entries.some((e) => e.id !== ignoreId && e.name.trim().toLowerCase() === clean.toLowerCase());
  if (dup) throw new Error(`Ya existe un nivel llamado "${clean}"`);
  return clean;
}

export function createLevel(name: string, level: Level): SavedLevel {
  const entries = listLevels();
  const clean = checkName(name, entries);
  const entry: SavedLevel = { id: makeId(), name: clean, updatedAt: Date.now(), level: cloneLevel(level) };
  entries.push(entry);
  persist(entries);
  return entry;
}

export function updateLevel(id: string, name: string, level: Level): SavedLevel {
  const entries = listLevels();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error('Nivel no encontrado');
  const clean = checkName(name, entries, id);
  const prev = entries[idx];
  const entry: SavedLevel = { id, name: clean, updatedAt: Date.now(), level: cloneLevel(level) };
  if (prev.remoteId) entry.remoteId = prev.remoteId;
  if (prev.pin) entry.pin = prev.pin;
  entries[idx] = entry;
  persist(entries);
  return entry;
}

export function setRemote(id: string, remoteId: string, pin: string): void {
  const entries = listLevels();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.remoteId = remoteId;
  entry.pin = pin;
  entry.updatedAt = Date.now();
  persist(entries);
}

export function deleteLevel(id: string): void {
  persist(listLevels().filter((e) => e.id !== id));
}

export function findLevel(id: string): SavedLevel | undefined {
  return listLevels().find((e) => e.id === id);
}

export function importRemote(title: string, remoteId: string, pin: string, level: Level): SavedLevel {
  const entries = listLevels();
  const existing = entries.find((e) => e.remoteId === remoteId);
  if (existing) {
    const clean = `${title}`;
    const clash = entries.some((e) => e.id !== existing.id && e.name.trim().toLowerCase() === clean.toLowerCase());
    existing.name = clash ? `${clean} (${pin})` : clean;
    existing.level = cloneLevel(level);
    existing.remoteId = remoteId;
    existing.pin = pin;
    existing.updatedAt = Date.now();
    persist(entries);
    return existing;
  }
  const clean = title.trim() || 'Sin titulo';
  const clash = entries.some((e) => e.name.trim().toLowerCase() === clean.toLowerCase());
  const entry: SavedLevel = {
    id: makeId(),
    name: clash ? `${clean} (${pin})` : clean,
    updatedAt: Date.now(),
    level: cloneLevel(level),
    remoteId,
    pin,
  };
  entries.push(entry);
  persist(entries);
  return entry;
}
