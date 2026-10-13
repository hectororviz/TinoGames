import { readFileSync, readdirSync } from 'node:fs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { validateLevel } from '@tinogames/level-schema';
import type { Level } from '@tinogames/level-schema';

const PORT = Number(process.env.PORT ?? 8080);
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET vacío: usando secreto de desarrollo (no apto para producción)');
}
const SECRET = JWT_SECRET || 'dev-secret-change-me';

async function migrate(pool: Pool): Promise<void> {
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
    await pool.query(sql);
  }
}

// --- Passwords (scrypt, sin dependencias) ---
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const hash = scryptSync(password, salt, 64);
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

// --- JWT HS256 manual (sin dependencias) ---
function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

function signToken(userId: string, email: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: userId, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 86400 }),
  );
  const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token: string): { sub: string; email: string } | null {
  try {
    const [header, payload, sig] = token.split('.');
    if (!header || !payload || !sig) return null;
    const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      email: string;
      exp: number;
    };
    if (typeof claims.sub !== 'string' || claims.exp * 1000 < Date.now()) return null;
    return { sub: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

function authUser(req: FastifyRequest): { sub: string; email: string } | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

// --- PIN XXXX-XXXX (sin 0/O/1/I/L) ---
const PIN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makePin(): string {
  const bytes = randomBytes(8);
  let raw = '';
  for (const b of bytes) raw += PIN_CHARS[b % PIN_CHARS.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

const PIN_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function isLevel(value: unknown): value is Level {
  return typeof value === 'object' && value !== null && (value as Level).format === 2;
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const pool = new Pool({ connectionString: DATABASE_URL });
  await migrate(pool);

  app.get('/health', async () => ({ ok: true }));

  // --- Auth ---
  app.post('/v1/auth/register', async (req, reply) => {
    const body = req.body as { email?: unknown; password?: unknown };
    if (!isEmail(body?.email)) return reply.code(400).send({ error: 'email inválido' });
    if (typeof body?.password !== 'string' || body.password.length < 8) {
      return reply.code(400).send({ error: 'password mínimo 8 caracteres' });
    }
    const email = body.email.toLowerCase();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length > 0) return reply.code(409).send({ error: 'email ya registrado' });
    const created = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [
      email,
      hashPassword(body.password),
    ]);
    const user = created.rows[0] as { id: string; email: string };
    return reply.code(201).send({ token: signToken(user.id, user.email), user });
  });

  app.post('/v1/auth/login', async (req, reply) => {
    const body = req.body as { email?: unknown; password?: unknown };
    if (!isEmail(body?.email) || typeof body?.password !== 'string') {
      return reply.code(400).send({ error: 'email y password requeridos' });
    }
    const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [
      (body.email as string).toLowerCase(),
    ]);
    const user = rows[0] as { id: string; email: string; password_hash: string } | undefined;
    if (!user || !verifyPassword(body.password as string, user.password_hash)) {
      return reply.code(401).send({ error: 'credenciales inválidas' });
    }
    return { token: signToken(user.id, user.email), user: { id: user.id, email: user.email } };
  });

  app.get('/v1/auth/me', async (req, reply) => {
    const user = authUser(req);
    if (!user) return reply.code(401).send({ error: 'no autorizado' });
    return user;
  });

  // --- Niveles ---
  async function insertPin(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const pin = makePin();
      const { rows } = await pool.query('SELECT id FROM levels WHERE pin = $1', [pin]);
      if (rows.length === 0) return pin;
    }
    throw new Error('no se pudo generar pin único');
  }

  // Crear (requiere login).
  app.post('/v1/levels', async (req, reply) => {
    const user = authUser(req);
    if (!user) return reply.code(401).send({ error: 'no autorizado' });
    const body = req.body as { title?: unknown; theme?: unknown; game?: unknown; level?: unknown };
    if (!isLevel(body?.level)) {
      return reply.code(400).send({ error: 'level.format must be 2' });
    }
    const errors = validateLevel(body.level);
    if (errors.length > 0) {
      return reply.code(422).send({ error: 'invalid level', details: errors });
    }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 60) : 'Sin titulo';
    const pin = await insertPin();
    const { rows } = await pool.query(
      `INSERT INTO levels (owner_id, title, theme, game_version, body, pin)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, pin, updated_at`,
      [user.sub, title, body.level.theme, body.level.game, JSON.stringify(body.level), pin],
    );
    return reply.code(201).send(rows[0]);
  });

  // Actualizar (solo dueño).
  app.put('/v1/levels/:id', async (req, reply) => {
    const user = authUser(req);
    if (!user) return reply.code(401).send({ error: 'no autorizado' });
    const { id } = req.params as { id: string };
    const body = req.body as { title?: unknown; level?: unknown };
    if (!isLevel(body?.level)) {
      return reply.code(400).send({ error: 'level.format must be 2' });
    }
    const errors = validateLevel(body.level);
    if (errors.length > 0) {
      return reply.code(422).send({ error: 'invalid level', details: errors });
    }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 60) : 'Sin titulo';
    const { rows } = await pool.query(
      `UPDATE levels SET title = $1, theme = $2, game_version = $3, body = $4, updated_at = now()
       WHERE id = $5 AND owner_id = $6 RETURNING id, pin, updated_at`,
      [title, body.level.theme, body.level.game, JSON.stringify(body.level), id, user.sub],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  // Borrar (solo dueño).
  app.delete('/v1/levels/:id', async (req, reply) => {
    const user = authUser(req);
    if (!user) return reply.code(401).send({ error: 'no autorizado' });
    const { id } = req.params as { id: string };
    const { rowCount } = await pool.query('DELETE FROM levels WHERE id = $1 AND owner_id = $2', [id, user.sub]);
    if (!rowCount) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });

  // Mis niveles (requiere login).
  app.get('/v1/levels', async (req, reply) => {
    const query = req.query as { mine?: unknown };
    if (query.mine !== undefined && query.mine !== '1' && query.mine !== 'true') {
      return reply.code(400).send({ error: 'solo se lista con ?mine=1' });
    }
    const user = authUser(req);
    if (!user) return reply.code(401).send({ error: 'no autorizado' });
    const { rows } = await pool.query(
      'SELECT id, title, pin, theme, game_version, updated_at FROM levels WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100',
      [user.sub],
    );
    return { levels: rows };
  });

  // Nivel por PIN (público, solo jugar).
  app.get('/v1/levels/pin/:pin', async (req, reply) => {
    const { pin } = req.params as { pin: string };
    const clean = pin.toUpperCase();
    if (!PIN_RE.test(clean)) return reply.code(404).send({ error: 'not found' });
    const { rows } = await pool.query(
      'SELECT id, title, theme, game_version, body, updated_at FROM levels WHERE pin = $1',
      [clean],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  // Nivel por id (público, compatibilidad).
  app.get('/v1/levels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      'SELECT id, title, theme, game_version, body, updated_at FROM levels WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
