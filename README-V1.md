# Experimento independiente: Wordwall + OCR V1

Prueba de concepto local para analizar capturas de la actividad **Método de M Grande** (Wordwall, recurso 22610275). No forma parte de OptiLab ni modifica su repositorio.

## Abrir la demo

Requiere Node.js y Python 3.

```sh
npm ci
npm run serve
```

Abre <http://127.0.0.1:4173/>. No uses `file://`: la demo importa módulos ES y crea un trabajador web.

La primera versión usaba capturas locales para comprobar el flujo. Por privacidad, las imágenes originales y las variantes no se incluyen en este repositorio; los resultados y etiquetas no visuales permanecen en `resultados/` y `capturas/`.

## Qué hace

- La imagen se lee en el navegador con Tesseract.js 7.0.0. No hay backend ni almacenamiento de capturas.
- El parser determinista devuelve puntuación, máximo y porcentaje solo si aparecen de forma explícita; separa el temporizador de una duración de resolución.
- El JSON se genera localmente y se descarga solo si se pulsa el botón.

## Código y resultados

- `index.html`, `styles.css`, `src/app.mjs`: demo sin backend.
- `src/parser.mjs`, `src/parser.test.mjs`: extracción y casos de reglas construidos a mano.
- `capturas/manifest.json`: nombres, etiquetas de referencia visuales, hashes y parentesco de variantes; no contiene las imágenes.
- `resultados/`: ejecuciones, ablaciones y métricas históricas.

Consulta [INFORME.md](INFORME.md) para método, métricas, limitaciones y decisión de viabilidad.
