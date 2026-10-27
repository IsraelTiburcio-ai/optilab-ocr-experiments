# Informe técnico — OptiLab OCR contextual V3

**Fecha:** 26 de octubre de 2026 · **Entorno:** experimento independiente en esta Mac · **Proveedor con OCR:** Wordwall.  
V3 conserva V1 y V2. No edita OptiLab, Firebase ni otros datos, no usa OCR externo ni modelos generativos, y no procesa LearningApps por OCR.

## Resumen

V3 lee las capturas reales con Tesseract.js, evalúa dos reglas sobre la misma lectura y separa cuatro preguntas: qué resultado se leyó, si el juego está identificado visualmente, si la calidad OCR alcanza para usar los campos y qué decisión permitiría la política.

En siete capturas reales, V3 mantuvo la extracción de V2: **6/6 cierres positivos**, **4/4 puntuaciones visibles**, **6/6 tiempos visibles**. El cierre/actividad activa quedó clasificado correctamente en **7/7**. La salida temprana redujo el tiempo medio local de **1,614 a 735 ms** y las pasadas OCR totales de **31 a 17**, sin bajar esas métricas en este lote.

La identidad visual es la limitación decisiva: **0/7** capturas prueban visualmente ser el recurso 22610275, **1/7** muestra otra actividad y **6/7** no comprueban identidad. Bajo `STRICT`, ninguna obtiene un 1 y las seis capturas sin nombre piden nueva evidencia. Bajo el modo contextual aprobado para esta simulación, cuatro capturas perfectas serían candidatas a 1, pero eso supone que la captura provino de la página/QR actual; no lo verifica. Los fixtures de cruce prueban que esa suposición puede producir tanto unos como ceros equivocados.

## Datos y método

Se volvieron a leer los mismos siete JPG Wordwall originales de `~/Downloads/Pruebas para ocr/`. Los originales se abrieron en solo lectura y los siete SHA-256 de V3 coinciden con V2. No se copiaron ni modificaron los JPG. Las etiquetas visuales independientes están en `capturas/descargas-wordwall-v2.json` y las lecturas completas en `resultados/v3-real-wordwall.json`.

V2 y V3 usaron Tesseract.js 7.0.0, modelos locales spa/eng y las mismas capturas. V2 usó hasta cinco pasadas por imagen porque también reintentaba cuando no veía el título, aunque las tarjetas finales fueran genéricas. V3 deja de buscar una identidad que no aparece en la tarjeta; reintenta cuando hay una fracción imposible o un campo necesario sin leer. En las siete imágenes, V3 ejecutó 17 pasadas frente a 31 en V2. Solo creó recortes temporales para el benchmark y los borró al terminar; la demo en navegador crea recortes en `canvas` y no los escribe.

El benchmark sintético también usa Tesseract real sobre ocho imágenes dibujadas y rotuladas **SINTÉTICO — NO ES CAPTURA REAL**. No mezcla estas pruebas con las métricas de las capturas. Se genera y reproduce con `npm run ocr:downloads:v3`.

## Métricas en capturas reales

| Métrica | V2 | V3 |
|---|---:|---:|
| Cierres positivos visibles | 6/6 | 6/6 |
| Clasificación final / activa exacta | 7/7 | 7/7 |
| Puntuación exacta entre las cuatro que muestran puntos | 4/4 | 4/4 |
| Campos de puntuación exactos contando imágenes sin puntuación | 7/7 | 7/7 |
| Tiempo exacto entre los seis visibles | 6/6 | 6/6 |
| Campos de tiempo exactos contando “no visible” | 7/7 | 7/7 |
| Identidad objetivo confirmada visualmente | 0/7 | 0/7 |
| Otra actividad contradicha por título visible | 1/7 | 1/7 |
| Identidad sin comprobar | 6/7 | 6/7 |
| Acreditaciones estrictas | 0/7 | 0/7 |
| Candidatos contextuales a 1, con aprobación simulada | — | 4/7 |

Los cuatro candidatos contextuales son `14/14`, `6/6`, `5/5` y `6/6`, todos finales y sin nombre visible. Son **candidatos bajo una regla de confianza**, no cuatro positivos validados del recurso objetivo. Las dos tarjetas sin puntuación requieren nueva evidencia para `PUNTUACION_PERFECTA`; la captura con título de otra actividad se rechaza como evidencia ajena, sin asignar 0.

### Salida por captura

| Captura | Lectura V3 | STRICT | CONTEXTUAL aprobado |
|---|---|---|---|
| `502520625` | GAME COMPLETE · 14/14 · 67 s | Requiere nueva evidencia | Candidata a 1; identidad no comprobada |
| `502659386` | Primera lectura 6/5; dos relecturas concordantes 6/6 · 86 s; advertencia retenida | Requiere nueva evidencia | Candidata a 1 con advertencia; identidad no comprobada |
| `502894640` | GAME COMPLETE · 127 s · sin puntuación | Requiere nueva evidencia | Requiere nueva evidencia para puntuación perfecta |
| `648486875` | JUEGO COMPLETADO · 70 s · sin puntuación | Requiere nueva evidencia | Requiere nueva evidencia para puntuación perfecta |
| `668735316` | Identificó «Características del M.P.L.»; pantalla activa | Evidencia de otra actividad | Evidencia de otra actividad; no se asigna 0 |
| `669057693` | JUEGO COMPLETADO · 5/5 · 12.3 s | Requiere nueva evidencia | Candidata a 1; identidad no comprobada |
| `678843972` | JUEGO COMPLETADO · 6/6 · 43.5 s; 61 % aislado ignorado | Requiere nueva evidencia | Candidata a 1; identidad no comprobada |

En `502659386`, una lectura inicial 6/5 nunca se aceptó como 120 %. V3 obtuvo dos fracciones OCR válidas 6/6 en pasadas distintas y mantuvo la advertencia del dato imposible original. El acuerdo de pasadas ayuda a resolver lectura OCR, pero no es evidencia estadística independiente ni prueba de autoría.

## Políticas y estados

El contrato de catálogo está en `capturas/catalog-v3.json`. Distingue ID interno, proveedor, ID del recurso, URL, gimnasio, regla, modo y aprobación contextual.

- `PUNTUACION_PERFECTA` necesita cierre y puntuación válida completa. Si no se ve puntuación, la respuesta es pedir nueva evidencia, no inventar 100 % ni registrar 0.
- `ACTIVIDAD_COMPLETADA` puede aceptar cierre satisfactorio sin puntuación solo si esa regla describe el objetivo académico configurado.
- `UMBRAL_CONFIGURADO` permanece deshabilitado hasta que la profesora defina un umbral y se compruebe el significado de los puntos.
- Un título distinto produce `EVIDENCIA_DE_OTRA_ACTIVIDAD` en ambos modos; no produce cero.
- Una falla de OCR o una discrepancia sin resolver lleva a nueva evidencia o revisión.

La salida normalizada separa `resultStatus`, `activityMatch`, `evidenceQuality`, `verificationMode`, `authenticityVerified` y una decisión de entrega. `simulatedAcademicGrade` solo vale 1 o 0 cuando la política seleccionada y la evidencia lo permiten; de lo contrario queda `null` / Pendiente. En cada resultado, `authenticityVerified` es `false`.

## Prueba adversarial de atribución

Los fixtures adversariales son sintéticos, no son partidas reales, y sus etiquetas de actividad fuente son metadatos del test:

| Caso sintético | STRICT | Contextual aprobado | Resultado de atribución |
|---|---|---|---|
| Otra actividad con título visible y 6/6 | Evidencia de otra actividad | Evidencia de otra actividad | Bloqueado en ambos modos |
| Genérico GAME COMPLETE + 6/6, sin título; declarado objetivo | Requiere nueva evidencia | Crédito 1 simulado | Contexto asumido |
| Imagen byte por byte igual a la anterior, fuente declarada otra actividad | Requiere nueva evidencia | Crédito 1 simulado | **Falso 1**; la imagen no contiene diferencia observable |
| Recorte que solo muestra 6/6 | Requiere nueva evidencia | Requiere nueva evidencia | Sin cierre |
| Otra plantilla con resultado perfecto 4/4, sin título | Requiere nueva evidencia | Crédito 1 simulado | **Falso 1** |
| Otra actividad sin título, final 8/10 | Requiere nueva evidencia | No cumple, 0 simulado | **Falso 0** por atribución contextual |
| Sin resultado final y con otro título visible | Evidencia de otra actividad | Evidencia de otra actividad | Bloqueado en ambos modos |
| Otra actividad genérica, 6/6 y batería 61 % | Requiere nueva evidencia | Crédito 1 simulado | 61 % ignorado; **Falso 1** por identidad ausente |

Entre los **5** fixtures etiquetados de otra actividad, el título visible bloqueó uno. Los otros cuatro no mostraban el título fuente: el modo contextual les asignó tres unos y un cero. Así, el modo contextual **atribuyó indebidamente 4/5 cruces sintéticos**; el modo estricto no acreditó ninguno. Esta proporción describe los fixtures adversariales diseñados, **no** una tasa real de Wordwall.

Los dos archivos genéricos 6/6 son byte-identical y Tesseract produjo la misma lectura. El generador y el benchmark usan SHA-256 solo para verificar este fixture sintético. La demo de entregas no calcula ni persiste hashes de imágenes. Un OCR no puede deducir una actividad que no dejó ninguna señal visual; conservar un hash tampoco resolvería esa limitación.

## Rendimiento

| Medida OCR local | V2 | V3 |
|---|---:|---:|
| Promedio por captura | 1,614 ms | 735 ms |
| Mediana | 1,039 ms | 636 ms |
| P95 (rango más cercano, n=7) | 4,862 ms | 1,558 ms |
| Pasadas totales | 31 | 17 |
| Carga inicial del trabajador, separada | 138 ms | 141 ms |

La mediana bajó 39 % y el promedio cerca de 55 % en esta muestra. El P95 con siete casos coincide con el máximo y es inestable; no es una garantía de rendimiento. La captura `678843972` que tomó 4,862 ms en V2 baja a una pasada V3. La `502659386` sigue necesitando cinco pasadas por la lectura imposible y la corroboración. En una prueba manual del navegador, la captura `502520625` se leyó en 307 ms después de cargar el trabajador en 128 ms; es una observación de una sola captura, no otro benchmark.

No se probó WebKit ni un iPhone real. Los números comparativos son de esta Mac con ejecución local de Tesseract.js; no deben extrapolarse a móviles.

## Demo, CSV y privacidad

La demo abre en `http://127.0.0.1:4175/index-v3.html` con `npm run serve:v3`. La vista alumno no incluye controles docentes. En la vista de administración se simulan catálogo, filas 1/0/Pendiente, revisión de excepciones y exportación CSV/JSON. El CSV de la prueba se descargó con UTF-8 BOM y separador `;`; sus filas son ficticias. El modo pendiente nunca se transforma en cero por falta de entrega o de puntuación.

El calculador usa un escenario editable, no una tasa observada: 30 alumnos × 3 actividades = 90 evidencias; 2 min de revisión manual = 3 h; con el supuesto editable de 50 % resuelto automáticamente y 1 min por excepción, quedarían 45 min de revisión y 2 h 15 min de ahorro (75 %). No es una estimación de rendimiento real ni incluye apelaciones o implantación.

Las imágenes se procesan en navegador; no se usan Firebase, localStorage, IndexedDB, caché, servidor de OCR ni almacenamiento de capturas. Como no se guardan imágenes, una reclamación exige solicitar nueva evidencia o utilizar otro procedimiento expresamente autorizado; no se puede reanalizar una imagen descartada. Para un backend futuro, bastaría conservar identidad autenticada, actividad, grupo, puntuación estructurada, duración, estado académico, regla, origen de medición, fecha y advertencias necesarias. No recomendamos guardar hashes de imagen: detectar copias byte-identical no demuestra autenticidad ni evita modificar una imagen.

## Recomendación

Mantener V3 como experimento y no integrar acreditación contextual automática en OptiLab todavía. La salida temprana mantiene la extracción y reduce trabajo de OCR, pero el experimento muestra que un modo contextual aprobado puede asignar tanto unos como ceros a la actividad equivocada si el título no está en la captura. Si se evalúa en una prueba docente, los resultados con identidad `NO_COMPROBADA` deben mostrarse como atribución asumida; una política más conservadora sería no asignar nota definitiva automática hasta que exista un enlace explícito entre recurso y resultado.

Para Wordwall, el contexto permite estudiar un proceso de entrega de menor fricción, pero no sustituye identidad visual ni antifraude. Para LearningApps, usar la integración por eventos verificada por separado: `AppSolved` / `AppCompleted` señalan finalización y no demuestran por sí mismos puntuación perfecta, identidad o autenticidad. No se añadió OCR a LearningApps.
