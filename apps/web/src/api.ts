import type { Level } from '@tinogames/level-schema';

const BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
const TOKEN_KEY = 'tinogames-token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // sin almacenamiento
  }
}

export interface RemoteUser {
  id: string;
  email: string;
}

export interface RemoteLevelMeta {
  id: string;
  title: string;
  pin: string | null;
  theme: string;
  game_version: string;
  updated_at: string;
}

export interface RemoteLevel extends RemoteLevelMeta {
  body: Level;
}

async function req<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
  return data;
}

export async function register(email: string, password: string): Promise<{ token: string; user: RemoteUser }> {
  const out = await req<{ token: string; user: RemoteUser }>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  setToken(out.token);
  return out;
}

export async function login(email: string, password: string): Promise<{ token: string; user: RemoteUser }> {
  const out = await req<{ token: string; user: RemoteUser }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  setToken(out.token);
  return out;
}

export function logout(): void {
  setToken(null);
}

export async function me(): Promise<RemoteUser> {
  const out = await req<{ sub: string; email: string }>('/v1/auth/me');
  return { id: out.sub, email: out.email };
}

export async function listMine(): Promise<RemoteLevelMeta[]> {
  const out = await req<{ levels: RemoteLevelMeta[] }>('/v1/levels?mine=1');
  return out.levels;
}

export async function publishLevel(title: string, level: Level): Promise<{ id: string; pin: string; updated_at: string }> {
  return req('/v1/levels', { method: 'POST', body: JSON.stringify({ title, level }) });
}

export async function updateRemoteLevel(id: string, title: string, level: Level): Promise<{ id: string; pin: string; updated_at: string }> {
  return req(`/v1/levels/${id}`, { method: 'PUT', body: JSON.stringify({ title, level }) });
}

export async function deleteRemoteLevel(id: string): Promise<void> {
  await req(`/v1/levels/${id}`, { method: 'DELETE' });
}

export async function getByPin(pin: string): Promise<RemoteLevel> {
  return req<RemoteLevel>(`/v1/levels/pin/${encodeURIComponent(pin.trim().toUpperCase())}`, {}, false);
}

export async function getRemote(id: string): Promise<RemoteLevel> {
  return req<RemoteLevel>(`/v1/levels/${encodeURIComponent(id)}`, {}, false);
}
