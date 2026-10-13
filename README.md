# TinoGames

Plataformas 2D con editor de niveles web. Phaser + TypeScript, web-first.
El juego, el editor y las cuentas viven en el mismo monorepo.

## Estructura

- `apps/web/` — juego + editor (Vite + Phaser). `pnpm dev:web`.
- `packages/level-schema/` — formato canónico de niveles v2 (tipos + validador).
- `packages/themes/` — packs visuales (el nivel dice QUÉ, el tema dice CÓMO).
- `server/` — API (Fastify + Postgres). `pnpm dev:server` (requiere `DATABASE_URL`).
- `assets/` — arte migrado del prototipo + `gen_art.py`.
- `docs/` — decisiones y referencias.

## Empezar (desarrollo local)

1. `pnpm install`
2. Web: `pnpm dev:web` → http://localhost:5173 (flechas/A-D moverse, Espacio salta x2, J dash, R reinicia).
3. API local:
   - `docker compose up db -d` (solo Postgres en :5432)
   - `pnpm dev:server` (requiere `DATABASE_URL` en `.env.local`)
4. `pnpm typecheck && pnpm test`

## Deploy (VPS)

Las imágenes se compilan con GitHub Actions (`.github/workflows/docker.yml`)
y se publican en GHCR. En el VPS:

1. `docker compose pull`
2. `docker compose up -d`

Caddy-docker-proxy (red `caddy_net`) expone automáticamente:
- `juegos.mposw.com.ar` → web
- `api.juegos.mposw.com.ar` → API

Nivel de ejemplo válido: `packages/level-schema/levels/sample-level-1.json`.
Formato: JSON v2 disperso, sin techo, versionado. Ver `ROADMAP.md`.
