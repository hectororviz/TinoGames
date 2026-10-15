# TinoGames — Roadmap (Phaser + TypeScript, web-first)

Visión: plataformas estilo SMB1/SMB3 con editor web tipo Mario Maker, con
sprites 100% propios. Valentino diseña, juega y comparte en el navegador.
Después: nube de niveles con descubrimiento. Después: Android vía PWA
(nada nativo).

## Estado (2026-10-15): modo SMB jugable + editor completo

- Física SMB (caminar/correr, salto variable, pisotón, chico/grande),
  hongo móvil, monedas, ladrillos, tuberías warp 4 lados, agacharse,
  plataformas H/V, checkpoints. Sin toasts (solo victoria).
- Editor: pinceles + inspector de propiedades + fondo en vivo + límites.
- Cuentas + niveles en servidor + PIN `XXXX-XXXX` para compartir.
- Deploy en VPS (`juegos.mposw.com.ar` + `api.juegos.mposw.com.ar`).

## Formato de nivel v2 (canónico)

JSON versionado, disperso (el aire no se guarda), sin techo, 1 tile = 16px.
Tipos en `packages/level-schema/src/types.ts`, reglas en `src/validate.ts`,
ejemplo válido en `levels/sample-level-1.json` (19 tests).

- Kinds: `player_start` `fruit`(hongo) `gem`(moneda) `walker` `flyer`
  `spikes` `checkpoint` `platform`(x/y/fall) `deco` `powerup`(bloque ?)
  `brick` `pipe`(w/h/dir/pid/target) `exit` (abre siempre).
- `target` vacío = tapada; a pid inexistente = error. Niveles viejos
  (dash/doble/disparo/3HP) no se mantienen.

## Siguiente (en orden)

1. Docs al día (hecho) → sonido WebAudio → HUD sin emoji → niveles oficiales.
2. Descubrir niveles (lista pública/aleatorio) + ayuda de controles.
3. PWA instalable (service worker + iconos).
4. Caparazón koopa → sub-mundos por tubería (`Level.subworlds` aditivo).

## Decisiones

Ver `docs/decisions.md`. Server: Docker + caddy-docker-proxy en el VPS.
