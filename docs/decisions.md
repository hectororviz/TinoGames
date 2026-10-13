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

- Feel (`apps/web/src/feel.ts`): speed 110, jump 320 (salto simple 4.5 tiles),
  gravity 700, coyote 0.10s, buffer 0.12s, doble 0.9x, dash 260/0.12s/cd 0.8s,
  3HP, invuln 1.0s, knockback (160,-180), player body 14×26.
- Arte (`assets/`, Pixel Adventure 1+2 CC0 + Sunny Land bosque CC0 + generado
  propio): 4 personajes, 8 frutas, 3 gemas, 20 enemigos, 7 obstáculos,
  checkpoints, salida End, plataformas, 252 variantes de piso, 6 biomas.
  Créditos en `assets/CREDITS_PIXELADVENTURE.md`.
- Lecciones que siguen valiendo: vertical slice primero, feel antes que
  contenido, items con propósito (llave de salida), commits por hito jugable.

## Hecho desde entonces (no reabrir)

- Editor web completo (riel en cascada, undo/redo, atajos, Probar↔Editor).
- Auth real (scrypt + JWT, sin header temporal) y niveles por dueño + PIN.
- Niveles solo en servidor; jugar por PIN público y sin login.
- Trampas animadas como estáticos (los dinámicos en grupo caían).
- Respawn con snap a piso; walkers giran en bordes; plataformas cinemáticas.
- AdSense integrado (slot + `ads.txt` + privacidad en el landing).

## Pendiente explícito

- Stomp en walkers (hoy el contacto daña), service worker PWA, sonido.
