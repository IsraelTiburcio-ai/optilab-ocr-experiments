# OptiLab OCR V3.1 — experimento local

V3.1 es una demo local e independiente para interpretar capturas de actividades con Tesseract.js 7 y modelos locales `spa`/`eng`. No está conectada con el OptiLab principal, Firebase, una cuenta académica o un servicio externo. No emite ni registra calificaciones.

## Abrir la demo

Requiere Node.js, Python 3 y los paquetes locales incluidos en esta carpeta.

```sh
npm run serve:v31
```

Abre [http://127.0.0.1:4176/index-v31.html](http://127.0.0.1:4176/index-v31.html). Para cerrar, detén el servidor con Ctrl+C.

La demo procesa una imagen elegida en el dispositivo dentro del navegador. No guarda cargas en `localStorage`/IndexedDB ni las envía a servicios OCR. Las vistas previas usan una URL temporal que se revoca al quitar la imagen o salir. Para reproducir el benchmark real, selecciona en lote los 11 archivos aptos dentro de `Descargas/Pruebas para ocr`; la interfaz filtra por nombre y solo lee los archivos enumerados en el inventario, en memoria. LearningApps y procedencias ambiguas no se OCRan.

## Reproducir el benchmark por terminal

El inventario conserva etiquetas visuales, dimensiones y hashes, pero no guarda rutas personales ni copias de las imágenes. Los scripts leen por nombre desde `~/Downloads/Pruebas para ocr/`; no mueven ni escriben sobre los archivos fuente.

```sh
npm run prepare:v31
npm test
npm run benchmark:v31
```

`npm run benchmark:v31` ejecuta Tesseract real sobre 7 capturas Wordwall de regresión, 4 nuevas capturas aptas y 14 fixtures sintéticos de exactitud por separado. La imagen sintética de estrés de 6000×4000 no entra en las métricas de exactitud. El resultado se guarda en `resultados/benchmark-v31.json`.

El snapshot de V3 antes de ajustar reglas para los cuatro casos nuevos está en `resultados/v31-new-format-baseline-before-adjustment.json`. Para reconstruir esa lectura:

```sh
npm run baseline:v31
```

Las cuatro capturas nuevas se inspeccionaron antes de ejecutar el OCR base, pero luego se usaron para cambiar reglas; sus resultados V3.1 son calibración/retest observado, no validación independiente. Se necesita un lote nuevo para medir generalización.

La demo permite volver a ejecutar el lote de 11 capturas reales en Chrome y descargar su JSON. En una sesión verificada el resultado fue: finalización 10/11, estados clasificados 10/11, una abstención, score 4/4, tiempo 8/8 y piezas 2/2; latencia 513/308/1423 ms (media/mediana/P95) y 24 pasadas. Esta medición depende del navegador y se conserva separada de la CLI.

## Perfiles

Los patrones extensibles y las seis plantillas están en `capturas/perfiles-v31.json`:

- `SCORE_FINAL`: señal final más fracción válida; separa score perfecto.
- `COMPLETION_ONLY`: cierre sin inferir puntuación.
- `PUZZLE_COMPLETE`: felicitación, tiempo etiquetado y número de piezas etiquetado; piezas son metadato.
- `FEEDBACK_ONLY`: respuesta correcta/felicitación sin cierre suficiente.
- `PROGRESS_ONLY`: fracción de progreso sin señal final.
- `UNKNOWN_LAYOUT`: salida conservadora y solicitud implícita de evidencia mejor.

La identidad de actividad y la autenticidad se conservan por separado. Una pista de proveedor nunca se convierte en identidad visual confirmada. Finalización tampoco significa perfección.

## Móvil

La página responde a pantallas pequeñas y permite elegir imágenes desde Fotos/Archivos si el navegador puede decodificar su formato. El OCR ajusta el lado más largo a 2400 px y amplía imágenes pequeñas hasta 3×; la estimación de memoria del canvas no es una medición de Tesseract. No se ejecutaron pruebas físicas en iPhone Safari ni Android Chrome.

En la Mac, se puede probar en la misma red privada con:

```sh
npm run serve:v31:lan
ipconfig getifaddr en0
```

En el dispositivo abre `http://IP-DE-LA-MAC:4176/index-v31.html`, con ambos dispositivos en una red de confianza, y detén el servidor al acabar. Esto no publica la aplicación.

## Archivos

- `index-v31.html`, `styles-v31.css`, `src/app-v31.mjs`: demo captura → OCR → resultado estructurado y benchmark de navegador.
- `src/classifier-v31.mjs`, `src/plan-v31.mjs`, `src/ocr-v31.mjs`, `src/image-sizing-v31.mjs`: clasificación, relecturas focalizadas y límites de recursos.
- `src/benchmark-summary-v31.mjs`: resumen de campos etiquetados, estados clasificados, abstenciones y latencia del benchmark de navegador.
- `capturas/inventario-v31.json`: etiquetas visuales, dimensiones, SHA-256 y elegibilidad.
- `capturas/sinteticas-v31/`: escenarios generados, identificados como sintéticos.
- `resultados/benchmark-v31.json`: salida reproducible actual, con casos reales y sintéticos separados.

Las páginas, reglas y pruebas V1/V2/V3 se conservan.
