# Reporte técnico — OptiLab OCR V3.1

**Fecha:** 27 de octubre de 2026  
**Alcance:** experimento local, independiente del OptiLab principal  
**Motor:** Tesseract.js 7.0.0, modelos locales `spa` y `eng`

## Resultado ejecutivo

V3.1 conserva el comportamiento medido sobre las siete capturas Wordwall de regresión: los siete tipos de pantalla y los siete estados finales/activos coincidieron con las etiquetas visuales. Leyó exactamente las 4 puntuaciones finales y 6 tiempos visibles. La latencia de OCR fue 716 ms de media, 686 ms mediana y 1492 ms P95, con 15 pasadas.

En los cuatro formatos reales nuevos, V3.1 reconoció como finales los dos resúmenes de rompecabezas y la pantalla Genially; extrajo los dos tiempos y los dos conteos de piezas. Dejó indeterminado el `5/5` aislado: es una abstención correcta de no atribuirle significado. Como esas cuatro capturas se usaron para ajustar las reglas después de congelar el baseline, este retest **no es una prueba independiente de generalización**.

La demo también procesó las 11 capturas reales en Chrome y exportó un JSON estructurado. El resumen del navegador informó finalización correcta 10/11, 10/11 estados clasificados y una abstención; score 4/4, tiempo 8/8 y piezas 2/2. La latencia de esa sesión fue 513 ms media, 308 ms mediana y 1423 ms P95, con 24 pasadas. Es una ejecución distinta de la CLI; los tiempos dependen del navegador y no deben compararse como si fueran la misma medición. Se corrigió un defecto de presentación que inicialmente mostraba `undefined`/`NaN` en los agregados y se volvió a ejecutar el benchmark.

La demo demuestra OCR local y clasificación estructurada. No demuestra autenticidad, identidad del juego, intento perfecto ni aceptación académica. No habilita créditos. LearningApps permanece fuera del OCR; sus eventos de finalización son una vía distinta y no demuestran resultado perfecto ni autenticidad.

## Dataset y etiquetas visuales

El inventario encontró 19 JPG, 18 imágenes únicas y un duplicado exacto. Las etiquetas se asignaron por inspección visual independiente de la salida OCR.

| Grupo | Cantidad | Tratamiento |
|---|---:|---|
| Wordwall ya usadas en V1–V3 | 7 | Regresión, no generalización |
| Capturas nuevas aptas para OCR | 4 | Baseline V3 antes de ajustes; retest V3.1 de calibración |
| LearningApps con proveedor visible | 4 | Inventariadas, excluidas del OCR |
| Proveedor/procedencia ambigua, con posible LearningApps | 3 | Excluidas conservadoramente del OCR |
| Duplicado byte a byte de Genially | 1 | Presente en inventario, excluido de casos independientes |

El inventario registra metadatos y etiquetas, no guarda rutas personales ni copias de imágenes. Los originales de Descargas no se renombraron, movieron ni modificaron. La demo no guarda las imágenes que el usuario elige; el benchmark del navegador usa los archivos seleccionados solo en memoria y filtra los 11 nombres aptos.

## Comparación de regresión Wordwall

| Métrica | V3 registrada | V3.1 actual | Lectura |
|---|---:|---:|---|
| Final/activa | 7/7 | 7/7 | Sin regresión observada |
| Tipo de plantilla | No calculado con estos seis perfiles | 7/7 | Los siete casos coinciden con su perfil visual esperado |
| Campos de puntuación, incluidos casos sin score | 7/7 | — | La medida histórica incluye tres casos donde no debía existir score |
| Puntuación final visible | No separado | 4/4 | Exactitud entre campos realmente etiquetados como score |
| Campos de duración, incluidos sin duración | 7/7 | — | La medida histórica incluye un caso sin tiempo |
| Tiempo visible | No separado | 6/6 | Exactitud entre tiempos etiquetados como visibles |
| Latencia media | 735 ms | 716 ms | −19 ms en esta ejecución local |
| Mediana | 636 ms | 686 ms | +50 ms |
| P95 | 1558 ms | 1492 ms | −66 ms |
| Pasadas OCR | 17 | 15 | Dos menos en siete capturas |

V3.1 necesitó una tercera lectura centrada para rescatar el tiempo de una captura grande con texto muy débil. Las imágenes pequeñas sin señal útil se detienen después de dos lecturas. Un par de relecturas de la captura Wordwall `502659…` generó avisos internos de Tesseract sobre cajas fuera del recorte; el proceso continuó y el score recuperado fue exacto, pero la latencia de ese caso fue la mayor del grupo (1492 ms).

## Formatos nuevos observados

### Baseline V3 antes de ajustar reglas

El resultado original está congelado en `BASELINE-V3-HOLDOUT-V31.json` y `resultados/v31-new-format-baseline-before-adjustment.json`.

| Métrica, 4 capturas nuevas | V3 antes de ajustes |
|---|---:|
| Detección binaria de finalización | 1/4 |
| Tiempo visible | 0/2 |
| Número de piezas | 0/2 |
| Pasadas totales | 14 |
| Latencia media / P95 | 262 / 512 ms |

### Retest con V3.1

| Formato / etiqueta visual | Casos | Finalización exacta | Campos exactos | Salida observada |
|---|---:|---:|---:|---|
| Rompecabezas externo | 2 | 2/2 | Tiempo 2/2; piezas 2/2 | `PUZZLE_COMPLETE`; piezas quedan separadas del score |
| Genially | 1 | 1/1 | Sin score ni tiempo visible | `COMPLETION_ONLY`; sin perfección inferida |
| `5/5` en escena recortada | 1 | 0 confirmaciones; 1 abstención | Sin campos determinables | `UNKNOWN_LAYOUT` / `INDETERMINADO` |
| **Total** | **4** | **3/4 estados exactos; 1/4 abstención** | **Tiempo 2/2; piezas 2/2; score 0/0 aplicables** | **0 falsos positivos, 0 falsos negativos; una salida indeterminada** |

Latencia en los cuatro casos: media 174 ms, mediana 168 ms, P95 301 ms, 7 pasadas. La sensibilidad positiva fue 3/3 cierres visibles; en el único caso negativo ambiguo, el clasificador se abstuvo en vez de afirmar `FINALIZACION_NO_CONFIRMADA`.

Los perfiles de rompecabezas exigen juntos una felicitación, un tiempo etiquetado y un conteo de piezas etiquetado. Es una regla respaldada por dos capturas reales; falta una captura real de rompecabezas incompleto con mensaje intermedio y una pantalla final diferente para probar mejor su separación. El patrón Genially se observó en una sola imagen y no tiene puntuación.

## Fixtures negativos y sintéticos

Se generaron 14 fixtures sintéticos para representar feedback, progreso 5/5, finalización solo, score perfecto/no perfecto, batería, felicitación intermedia, piezas sin cierre, score recortado, otro juego activo y una imagen ilegible. Se identifican como sintéticos en su manifiesto y no se mezclan con las métricas reales. Hay además una imagen de estrés 6000×4000 excluida de las métricas de exactitud.

| Métrica sintética | Resultado |
|---|---:|
| Perfil esperado exacto | 14/14 |
| Estado final exacto entre 12 referencias determinables | 10/12 clasificados correctamente; 2 abstenciones |
| Falsos positivos / falsos negativos entre estados clasificados | 0 / 0 |
| Score visible | 3/3 |
| Tiempo visible | 4/4 |
| Piezas | 2/2 |
| Latencia media / mediana / P95 | 165 / 101 / 918 ms |
| Pasadas | 18 |

Las dos abstenciones fueron una felicitación intermedia sin contexto terminal y un resumen de piezas sin una estructura suficiente. La latencia P95 está influida por el fixture ilegible con ruido. Son comprobaciones de escenarios definidos, no precisión en juegos de alumnos ni generalización a proveedores nuevos.

## Reglas y límites de acreditación

Los seis perfiles configurables son `SCORE_FINAL`, `COMPLETION_ONLY`, `PUZZLE_COMPLETE`, `FEEDBACK_ONLY`, `PROGRESS_ONLY` y `UNKNOWN_LAYOUT`.

- Una señal final permite detectar cierre; no basta para probar score perfecto.
- `14/14` puede reflejar perfección numérica visible, pero no vincula por sí mismo la captura a la actividad esperada.
- `28 piezas` y `3:26` son piezas y tiempo; nunca se convierten en puntos.
- `¡Muy bien!`, `Correcto` o `5/5` aislados no se convierten en cierre.
- Las discrepancias e indeterminados permanecen sin convertirlos en ceros académicos.
- La aplicación no genera `academicGrade`, no registra alumnado ni se conecta al OptiLab original.
- Ningún OCR demuestra quién jugó, que el archivo no fue editado o que se respetó el primer intento.

La investigación separada de LearningApps reportó eventos `AppSolved`/`AppCompleted` por `postMessage`. Si el evento sigue confirmado para el recurso específico y la profesora lo acepta, ese canal puede detectar finalización sin OCR. No demuestra perfección al primer intento, identidad/autenticidad de la imagen ni calificación académica. Esa aceptación docente queda fuera de este experimento.

## Móvil, memoria y ejecución local

Se comprobó la página V3.1 en Chrome integrado con viewport 390×844 px: ancho de contenido 372 px y sin desbordamiento horizontal. También se ejecutó OCR en el navegador sobre un fixture sintético local: `SCORE_FINAL`, 14/14, 1:07, una pasada (141 ms OCR, 129 ms de arranque del worker en esa sesión). El benchmark real de navegador procesó las 11 imágenes aptas en memoria y no registró errores de consola. **No se probó un teléfono físico**; Safari móvil y Android Chrome quedan pendientes.

La página permite seleccionar `image/*` desde el dispositivo. El procesamiento limita el lado largo a 2400 px y amplía capturas pequeñas hasta 3×. La imagen sintética 6000×4000 pasa a 2400×1600; su canvas RGBA se estima en 14.6 MiB. Es una estimación del canvas, no una medida total de RAM móvil. La vista previa usa una URL temporal; los canvases y worker se liberan al terminar/salir. Tesseract se carga desde el paquete local sin caché persistente; no hay almacenamiento de capturas.

Para acceso móvil desde una red privada, `README-OPTILAB-OCR-V31.md` incluye el comando local temporal y pasos para la misma Wi-Fi; no se desplegó la página.

## Reproducir y artefactos

Desde el directorio experimental:

```sh
npm test
npm run serve:v31
npm run benchmark:v31
```

Para el benchmark del navegador, selecciona en lote los 11 archivos aptos dentro de `Pruebas para ocr`; el selector filtra por nombre y solo ejecuta OCR en esas capturas. El botón sintético ejecuta los 14 fixtures por separado. No uses el retest de las cuatro capturas nuevas como una validación independiente.

V1, V2 y V3 permanecen en el directorio experimental con sus archivos y pruebas. No hubo cambios al repositorio principal, Firebase, servicios de pago, commits, despliegues ni integraciones académicas reales.

Las pruebas automatizadas del experimento completo pasan **57/57**; se añadió una prueba del resumen del benchmark para cubrir métricas clasificadas, abstenciones, denominadores etiquetados y latencia. El ZIP autocontenido incluye y pasa **18/18** pruebas específicas de V3.1.
