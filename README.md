# Jueguito (prototipo con Valentino)

Plataformas 2D cartoon para Android. Godot 4.7. Estado: vertical slice
(menú con el héroe en portada + una pantalla jugable).

## Abrir y probar

1. Godot 4.7 → Importar → `jueguito/project.godot`.
2. F5 → menú → JUGAR (o Enter).
3. PC: **A/D o flechas** moverse, **Espacio** saltar, **J** dash, **R** reiniciar.
4. Táctil: ◀ ▶ + A (salta) + B (dash). Funciona con ratón.
5. Hitos M1–M3 para reportar rarezas ("en M2 el foso es imposible").

## Exportar a Android

Preset `Android (debug)` listo. Requiere plantillas 4.7 + SDK (ver `docs/LECCIONES.md`).
Salida: `../builds/jueguito-debug.apk` (ignorado en git).

## Estructura

- `scenes/menu.tscn` — portada: héroe flotando + JUGAR/Salir.
- `scenes/main.tscn` — pantalla: suelo, 2 plataformas, foso, M1–M3, táctil.
- `scenes/player.tscn` — héroe (correr/saltar/dash, coyote + buffer).
- `scripts/` — un script por escena, sin autoloads todavía.
- `art/` — todo generado por `tools/gen_art.py`. Nada de binarios sin fuente.
- `docs/MAPA.txt` — el nivel en texto, para diseñar hablando.
- `docs/LECCIONES.md` — lo aprendido en el proyecto anterior.

## Reglas

1. Una pantalla linda antes que un nivel largo.
2. Probar en teléfono antes de agregar contenido.
3. El héroe de la portada es el mismo del juego (misma hoja `kid.png`).
