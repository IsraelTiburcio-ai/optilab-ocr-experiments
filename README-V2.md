# Experimento independiente: Wordwall OCR V2

La página [index-v2.html](./index-v2.html) prueba el flujo de captura → OCR local → resultado estructurado → regla académica. V1 permanece disponible en [index.html](./index.html); V2 no modifica OptiLab.

## Ejecutar la demo

Desde esta carpeta:

```sh
npm run serve:v2
```

Abre `http://127.0.0.1:4174/index-v2.html`. La demo usa Tesseract.js 7.0.0 y los modelos español/inglés locales del directorio. Las imágenes que se cargan se procesan en el navegador; no hay backend ni guardado de capturas.

## Ejecutar pruebas

```sh
npm test
npm run ocr:downloads:v2
```

El segundo comando lee por defecto `~/Downloads/Pruebas para ocr`, crea recortes temporales en `work/v2-crops/` para las pasadas OCR y los elimina al terminar. No altera ni copia los JPG originales. El directorio no está guardado en el manifiesto versionado. Se puede pasar otra ruta de entrada como argumento:

```sh
python3 src/prepare_download_crops.py "/ruta/a/Pruebas para ocr"
node src/benchmark-downloads-v2.mjs "/ruta/a/Pruebas para ocr"
```

Las capturas reales y sus etiquetas visuales se comparan en `resultados/descargas-wordwall-v2.json` y `resultados/metrics-wordwall-v2.json`. Las pruebas sintéticas del parser no se mezclan con esas métricas.

## Decisiones y límites

- `PUNTUACION_PERFECTA` exige que la identidad visual coincida, se detecte cierre y se vea una fracción válida completa o porcentaje contextual de 100 %.
- `ACTIVIDAD_COMPLETADA` exige identidad coincidente y una frase explícita de finalización satisfactoria; no exige puntuación.
- Un `6/5` es imposible y no se reescribe. Solo se acepta otra fracción tras dos lecturas OCR coincidentes y se mantiene una advertencia de discrepancia.
- `GAME COMPLETE` y `JUEGO COMPLETADO` indican cierre. `Correcto` por sí solo no.
- La duración se extrae de un campo `Time`, `Tiempo` o `Hora` solo si ya se reconoce un cierre. Un contador restante se mantiene en un campo distinto.
- Porcentajes aislados (por ejemplo, batería) se ignoran. Una fracción validada o una etiqueta de puntuación proporciona contexto.
- Los recortes usan proporciones de la imagen, no coordenadas fijas. Las cinco pasadas posibles son completa automática, completa dispersa, central automática, central dispersa y ampliada dispersa.
- Lecturas concordantes de Tesseract no son evidencia independiente ni prueba de autenticidad. `evidence_authenticated` es siempre `false`.
- No se ejecuta OCR de LearningApps. Si el experimento paralelo confirma `AppSolved` y la profesora acepta el evento como evidencia de finalización, se debe usar esa integración por eventos y dejar explícito que no necesariamente acredita puntuación perfecta ni autenticidad antifraude.

Consulta [INFORME-V2.md](./INFORME-V2.md) para los resultados del conjunto de siete imágenes y la comparación V1/V2.
