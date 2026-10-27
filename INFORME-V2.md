# Informe breve — experimento Wordwall OCR V2

**Fecha:** 26 de octubre de 2026  
**Objetivo:** medir cuánto mejora la lectura determinista de Wordwall al reconocer cierres, validar puntuaciones, rescatar tiempos y evitar porcentajes ajenos, manteniendo la atribución a la actividad conservadora.  
**Alcance:** solo Wordwall. No se cambió OptiLab, no se usó OCR para LearningApps, no hubo backend, API de pago ni servicio externo de OCR.

## Método

Se procesaron de nuevo los siete JPG Wordwall originales de `~/Downloads/Pruebas para ocr/`, sin cambiar ni copiar los archivos fuente. Se guardaron hashes SHA-256, pasadas OCR y salidas parseadas en `resultados/descargas-wordwall-v2.json`; las métricas están en `resultados/metrics-wordwall-v2.json`. Las etiquetas de referencia proceden de inspección visual manual independiente. Los 14 recortes proporcionales usados por el benchmark se eliminaron después del OCR.

V1 y V2 usaron Tesseract.js 7.0.0, los mismos modelos locales español e inglés, el mismo equipo y las mismas capturas. V1 es una lectura de página completa con PSM automático y el parser original. V2 ejecuta hasta cinco lecturas adaptativas: página completa automática y dispersa, recorte central automático y disperso, y recorte ampliado disperso. La V2 busca también una identidad visible; por eso repite regiones aunque ya haya extraído puntos y cierre cuando el recurso configurado sigue sin identificarse.

## Comparación agregada

| Medida | V1 | V2 |
|---|---:|---:|
| Cierres positivos detectados | 0/6 | 6/6 |
| Clasificación final/activa exacta | 1/7 | 7/7 |
| Puntuación y máximo exactos en capturas con puntos | 2/4 | 4/4 |
| Campos de puntuación exactos incluyendo capturas sin puntos | 5/7 | 7/7 |
| Tiempos exactos incluyendo “no visible” | 1/7 | 7/7 |
| Decisión académica correcta según identidad visible | 6/7 | 7/7 |
| Decisiones indeterminadas | 7/7 | 6/7 |
| Falsos positivos de acreditación observados | 0 | 0 |
| Latencia OCR media por captura | 376 ms | 1,614 ms |

V1 distinguió el estado activo de la pantalla de otra actividad, pero no la identificó como una actividad distinta; por eso su decisión fue indeterminada y no coincide con la etiqueta `NO_ACREDITABLE` para el recurso configurado. V2 identificó «Características del M.P.L.» y la clasificó como `NO_ACREDITABLE`. Las otras seis capturas no muestran de forma visible el título o ID 22610275 y se mantienen `INDETERMINADO`, aunque cinco muestren puntuación y todas las seis muestren cierre. V2 no acreditó automáticamente ninguna captura.

La latencia de V2 incluye varias lecturas: mediana 1,039 ms y máximo 4,862 ms; la carga del trabajador fue de 138 ms y se informa separada. El conjunto pequeño no representa rendimiento general y las pasadas comparten motor, modelo e imagen; su acuerdo ayuda a reparar lecturas OCR, pero no es evidencia estadística independiente.

## Resultado por captura

| Archivo | Referencia visual | V1 | V2 |
|---|---|---|---|
| `502520625` | Cierre, 14/14, 1:07 | No detectó el cierre; 14/14; sin tiempo | Detectó cierre; 14/14; 67 s; indeterminado por identidad desconocida |
| `502659386` | Cierre, 6/6, 1:26 | No detectó cierre; leyó el imposible 6/5 | Detectó cierre; una lectura dio 6/5 y dos relecturas dieron 6/6; conserva advertencia; 86 s; identidad desconocida |
| `502894640` | Cierre, `Time 2:07`, sin puntuación | No detectó cierre ni duración | Cierre, 127 s, puntuación ausente; no inventa 100 % |
| `648486875` | Cierre, `Hora 1:10`, sin puntuación | No extrajo cierre ni duración | Cierre, 70 s, puntuación ausente |
| `668735316` | Partida activa de «Características del M.P.L.» | Indeterminado | Reconoció actividad diferente; `NO_ACREDITABLE` para el recurso 22610275 |
| `669057693` | Cierre, 5/5, 12.3 s | No detectó cierre; unió 5/5 como 55 | Cierre, 5/5, 12.3 s; identidad desconocida |
| `678843972` | Cierre, 6/6, 43.5 s; batería 61 % | No detectó cierre; leyó además el 61 % del teléfono | Cierre, 6/6, 43.5 s; ignora el 61 % aislado y lo conserva como advertencia |

## Pruebas sintéticas del parser

`npm test` incluye casos separados de las métricas de capturas: final 8/10, partida activa con 5/5, batería 61 %, feedback «¡Correcto!» sin cierre, lectura imposible 6/5, 6/5 con una o con dos relecturas 6/6 concordantes, `GAME COMPLETE` sin puntuación, actividad distinta, política `ACTIVIDAD_COMPLETADA`, tiempos `m:ss` y decimales, y porcentajes con o sin contexto. **14 pruebas pasan.**

## Recomendación

V2 mejora la extracción de cierres, fracciones y duración en este lote; evita las dos lecturas puntuables incorrectas de V1 y no concede puntos a capturas cuya actividad no se identifica. Aun así, **no integrar OCR como acreditación automática todavía**: el criterio de puntuación perfecta requiere coincidencia visual de actividad y ninguna tarjeta final de este conjunto identifica el recurso configurado. Conviene mantener OCR como evidencia para revisión docente hasta contar con capturas representativas que vinculen el recurso y el resultado de forma visible.

Mantener `PUNTUACION_PERFECTA` separado de `ACTIVIDAD_COMPLETADA`. En esta demo el segundo criterio solo acredita cuando la identidad coincide y hay señal explícita de terminación satisfactoria. Ninguna regla del OCR confirma identidad del alumno, origen o integridad de una imagen; `evidence_authenticated` permanece `false`. Para LearningApps, usar el evento `AppSolved` solo si la investigación paralela confirma experimentalmente que detecta la finalización de «Fórmulas para el Simplex» y la profesora acepta sus límites: evento de finalización no significa puntuación perfecta ni evidencia antifraude. No se desarrolló OCR para LearningApps.

## Archivos

- Demo: `index-v2.html` (servida en `http://127.0.0.1:4174/index-v2.html`).
- Pruebas sintéticas: `src/parser-v2.test.mjs`.
- Resultados por imagen y hashes: `resultados/descargas-wordwall-v2.json`.
- Métricas V1/V2: `resultados/metrics-wordwall-v2.json`.
