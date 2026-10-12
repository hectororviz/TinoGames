# Lecciones del proyecto anterior (Avatar/EDLR)

Lo que funcionó y se copió acá:

1. **Vertical slice primero**: una pantalla linda + personaje antes que niveles.
2. **Hitos M1..Mn** desde el día 1 para reportar jugando.
3. **Zoom y tamaño decididos temprano** (acá: zoom 1.0 + sprites 48px).
4. **Input Map por acciones**, táctil puenteando con action_press/release.
5. **Salto con coyote (0.10s) + buffer (0.12s)**: se siente bien en móvil.
6. **Android**: GL Compatibility + `import_etc2_astc=true` + preset debug.
   Plantillas y SDK ya instalados en esta máquina (`~/android/`).
7. **Arte cartoon generado por código** (`tools/gen_art.py`): mejor que
   pixel procedurals para este estilo. Regla: nada de binarios sin fuente.
8. **Un script por escena**, sin autoloads hasta necesitarlos.
9. **Mapa en texto** como idioma para diseñar niveles hablando.
10. **APK fuera de git** (`builds/` ignorado), commits por hito jugable.

Lo que NO repetimos: arrancar en pixel art, niveles largos antes del feel,
pickups sin propósito, botones táctiles que aparecen tarde.
