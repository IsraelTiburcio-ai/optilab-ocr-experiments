# Informe técnico — Wordwall + OCR para OptiLab

**Evaluación:** **C — viable solo como apoyo a revisión.** Tesseract.js puede extraer información útil de algunos cierres, pero la pantalla observada no contiene un denominador que demuestre 100%. No se recomienda acreditar automáticamente esta actividad a partir del OCR.

## Resumen

Se probó la actividad pública **Método de M Grande**, recurso Wordwall `22610275`, con su página original y su embed. Se reutilizaron capturas auténticas disponibles de la investigación anterior, tal como permitía el encargo, y se conservaron sus archivos originales sin editar. El dataset contiene 30 archivos: 16 capturas originales, 14 variantes creadas a partir de originales, 28 hashes de archivo distintos y 14 capturas originales únicas por hash. Cada archivo recibió tres lecturas OCR; las variantes están identificadas y no cuentan como partidas independientes.

El cierre de una partida muestra `SE ACABÓ EL TIEMPO` y `Puntuación` seguida de un número, pero no muestra puntuación máxima ni porcentaje. En una captura con puntuación 3, Tesseract leyó correctamente el texto de finalización y el 3; el parser devolvió **Indeterminado**, como debe hacerlo sin máximo verificable. En otro cierre con 0 puntos, el OCR de página completa no reconoció el contenido, pero el recorte de la tarjeta leyó el 0 y el parser devolvió **No acreditable**. No hay una captura perfecta de referencia, así que no se midió sensibilidad para detectar acreditaciones perfectas ni se pudo estimar el riesgo de aceptar una captura perfecta falsa.

La clasificación sobre originales únicos alcanzó 13/14 (92.9%), pero **las 14 predicciones fueron Indeterminadas**. Esa exactitud aparente viene de abstenerse en la mayoría de los casos y no demuestra capacidad práctica para distinguir una captura perfecta. Se produjo una omisión: el cierre conocido con 0 puntos quedó Indeterminado en el OCR completo.

## Alcance y límites

- Experimento aislado en `~/Documents/Codex/Experimentos/optilab-wordwall-ocr/`.
- No se modificó OptiLab, no se creó PR ni commit y no se desplegó nada.
- No se desarrolló ni ejecutó OCR para LearningApps.
- Sin Firebase, APIs comerciales, modelos generativos, datos personales de estudiantes ni almacenamiento remoto de capturas.
- Se abrió la página original y el embed públicos de Wordwall. Las capturas del dataset se reutilizaron de la investigación anterior permitida; no se afirma que se hayan producido nuevas partidas durante esta prueba. La atribución de cada archivo a una partida concreta no está completa.
- No se obtuvo ni se inventó una captura perfecta.

## Dataset y método

Las etiquetas se asignaron por inspección visual antes de ejecutar OCR y se guardaron en `capturas/manifest.json`, junto con SHA-256, estado esperado, campos visibles, transformaciones y captura de origen. Las capturas originales abarcan inicio, partida en curso, respuestas correctas e incorrectas, fin por tiempo, un resultado de 3 puntos y cierres de 0. Dos pares de archivos originales eran duplicados exactos. Las 14 variantes aplican reducción, JPEG, escala de grises/contraste y recortes; heredan la referencia del original.

El ensayo principal ejecutó 90 lecturas: 30 archivos × 3 repeticiones, español e inglés, Tesseract.js 7.0.0, modo de página automático. Se hicieron además comparaciones de idioma en cuatro imágenes, y pruebas de recorte y segmentación con dos cierres finales, tres repeticiones por condición. Los casos sintéticos del parser verifican reglas deterministas; no se mezclan con la exactitud sobre capturas reales.

La app del navegador procesa el `File` local o un recorte temporal creado en un `canvas`; el archivo no se envía ni se conserva. El paquete del motor y los modelos de idioma pueden descargarse la primera vez. La configuración de la demo fija el contexto del recurso 22610275; ese ID no se reconoce visualmente a partir de la imagen.

## Lo que muestra Wordwall

En el cierre observado, Wordwall indica que terminó el tiempo y enseña una puntuación aislada. No exhibe la cantidad total de preguntas, máximo ni porcentaje. Una puntuación de 3 demuestra que la pantalla final contiene un marcador 3; **no** demuestra 3/3. Tampoco demuestra que el alumno haya alcanzado el requisito de todos los aciertos.

La actividad observada termina por cuenta regresiva y suma las respuestas que se alcanzaron antes de agotarse el tiempo. Ese flujo no presenta un máximo fijo verificable en la pantalla. Configurar manualmente un umbral de puntos podría aplicar otra regla docente, pero no convertiría una puntuación aislada en prueba de 100%. Para una actividad de cantidad fija de preguntas, un máximo configurado previamente podría ayudar, siempre que corresponda a la versión exacta del recurso y la captura también pruebe que esa actividad terminó.

## Tres niveles que se mantienen separados

1. **Finalización:** el OCR reconoció `SE ACABÓ EL TIEMPO` en el cierre con 3 y, usando el recorte, en el cierre con 0. Eso confirma una señal visual de fin; no confirma éxito académico.
2. **Resultado perfecto:** no se demuestra con las capturas observadas. El número sin máximo produce `Indeterminado`; no se infiere el denominador ni se concede el punto.
3. **Autenticidad y antifraude:** no se comprueban. OCR no demuestra identidad, origen, momento de captura ni que la imagen no esté editada. La app marca `authenticityVerified: false`.

## Métricas del ensayo principal

Las tasas de campos se calculan sobre referencias visuales no nulas de capturas originales únicas. `N/A` significa que no había referencia visible suficiente para medir exactitud.

| Campo o decisión | Resultado | Lectura práctica |
|---|---:|---|
| Título de actividad | 2/2 (100%) | Solo en dos capturas iniciales donde el título aparece; no identifica el cierre. |
| Puntuación, todos los estados con marcador visible | 1/9 (11.1%) | Siete marcadores en curso y dos finales; la página completa perdió la mayoría de números pequeños. |
| Puntuación en cierre final | 1/2 (50%) | Leyó el 3; no leyó el 0 en la página completa. |
| Finalización | 12/13 (92.3%) | Un cierre con 0 puntos quedó sin lectura OCR. El feedback “Correcto” en una pregunta no se trató como fin. |
| Cuenta regresiva visible | 7/7 (100%) | Se conservó como temporizador restante, no como duración de resolución. |
| Máximo / porcentaje | N/A; 0 apariciones | Ninguna captura muestra esos datos. No se puede medir exactitud del máximo. |
| Duración de resolución | N/A | Ninguna captura muestra una duración inequívoca. |
| Clasificación de tres decisiones | 13/14 (92.9%) | Salida OCR de referencia: 14/14 **Indeterminadas**; una etiqueta esperada No acreditable no fue detectada. |
| Capturas indeterminadas | 14/14 originales únicas | El OCR no produjo una lectura base que concediera acreditación automática. |
| Falsos positivos de acreditación observados | 0 | No hubo ejemplos positivos perfectos; el riesgo de falso positivo no es estimable con esta muestra. |
| Falsos negativos sobre perfectas | N/A | No existe captura perfecta etiquetada en el dataset. |

La exactitud de clasificación puede resultar engañosa: no hubo ninguna predicción Acreditable. Su 92.9% se debe casi por completo a la clase Indeterminado. En este conjunto no equivale a 92.9% de detección de resultados correctos.

## Variantes y ajustes

| Comparación | Resultado observado |
|---|---|
| Variantes transformadas, lectura de puntuación | 4/12 (33.3%); son versiones de capturas ya contadas, no nuevas partidas. |
| Variantes transformadas, finalización | 10/14 (71.4%). |
| Idioma spa / eng / spa+eng | 3/9 puntuaciones correctas en cada configuración; 12/12 finales detectados en las cuatro imágenes de la ablación. No apareció una ventaja de exactitud del modo bilingüe; su media fue 219 ms frente a 176–178 ms en un idioma. |
| Puntuación 3, página completa | 3/3 repeticiones. |
| Puntuación 3, recorte de tarjeta | 3/3 en la variante recortada de la misma captura. |
| Puntuación 0, página completa | 0/3; el OCR devolvió texto vacío. |
| Puntuación 0, recorte de tarjeta | 3/3 en la variante recortada de la misma captura. |
| Segmentación automática / dispersa / bloque / línea, página completa | 3/6, 3/6, 0/6 y 0/6 lecturas de puntuación correctas. |
| Las mismas segmentaciones en recortes | 6/6, 6/6, 6/6 y 0/6; dos cierres × tres repeticiones por configuración. |

El recorte de tarjeta mejoró la lectura de los dos ejemplos de cierre en este ensayo pequeño. La interfaz ofrece la captura completa como opción inicial y un recorte específico para esta tarjeta; no detecta automáticamente el diseño ni se ha probado con otros temas o plantillas. Un recorte reescalado 2× llegó a confundir el cero con la letra `o`; la demo usa ahora el recorte a tamaño original. Estos resultados de recorte no elevan el número de ejemplos independientes.

## Reglas del parser

`src/parser.mjs` devuelve `provider`, `activityId`, `activityRecognized`, `score`, `maxScore`, `percentage`, `correct`, `incorrect`, `durationSeconds`, `timerReadingSeconds`, `finished`, `feedback`, `decision`, `reasons`, confianza y `authenticityVerified`.

- No transforma una puntuación aislada en porcentaje ni supone un máximo.
- Reconoce finalización por frases explícitas de fin. Feedback de una respuesta correcta no basta.
- Solo calcula porcentaje desde porcentaje explícito, fracción, o ambos conteos correctos/incorrectos.
- Separa una lectura `m:ss` de la duración; solo considera duración etiquetas explícitas como “tiempo empleado” o “duración”.
- “Acreditable” requiere finalización y evidencia explícita de 100% o puntuación igual a máximo, con confianza OCR conservadora; el máximo configurado no se inventa en este experimento.
- “No acreditable” requiere puntuación final inferior al máximo, porcentaje inferior a 100%, o 0 puntos en esta actividad no vacía.
- En otros casos se abstiene como “Indeterminado”. La confianza OCR global no está calibrada como probabilidad por campo.

Las siete comprobaciones de `npm test` son casos de parser con texto construido. No son evidencia de desempeño de Tesseract sobre nuevas capturas.

## Velocidad

En las 90 lecturas del ensayo local, con modelos ya en caché, el tiempo medio fue **165 ms**, mediana **181 ms**, percentil 95 **279 ms**, mínimo **24 ms** y máximo **367 ms**. Las cargas de trabajador medidas con caché fueron 95–154 ms según idioma. En la demo del navegador se observaron 300 ms para el cierre con 3 en imagen completa y 147 ms para leer el cierre con 0 usando recorte. Son tiempos de esta Mac y de estos archivos; no incluyen una primera descarga fría del modelo ni una medición de teléfono.

## Respuestas de viabilidad

1. **¿La pantalla permite comprobar 100%?** No para el cierre por tiempo observado: falta máximo, porcentaje y total de preguntas.
2. **¿Se puede conocer el máximo externamente sin leerlo de la imagen?** Solo si hay un máximo fijo y confiable para esa actividad y versión. La actividad observada usa tiempo y no expone un denominador fijo; un número 3 por sí solo no permite afirmarlo.
3. **¿Hace falta configurar el máximo por actividad?** Para cuestionarios finitos, probablemente sí. En esta modalidad, configurar un umbral no acredita por sí mismo que el resultado haya sido perfecto.
4. **¿Qué pasa si cambia plantilla o tema?** Puede cambiar posición, tamaño, texto y recorte. No se probó esa variación. Habría que calibrar regiones y expresiones por diseño, y mantener casos de regresión; ante cambio o baja confianza, pedir revisión.
5. **¿Qué proporción se clasificó correctamente?** 13/14 (92.9%) en tres clases sobre originales únicos, con 14/14 predicciones Indeterminadas. La lectura de puntuación final fue 1/2 en imagen completa; el recorte resolvió ambos ejemplos, tres veces cada uno.
6. **¿Cuántas indeterminadas?** 14/14 capturas originales únicas en el clasificador de referencia. La demo puede leer campos aunque el resultado final siga indeterminado por falta de máximo.
7. **¿Hubo falsos positivos?** Cero observados, pero no había ninguna captura perfecta de referencia. No es una estimación del riesgo de aceptar una perfecta falsa. Sí hubo una omisión de un cierre no acreditable en página completa.
8. **¿Qué tan rápido?** Aproximadamente 165 ms de OCR promedio con modelos en caché en Mac; la descarga fría no se midió. La pantalla de demo muestra su tiempo por lectura.
9. **¿Funcionaría en teléfonos?** No se probó en dispositivos reales. No se afirma rendimiento en iOS o Android.
10. **¿Qué tan difícil es integrar en OptiLab?** El parser y la llamada a Tesseract.js son módulos frontend reutilizables; no se modificó OptiLab. La integración requeriría configurar trabajador, modelos de idioma, regiones por plantilla, prueba en móvil y guardar solo el JSON/entrega. Lo más difícil no es enlazar la librería: es obtener evidencia de 100% suficiente y estable para cada actividad.

## Recomendación

Mantener OCR como **apoyo a revisión** para Wordwall. La demo confirma que hay lecturas locales útiles, pero la vista final de esta actividad no permite verificar el criterio de todos los aciertos. Mostrar `Indeterminado` y solicitar revisión o nueva evidencia es más correcto que acreditar desde un marcador aislado. Tampoco debe presentarse el OCR como autenticación o solución antifraude.

El flujo que sí se mostró en demo es: captura → OCR en navegador → texto y campos estructurados → razones y decisión conservadora. No se almacena la imagen; el JSON se descarga bajo acción del usuario. Para acreditar automáticamente haría falta una pantalla que exponga un denominador o porcentaje explícito y una muestra de resultados perfectos y no perfectos suficiente para medir falsos positivos.

## Archivos y referencias

- Demo e instrucciones: `index.html`, `README.md`.
- Dataset y etiquetas: `capturas/manifest.json`.
- Código y benchmark: `src/`.
- Resultados crudos: `resultados/ocr-baseline.json`, `resultados/ocr-ablation.json`, `resultados/ocr-baseline.csv`.
- Métricas consolidadas: `resultados/metrics.json`.
- Recurso de Wordwall: <https://wordwall.net/resource/22610275/m%C3%A9todo-de-m-grande>.
- Embed probado: <https://wordwall.net/es/embed/cc167dda64954e3dbb379706dd8348c8?themeId=66&templateId=35&fontStackId=0>.
- Tesseract.js (repositorio y documentación oficial): <https://github.com/naptha/tesseract.js>.
- Instalación local y ejecución sin depender de las rutas predeterminadas del CDN: <https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md>.
- Reutilización del trabajador y rendimiento: <https://github.com/naptha/tesseract.js/blob/master/docs/performance.md>.
