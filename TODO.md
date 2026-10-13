# TODO — estado actual

## Dónde estamos (2026-10-13, `master` al día con GHCR)

Juego de plataformas 2D jugable con **editor web completo**, cuentas y
niveles en el servidor con **PIN `XXXX-XXXX`** para compartir. Deploy en VPS
(`juegos.mposw.com.ar` + `api.juegos.mposw.com.ar`) vía Actions → GHCR.

## Estructura actual

- `apps/web/` — juego + editor (Vite + Phaser 3.90). Home estilo celular,
  editor con riel en cascada, 6 biomas de fondo, 20 enemigos, frutas/gemas,
  checkpoints, plataformas, 7 obstáculos, banner AdSense no invasivo.
- `packages/level-schema/` — formato v2 (tipos + validador + ejemplo, 16 tests).
  Kinds: `player_start/item/fruit/gem/walker/flyer/spikes/checkpoint/platform/deco/exit`.
  Campos visuales: `Tile.v`, `spikes.variant`, skins por props, `Level.bg`.
- `packages/themes/` — `pixel-adventure.json` (mapeo real, sin placeholders).
- `server/` — Fastify + pg, migraciones `001/002`, auth email+password
  (scrypt + JWT HS256, sin deps extra), CRUD dueño + PIN público + CORS.
- `assets/` — Pixel Adventure 1+2 CC0, Sunny Land bosque CC0, gemas y biomas
  generados propios. Créditos en `assets/CREDITS_PIXELADVENTURE.md`.
- `docker-compose.yml` — Postgres + API + web, labels caddy-docker-proxy.

## Cómo correr (verificado)

```bash
pnpm install
pnpm dev:web            # http://localhost:5173 (VITE_API_URL=http://localhost:8080 para la API)
pnpm --filter @tinogames/level-schema test   # 16/16
pnpm typecheck && pnpm build
docker compose up db -d
DATABASE_URL=... JWT_SECRET=... pnpm dev:server
```

## Deploy VPS

`docker compose pull && docker compose up -d`. Variables en `.env`:
`POSTGRES_*`, `WEB_DOMAIN`, `API_DOMAIN`, `JWT_SECRET` (obligatorio en
producción: sin él la API usa secreto de desarrollo).

## Pendientes (en orden sugerido)

1. **Contenido oficial**: 2-3 niveles curados (tutorial + showcase de biomas),
   publicados con PIN por nosotros.
2. **AdSense**: cuenta en revisión (2-4 semanas). Sitio verificado (script +
   `ads.txt` en raíz y subdominio) + `/privacidad.html` en el landing.
3. **Sonido mínimo** (WebAudio, sin assets): salto, gema, daño, checkpoint.
4. **Stomp**: hoy el contacto daña; decidir pisotón en walkers.
5. **PWA instalable**: service worker + iconos (hoy solo manifest).
6. **Mobile**: probar dock del editor y táctil en pantallas chicas; aviso
   horizontal ya existe.
7. **Deuda menor**: chunk Phaser 1.2MB, túnel 1-tile imposible por diseño
   (body 14×26), `spikes` con `t:'spikes'` en tiles sin uso.

## Decisiones ya tomadas (no reabrir sin motivo)

- Niveles **solo en servidor** (requieren cuenta); sin guardado local. Jugar
  por PIN es público y no pide login; con PIN solo se juega.
- PIN alfanumérico `XXXX-XXXX` (sin 0/O/1/I/L), único, inmutable por nivel.
- Gemas: todas obligatorias para abrir la salida. Fruta: +1❤ (tope máximo).
  Checkpoint: último tocado. Plataformas: móviles + que caen.
- Salto simple 4.5 tiles (jumpVelocity 320), body 14×26, walkers giran en bordes.
- Sin app nativa: PWA/Capacitor. JSON v2 disperso, sin techo, versionado.
