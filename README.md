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

## Empezar

1. `pnpm install`
2. Web: `pnpm dev:web` → http://localhost:5173 (flechas/A-D moverse, Espacio salta x2, J dash, R reinicia).
3. API local: `docker compose up --build` → http://localhost:8080/health

Nivel de ejemplo válido: `packages/level-schema/levels/sample-level-1.json`.
Formato: JSON v2 disperso, sin techo, versionado. Ver `ROADMAP.md`.
