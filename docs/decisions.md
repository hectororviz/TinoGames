# Decisiones TinoGames

## Stack (2026-10-15)

- Juego web-first → **Phaser + TypeScript + Vite** (Godot descartado: payload
  wasm pesado, editor fuera del DOM, dos mundos GDScript/JS).
- Sin app nativa: **PWA y/o Capacitor**.
- Monorepo pnpm: `apps/web`, `packages/level-schema`, `packages/themes`, `server/`.
- Server: **Fastify + Postgres**, Docker, dominios vía **caddy-docker-proxy**
  (labels por env, dominios al desplegar).
- Nivel como dato puro: JSON v2 versionado y disperso; el tema resuelve sprites.
- Sprites base CC0 + **Tux de SuperTux (GPLv3)** como personaje default
  (créditos en `assets/CREDITS_SUPERTUX.md`; nada de Nintendo).

## Mecánicas SMB con sprites propios (no reabrir)

- Física SuperTux (`apps/web/src/feel.ts`, GPL): walk 115, run 160
  (B = Shift/J/táctil), acel 150/200, fricción x1.5, derrape 300/375,
  arranque instantáneo 50, salto 260→290 por umbral con histéresis
  (gravedad 500/1500 apex x3), coyote 0.10s, buffer 0.25s,
  pisotón 210 (suelto) / 340 (manteniendo).
- Chico 12×14 (1 tile) ↔ grande 12×28 vía fruta fija o hongo móvil del
  bloque `?` (hay que atraparlo). Grande→chico con 2s invuln, chico→muerte.
  Sin doble-salto, sin dash, sin disparo, sin corazones, sin knockback.
- Monedas (ex-gemas, 3 colores): solo puntaje. La salida abre siempre.
- Ladrillos: chico rebota, grande rompe. Agacharse con ↓ (techo libre para
  pararse; en aire se espera a aterrizar). Sin crecer sin techo ("¡Sin lugar!"
  fue toast, hoy silencioso: no crece).
- Tuberías warp 2×2 con boca en 4 lados (tecla hacia la boca); destino
  verificado libre o se cancela el viaje. Salida con empujón hacia afuera.
- Sin toasts de gameplay: solo mensaje de victoria. Estado en HUD
  (🪙 contador, 🍄 solo si grande).
- Plataformas móviles/caedizas y pisos flotantes de 1 tile: **semisólidos**
  (se atraviesan subiendo, se pisan cayendo). Masas, columnas, bloques,
  ladrillos y tuberías siguen macizos (cabezazo).
- Trampolín: grupo propio, rebota solo al aterrizar encima; de costado pasa.
- Checkpoint: último tocado. Plataformas móviles H/V con arrastre exacto.
  Mundo y cámara con 3 tiles de aire sobre lo más alto
  (sin techo invisible en y=0).

## Editor web (no reabrir)

- Riel en cascada + pinceles: piso (252 variantes), personaje, enemigos (20,
  con lado de vista por skin), hongo, moneda, obstáculos, fondo en vivo,
  otros (checkpoint, plataformas H/V/cae, bloque `?`, ladrillo, tuberías
  4 dirs, salida). Borrar, mano, enlazar 🔗.
- Tuberías auto-enlazadas al pintar (P1↔P2...); enlazador manual para elegir
  pares; borrar rompe el enlace; `target` a pid inexistente = error.
- Inspector (mano + clic): eje/rango/velocidad de plataformas, rango/velocidad
  de enemigos, w/h de pinchos y tuberías, dir de boca, skins y colores.
- Miniaturas exactas del frame 0 (canvas, sin CSS de strips).
- Auto-borde de piso (toggle, ON por default): matriz 3×3 / tapas / par según
  grupo; manual al apagarlo.
- Entrada: izquierdo pinta (clic o trazo corrido), derecho borra (clic o
  trazo), rueda mueve el canvas (Shift horizontal, Ctrl zoom), mano/espacio/
  botón central panean. Grilla de 1px en pantalla a todo zoom. Errores con
  coordenadas clickeables que llevan la cámara al tile; lector de celda
  siempre visible en la barra.
- Canvas: fondo del bioma en vivo + velo, grilla, guía de vista 480×270,
  caja del nivel, techo y=0, línea de muerte, recorridos de plataformas,
  huellas reales, etiquetas de tubería y selección.
- Undo/redo (60), atajos (1-9, E, H, F, Ctrl+Z/Y, Espacio pan), Probar↔Editor
  (E), importar/exportar JSON, cámara con correa.

## Técnica de juego (lecciones pagadas)

- Rects sólidos únicos (`solidRects`: tiles + tuberías + bloques): los usan
  pararse, crecer, respawn y salidas warp. Lo roto sale de la lista.
- Regla fantasma de Arcade (`overlap > maxOverlap` se ignora): nunca dejar
  un cuerpo embebido >1px. Colocación analítica + 1px de aire + `body.reset()`
  (replantar solo el sprite deja `prev` obsoleto y el postUpdate catapulta).
- Red `ejectUp`: si el cuerpo solapa, salir hacia arriba. Solo pararse en
  piso y con lugar; en aire se espera.
- `tileSprite` sobre spritesheet muestra frames pegados: plataformas usan
  texturas 64px de frame único generadas por canvas.
- Arte (`assets/`, Pixel Adventure 1+2 CC0 + Sunny Land bosque CC0 + generado
  propio con `gen_art.py`): 4 personajes, 6 frutas-hongo, 3 monedas, 20
  enemigos, 6 obstáculos (la flecha se eliminó; la roca cae al acercarse),
  checkpoints, salida End, plataformas grises, tuberías,
  252 variantes de piso, 6 biomas. Catálogos en `docs/catalogo-pisos.pdf` y
  `docs/catalogo-sprites.pdf`. Créditos en
  `assets/CREDITS_PIXELADVENTURE.md`.

## Hecho desde el portado Godot (no reabrir)

- Auth real (scrypt + JWT) y niveles por dueño + PIN `XXXX-XXXX`.
- Niveles solo en servidor; jugar por PIN público y sin login.
- Trampas animadas como estáticos (los dinámicos en grupo caían).
- Walkers giran en bordes; plataformas cinemáticas con arrastre.
- AdSense integrado (slot + `ads.txt` + privacidad en el landing).

## Pendiente explícito

- Sonido WebAudio, HUD sin emoji (iconos sprite), niveles oficiales,
  descubrir niveles (lista pública/aleatorio), ayuda de controles,
  service worker PWA, caparazón koopa, sub-mundos por tubería.
