# OptiLab OCR — experimentos V1–V3.1

Repositorio independiente para investigar la lectura local de capturas de juegos educativos con Tesseract.js. **No forma parte del repositorio principal OptiLab y no registra calificaciones reales.** Se conservan las cuatro versiones, sus pruebas, métricas y reportes.

## Versiones

| Versión | Demo local | Guía y resultados |
|---|---|---|
| V1 | `npm run serve` → `http://127.0.0.1:4173/` | [README-V1.md](README-V1.md), [INFORME.md](INFORME.md) |
| V2 | `npm run serve:v2` → `http://127.0.0.1:4174/index-v2.html` | [README-V2.md](README-V2.md), [INFORME-V2.md](INFORME-V2.md) |
| V3 | `npm run serve:v3` → `http://127.0.0.1:4175/index-v3.html` | [README-V3.md](README-V3.md), [INFORME-V3.md](INFORME-V3.md) |
| V3.1 | `npm run serve:v31` → `http://127.0.0.1:4176/index-v31.html` | [README-OPTILAB-OCR-V31.md](README-OPTILAB-OCR-V31.md), [REPORTE-OPTILAB-OCR-V31.md](REPORTE-OPTILAB-OCR-V31.md) |

Las demos deben servirse por HTTP local; no se recomienda abrirlas con `file://` porque cargan módulos ES y trabajadores web.

## Instalar y comprobar

Requiere Node.js/npm y Python 3.

```sh
npm ci
npm test
```

Los benchmarks históricos usan capturas privadas que no se distribuyen en este repositorio. Para reproducir V2, V3 o V3.1, coloca el conjunto autorizado en `~/Downloads/Pruebas para ocr/` y sigue las instrucciones específicas de cada README. V1 usaba imágenes locales que también se excluyen; sus métricas y etiquetas se conservan en `resultados/` y `capturas/` como datos no visuales.

## Alcance y privacidad

- El OCR es local y experimental; no hay integración con OptiLab, Firebase ni servicios de pago.
- Se excluyen las capturas originales y sus variantes. Solo se versionan imágenes sintéticas generadas para pruebas automatizadas, claramente separadas de métricas reales.
- LearningApps no recibe OCR: si `AppSolved`/`AppCompleted` está confirmado y la profesora acepta esa evidencia, corresponde usar la integración de eventos por separado. El evento de cierre no demuestra resultado perfecto ni autenticidad.
- Finalización, perfección del resultado, identidad de actividad y autenticidad son dimensiones distintas. Una abstención no se convierte en cero académico.

Consulta los informes de cada versión para el método, las métricas, los casos no determinables y las limitaciones de generalización y móvil.
