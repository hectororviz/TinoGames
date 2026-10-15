# TODO — estado actual

## Dónde estamos (2026-10-15)

Juego estilo SMB1/SMB3 con **sprites propios**: salto variable, correr con B,
aceleración/derrape, pisotón bajo/alto, chico (1 tile) ↔ grande (~2 tiles) vía
fruta o bloque `?`. Sin doble-salto, sin dash, sin disparo, sin corazones:
grande→chico→muerte. Editor web completo + cuentas + PIN `XXXX-XXXX`.
Deploy en VPS vía Actions → GHCR.

## Estructura actual

- `apps/web/` — juego + editor (Vite + Phaser 3.90). Física SMB
  (`walkMax/runMax/acel/derrape`, salto variable, pisotón, chico/grande,
  hongo móvil, ladrillos, tuberías warp, agacharse), editor con riel en
  cascada (pinceles hongo/moneda/bloque ?/ladrillo/tubería auto-enlazada),
  6 biomas de fondo, 20 enemigos, monedas, checkpoints, plataformas,
  7 obstáculos, banner AdSense.
- `packages/level-schema/` — formato v2 (tipos + validador + ejemplo, 17 tests).
  Kinds: `player_start/fruit(hongo)/gem(moneda)/walker/flyer/spikes/checkpoint/platform/deco/powerup(bloque ?)/brick/pipe/exit(siempre abierta)`.
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
3. **Sonido mínimo** (WebAudio, sin assets): salto, pisotón, powerup, daño, checkpoint.
4. **Túnel 1-tile**: verificado por diseño (chico 12×14 pasa, grande 14×28 no).
5. **PWA instalable**: service worker + iconos (hoy solo manifest).
6. **Mobile**: probar dock del editor y táctil en pantallas chicas; aviso
   horizontal ya existe. Táctil: A salta (variable), B corre mantenido.
7. **Deuda menor**: chunk Phaser 1.2MB, `spikes` con `t:'spikes'` en tiles sin uso.
8. **Sub-mundos por tubería**: `target` cruzado `"L2:P1"` (hoy `"P2"` local,
   compatible), `Level.subworlds?: {id, tiles, entities}[]` aditivo sin migrar,
   pila de retorno en `game.ts` (restart con sub-nivel), pestañas Mundo 1/2
   en el editor al final.

## Decisiones ya tomadas (no reabrir sin motivo)

- Niveles **solo en servidor** (requieren cuenta); sin guardado local. Jugar
  por PIN es público y no pide login; con PIN solo se juega.
- PIN alfanumérico `XXXX-XXXX` (sin 0/O/1/I/L), único, inmutable por nivel.
- Fruta/bloque `?`: el bloque suelta hongo móvil (hay que atraparlo).
  Grande→chico con 2s invuln, chico→muerte. Monedas: solo puntaje
  (🪙, morada/azul/roja); la salida abre siempre. Ladrillos: chico rebota,
  grande rompe. Tuberías warp 2×2 con ↓ (auto-enlazadas P1↔P2 en el editor).
  Agacharse con ↓ (techo libre para pararse grande).
  Checkpoint: último tocado. Plataformas: móviles + que caen.
- Física SMB (`apps/web/src/feel.ts`): walk 95 / run 165 (B), acel/derrape,
  salto variable 300→360 (gravedad 650/1150 + corte), coyote 0.10s,
  buffer 0.12s, pisotón 210/340. Chico 12×14 (1 tile), grande 12×28.
- Sin app nativa: PWA/Capacitor. JSON v2 disperso, sin techo, versionado.
  Niveles viejos (dash/doble/disparo/3HP) no se mantienen: se borran.
