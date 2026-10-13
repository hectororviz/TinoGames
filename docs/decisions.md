# Decisiones TinoGames

## Stack (2026-10-13)

- Juego web-first → **Phaser + TypeScript + Vite** (Godot descartado: payload
  wasm pesado, editor fuera del DOM, dos mundos GDScript/JS).
- Sin app nativa: **PWA y/o Capacitor**.
- Monorepo pnpm: `apps/web`, `packages/level-schema`, `packages/themes`, `server/`.
- Server: **Fastify + Postgres**, Docker, dominios vía **caddy-docker-proxy**
  (labels por env, dominios al desplegar).
- Nivel como dato puro: JSON v2 versionado y disperso; el tema resuelve sprites.

## Portado del prototipo Godot

- Feel (`apps/web/src/feel.ts`): speed 110, jump 280, gravity 700,
  coyote 0.10s, buffer 0.12s, doble 0.9x, dash 260/0.12s/cd 0.8s, 3HP,
  invuln 1.0s, knockback (160,-180), items seno +-3px.
- Arte (`assets/`, pack Pixel Adventure CC0): pink (héroe), terreno, Apple,
  Strawberry, pinchos, fondos, heart. `kid.png`/`pig.png` descartados.
  `assets/gen_art.py` regenera fondos/corazón.
- Lecciones que siguen valiendo: vertical slice primero, feel antes que
  contenido, items con propósito (llave de salida), commits por hito jugable.

## Pendiente explícito

- Editor web (Fase 0), auth real (header `x-user-id` temporal), puerta de
  salida dedicada y hojas de enemigos (placeholders geométricos por ahora),
  stomp en walkers (hoy el contacto daña), service worker PWA.
