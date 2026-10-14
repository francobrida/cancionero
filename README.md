# Cancionero

Web estática (sin backend, sin build) para leer el cancionero PDF desde el móvil.

## Estructura
| Archivo | Para qué |
|---|---|
| `index.html` / `style.css` / `app.js` | La app: índice con buscador, visor de canción, autoscroll, zoom, modo oscuro |
| `index.json` | Índice generado: canciones, artista y segmentos (página, columna, y0, y1) a recortar |
| `cancionero.pdf` | El PDF original (copia de `T DE TODO CANCIONERO.pdf`) |
| `vendor/` | PDF.js 3.11.174 local (para que funcione offline) |
| `sw.js` / `manifest.webmanifest` / `icon*` | PWA: instalable y offline |
| `build_index.py` / `review.txt` | Preprocesado (PyMuPDF) y lista de casos dudosos |
| `overrides.json` | Correcciones manuales que aplica el script: `join` (unir títulos cortados) y `drop` (eliminar falsos) |

## Probar en local
```
python serve.py
```
y abrir http://localhost:8765 (el service worker necesita http://localhost o https).

## Regenerar el índice (si cambia el PDF)
```
pip install pymupdf
python build_index.py cancionero.pdf
```
Después subí `VERSION` en `sw.js` para que los móviles actualicen la caché.

## Desplegar
**GitHub Pages:** subí esta carpeta a un repo → Settings → Pages → Deploy from branch (`main`, `/root`). Abrí la URL https en el móvil → menú del navegador → "Instalar app / Añadir a pantalla de inicio".
**Netlify:** arrastrá la carpeta a https://app.netlify.com/drop.
Solo hacen falta: `index.html style.css app.js index.json cancionero.pdf sw.js manifest.webmanifest icon* vendor/`.

La primera visita descarga el PDF (11 MB) y queda cacheado: después funciona sin conexión.

## Agregar canciones (texto pegado)
1. Copiá `canciones/_plantilla.txt` a `canciones/mi_cancion.txt` (los que empiezan con `_` se ignoran).
2. Completá `titulo:`, `artista:` y `genero:` (ROCK, POP, CUMBIA… o uno nuevo), dejá **una línea en blanco** y pegá debajo el texto con los acordes.
3. `python build_index.py cancionero.pdf`
4. Subí `VERSION` en `sw.js` y `?v=` en `index.html`, luego `git add -A && git commit -m "..." && git push`.
