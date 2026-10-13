# TinoGames — Roadmap v2 (Phaser + TypeScript, web-first)

Visión: plataformas 2D con editor web tipo Mario Maker. Valentino diseña,
juega y comparte en el navegador. Después: cuentas + nube de niveles.
Después: Android vía PWA/Capacitor (nada nativo). Temas de sprites al final.

Base: prototipo Godot archivado (feel + arte migrados, sin TXT ni migración).

## Formato de nivel v2 (canónico)

JSON versionado, disperso (el aire no se guarda), sin techo, 1 tile = 16px.
Tipos en `packages/level-schema/src/types.ts`, reglas en `src/validate.ts`,
ejemplo válido en `levels/sample-level-1.json`.

- `tiles`: `{x, y, t: 'ground' | 'spikes' | ...}` (solo lo ocupado).
- `entities`: `player_start(1x)` `exit(1x)` `walker` `flyer` `item` `spikes`
  con `props` (rango/velocidad, amp/freq, w/h, needsAllItems).
- `player_start/walker/exit` con `ground` debajo; `flyer/item` en aire;
  `spikes` en tramo (piso) o columna (pared).
- Kinds nuevos = id + props, sin migrar niveles viejos. `game_version` en cada nivel.

## Fases (portón: cada fase se juega/usa antes de abrir la siguiente)

- [x] Repos: monorepo + level-schema + ejemplo + validador con tests.
- [ ] Fase 0 — Slice web local: héroe con feel portado, builder desde JSON v2
  (cámara + culling, niveles grandes), walker/flyer/pinchos/items/salida con
  llave, editor en grilla (pintar/borrar, validar, local, probar↔editar).
  Sale cuando Valentino crea 3 niveles y los termina en el navegador.
- [ ] Fase 1 — Backend wired: auth mínima + `POST/GET /v1/levels` + compartir
  por enlace. Sale cuando dos máquinas comparten un nivel.
- [ ] Fase 2 — PWA + Android (Capacitor). Editor web-only; en móvil jugar.
  Sale cuando un nivel web se juega en el celu.
- [ ] Fase 3 — Temas: 2 packs para validar el desacople.

## Decisiones

Ver `docs/decisions.md`. Server: Docker + caddy-docker-proxy en el VPS.
