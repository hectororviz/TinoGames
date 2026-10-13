import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { Pool } from 'pg';
import { validateLevel } from '@tinogames/level-schema';
import type { Level } from '@tinogames/level-schema';

const PORT = Number(process.env.PORT ?? 8080);
const DATABASE_URL = process.env.DATABASE_URL ?? '';

async function migrate(pool: Pool): Promise<void> {
  const sql = readFileSync(new URL('../migrations/001_init.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

function isLevel(value: unknown): value is Level {
  return typeof value === 'object' && value !== null && (value as Level).format === 2;
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const pool = new Pool({ connectionString: DATABASE_URL });
  await migrate(pool);

  app.get('/health', async () => ({ ok: true }));

  // Crea un nivel (auth real pendiente: owner por header temporal).
  app.post('/v1/levels', async (req, reply) => {
    const body = req.body as { title?: unknown; theme?: unknown; game?: unknown; level?: unknown };
    if (!isLevel(body?.level)) {
      return reply.code(400).send({ error: 'level.format must be 2' });
    }
    const errors = validateLevel(body.level);
    if (errors.length > 0) {
      return reply.code(422).send({ error: 'invalid level', details: errors });
    }
    const owner = (req.headers['x-user-id'] as string | undefined) ?? null;
    const title = typeof body.title === 'string' ? body.title : 'Sin titulo';
    const { rows } = await pool.query(
      `INSERT INTO levels (owner_id, title, theme, game_version, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, updated_at`,
      [owner, title, body.level.theme, body.level.game, JSON.stringify(body.level)],
    );
    return reply.code(201).send({ id: rows[0].id });
  });

  app.get('/v1/levels/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      'SELECT id, title, theme, game_version, body, updated_at FROM levels WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  app.get('/v1/levels', async (req) => {
    const owner = (req.query as { owner?: string }).owner ?? null;
    const { rows } = await pool.query(
      'SELECT id, title, theme, game_version, updated_at FROM levels WHERE owner_id IS NOT DISTINCT FROM $1 ORDER BY updated_at DESC LIMIT 100',
      [owner],
    );
    return { levels: rows };
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
