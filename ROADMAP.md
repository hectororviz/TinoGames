# TinoGames — Roadmap (base: jueguito)

Visión: juego de plataformas 2D estilo Geometry Dash en flujo, pero con
jugabilidad propia + editor de niveles web. Valentino diseña en papel o en
grilla, el juego lo convierte en nivel jugable. Después: cuentas, nube de
niveles y app Android que descarga tus niveles. Temas/sprites intercambiables.

Estado actual: prototipo Godot 4.7 (menú + 1 pantalla, `scenes/main.tscn`),
nivel a mano, export Android debug. Se usa de base, no se rompe.

## Codificación de niveles v1 (1 bloque = 1 caracter)

Grilla fija 30x12. Ver `docs/NIVEL_VALENTINO.txt` (leyenda + muestra + prompt IA)
y `tools/hoja_valentino.html` (hoja imprimible + muestra a color).

- `.` blanco/vacío, `#` negro/piso, `P` verde/player (1x, sobre `#`)
- `E` rojo/caminante (sobre `#`, patrulla), `V` azul/flotante (en aire)
- `*` amarillo/item (en aire), `F` rosa/meta (1x, sobre `#`, abre con todos los `*`)
- `^` pared de pinches = columna vertical de 3+ rojos/azules

Reglas: rectangular 30x12, `P/E/F` con `#` debajo, `V/*` en aire.

## Fase 0 — Web + editor local (actual, sin servidor)

- [ ] Preset Web (GL Compatibility, 480x270 ya apto).
- [ ] `scripts/level_builder.gd`: construye nivel desde txt en memoria
      (`#`→Geometry, `P`→player, `*`→collectible, `^`→spikes, `F`→exit gated).
- [ ] `scenes/walker.tscn` (E, patrulla) + `scenes/flyer.tscn` (V, seno).
      Hoy solo existe chaser; no reutilizarlo como enemigo de nivel.
- [ ] `scenes/editor.tscn`: grilla 30x12, paleta `. # P E V * F`,
      pintar/borrar, validar en vivo, cargar muestra, exportar/importar txt,
      guardar en `localStorage`, botón Probar ↔ Volver.
- [ ] `scenes/valentino.tscn` aparte para no romper `main.tscn`.
- [ ] Criterio salida: Valentino pinta → prueba en web con 1 click.

## Fase 1 — Servidor MVP (cuentas + nube de niveles)

- [ ] Modelo: `users / levels(id, owner, grid_txt, theme_id, game_version) / themes`.
- [ ] API REST mínima: `POST /levels`, `GET /levels?owner=me`, `GET /levels/:id`.
- [ ] Auth simple primero (email+password o anónima con token). BaaS sugerido
      (Supabase/Firebase) para no montar backend propio aún.
- [ ] Cliente Godot con `HTTPRequest` + JSON + `game_version` en cada nivel.
- [ ] Compartir por código/enlace. Sin moderación todavía.
- [ ] Criterio salida: dos PCs distintas comparten un nivel por nube.

## Fase 2 — Android cliente (descarga niveles)

- [ ] Reusar preset Android existente; agregar login + lista `mis niveles` +
      caché offline.
- [ ] Solo jugar/descargar al inicio; editor queda web-only.
- [ ] Criterio salida: nivel creado en web se juega en el celu logueado.

## Fase 3 — Temas (cuando 0-2 estén maduros)

- [ ] Desacoplar lógica de arte: `theme_id` → tileset/sprites/música.
- [ ] 2 temas para validar el sistema antes de abrir a más.

## Decisiones abiertas

- BaaS vs servidor propio.
- Anónimo vs login desde el día 1.
- Tamaño de grilla: congelar 30x12 hasta Fase 2.
- Hosting web: itch.io vs GitHub Pages vs propio.

## Repos

- Nuevo remoto: `git@github.com:hectororviz/TinoGames.git` (este repo).
- `builds/` y `.godot/` ignorados, no versionar binarios.
