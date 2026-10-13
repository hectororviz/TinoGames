# TODO — continuar mañana

## Dónde estamos (2026-10-13, commit `6d19a89`)

Volantazo aplicado: Godot archivado, proyecto nuevo **Phaser + TypeScript**,
monorepo pnpm, backend desde día cero. Repo limpio y pusheado a
`git@github.com:hectororviz/TinoGames.git` (rama `master`).

Detalle largo: `ROADMAP.md`, decisiones en `docs/decisions.md`,
plan original en `/home/horviz/.opencode/plan/tinogames-roadmap.md` (fuera del repo).

## Estructura actual

- `apps/web/` — juego (Vite + Phaser 3.90). Slice jugable del nivel ejemplo.
  Sin editor todavía.
- `packages/level-schema/` — formato v2 (tipos + validador + ejemplo + 7 tests).
- `packages/themes/` — `pixel-adventure.json` (mapeo inicial, con placeholders).
- `server/` — Fastify + pg, migraciones en `migrations/`, Dockerfile con
  `pnpm deploy`. Auth real pendiente (usa header temporal `x-user-id`).
- `assets/` — arte migrado CC0 + `gen_art.py` (`pnpm gen:art`).
- `docker-compose.yml` — Postgres + API local; labels caddy-docker-proxy
  comentados para el VPS.

## Cómo correr (verificado hoy)

```bash
pnpm install
pnpm dev:web            # http://localhost:5173 — flechas/AD, Espacio x2, J dash, R
pnpm --filter @tinogames/level-schema test   # 7/7
pnpm typecheck && pnpm build
docker compose up db -d                      # solo Postgres local
pnpm dev:server                              # API en :8080 (requiere DATABASE_URL)
```

## Deploy VPS

Imágenes compiladas por GitHub Actions → GHCR. En el VPS:
`docker compose pull && docker compose up -d`.
Caddy-docker-proxy expone `juegos.mposw.com.ar` y `api.juegos.mposw.com.ar`.

## Pendientes (en orden sugerido)

1. **Playtest en navegador real** (acá no había Chromium): mover, saltar x2,
   dash, recibir daño, morir y reaparecer, juntar 4 items, abrir salida,
   ganar con R. Revisar: tamaño del body del player (18×28 en frame 32),
   picos (hitbox recortada a 16×10), proximidad de salida (radio 24px),
   items que flotan (loop en `game.ts` que recorre `children` — funciona pero
   es frágil, mejor grupo propio).
2. **Editor web (Fase 0)**: grilla con pan/zoom (niveles sin techo), paleta
   `ground/player_start/walker/flyer/item/spikes/exit`, pintar/borrar,
   validar con `@tinogames/level-schema`, guardar en localStorage,
   exportar/importar JSON, botón Probar↔Editar. Criterio: Valentino crea
   3 niveles y los termina.
3. **Enemigos y salida definitivos**: hoja de sprites para walker/flyer
   (hoy rectángulos generados), puerta de salida dedicada, decidir stomp
   (hoy el contacto daña, sin pisotón).
4. **Auth real**: login email+password, JWT, `owner_id` desde el token en vez
   del header temporal. Endpoints ya validan niveles (422 ante inválidos).
5. **PWA**: service worker + iconos (hoy solo manifest). Botones táctiles:
   hoy siempre visibles, evaluar mostrar solo en touch.
6. **Deploy VPS**: dominios para web y API, descomentar labels
   caddy-docker-proxy en `docker-compose.yml`, Postgres del VPS.
7. **Deuda menor**: warning de chunk Phaser 1.2MB (code-splitting cuando duela),
   `spikes` con `t:'spikes'` en tiles sin uso (las entidades `spikes` son la
   vía real), `docs/referencias/` con previews de packs para temas futuros.

## Decisiones ya tomadas (no reabrir sin motivo)

- Sin TXT, sin migración, sin techo de nivel, JSON v2 disperso y versionado.
- Sin app nativa: PWA/Capacitor. `kid.png`/`pig.png` descartados.
- Server TS + Postgres + Docker + caddy-docker-proxy.
