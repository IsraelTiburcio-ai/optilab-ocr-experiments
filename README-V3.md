# OptiLab · Experimento OCR V3

V3 es una simulación local e independiente del flujo actividad Wordwall → captura → OCR → regla académica → registro demo. **No modifica OptiLab ni sus datos.** La pantalla de alumno y la vista administrativa de prueba están separadas: el catálogo se configura antes; no requiere que una profesora inicie una sesión durante clase.

## Abrir en el navegador

Desde esta carpeta:

```sh
npm run serve:v3
```

Abre `http://127.0.0.1:4175/index-v3.html`. Si el puerto 4175 ya está ocupado, usa uno libre, por ejemplo `python3 -m http.server 4176 --bind 127.0.0.1`, y visita `http://127.0.0.1:4176/index-v3.html`.

Tesseract.js 7.0.0 y los modelos spa/eng incluidos se cargan desde esta carpeta. El OCR se ejecuta en el navegador. Las imágenes y recortes canvas quedan en memoria temporal, no se copian al experimento y no se envían a servidores. Al descartar la imagen se revoca su URL de objeto. Los registros simulados permanecen en memoria hasta recargar; no se usa localStorage, IndexedDB, caché ni base de datos.

## Catálogo y políticas

El ejemplo de catálogo está en `capturas/catalog-v3.json`:

- `PUNTUACION_PERFECTA`: finalización y puntuación igual al máximo mediante fracción válida o porcentaje académico contextual.
- `ACTIVIDAD_COMPLETADA`: cierre satisfactorio explícito, cuando esa regla describe el objetivo académico.
- `UMBRAL_CONFIGURADO`: deshabilitada hasta que exista un umbral y significado de puntuación aprobados; V3 no inventa un porcentaje.

El modo **STRICT** requiere identidad visual confirmada. **CONTEXTUAL** solo puede simularse cuando `allowContextualEvidence` esté aprobado en la ficha de catálogo. V3 muestra ambos resultados a la vez y marca `activityMatch: NO_COMPROBADA` cuando la tarjeta no identifica el juego. Contexto es una regla de confianza operativa: no prueba origen, no prueba quién jugó y no detecta todas las capturas cruzadas.

El perfil por defecto lleva una aprobación contextual **simulada para esta demo**, no una autorización de la profesora ni de la institución. En un sistema real se debe exigir aprobación formal previa a la incorporación de la actividad.

## Ejecutar pruebas y benchmark

```sh
npm test
npm run ocr:downloads:v3
```

`npm test` ejecuta los tests existentes V1/V2 y el motor/adversariales V3. El benchmark reusa las siete imágenes originales Wordwall de `~/Downloads/Pruebas para ocr/` (ruta modificable pasando un argumento a `node src/benchmark-v3.mjs`). Lee archivos en solo lectura; compara SHA-256 con la línea base V2. Los recortes se generan temporalmente en `work/` y se borran al terminar.

El comando también genera fixtures PNG explícitamente sintéticos en `capturas/sinteticas-v3/`, los procesa con Tesseract.js real y mantiene sus métricas separadas de las siete capturas reales. Dos fixtures son idénticos byte por byte; el hash de estos fixtures solo valida el montaje adversarial. La aplicación de alumno no calcula ni almacena hashes de capturas.

Resultados reproducibles:

- Capturas reales: `resultados/v3-real-wordwall.json`.
- Casos sintéticos adversariales: `resultados/v3-adversarial-synthetic.json`.
- Comparación V2/V3 y tiempos: `resultados/metrics-v3.json`.
- Etiquetas visuales originales: `capturas/descargas-wordwall-v2.json`.
- Etiquetas de los fixtures: `capturas/sinteticas-v3/manifest.json`.

## Uso del prototipo

1. En “Vista alumno”, abre Wordwall o adjunta una captura local.
2. “Revisar evidencia” ejecuta lectura completa; reintenta solo ante números ambiguos, datos faltantes necesarios o una imagen sin señales legibles. No repite OCR para buscar un nombre ausente en una tarjeta genérica.
3. V3 extrae puntuación, máximo, tiempo, cierre y texto por pasada; compara STRICT y CONTEXTUAL sobre la misma evidencia.
4. Para registrar una fila ficticia, elige el modo en “Administración demo” y vuelve al resultado. Un mismatch de actividad solicita evidencia correcta; no asigna cero. Si falta puntuación, queda pendiente y no se convierte en cero.
5. CSV/JSON se descargan solo por acción explícita. El CSV usa UTF-8 con BOM y punto y coma para Excel en configuración regional española.
6. El simulador de ahorro muestra supuestos editables; no mide automatización real.

## Privacidad y reclamaciones

No se conserva una captura después de cerrar o descartar la vista, así que una reclamación posterior exige pedir una nueva carga o aplicar un procedimiento autorizado alternativo. No se promete revisión de una imagen ya descartada. Eliminar la imagen implica que no se puede rehacer el análisis de esa entrega.

Para una futura integración se propone guardar solo identificador de usuario autenticado, actividad, grupo, campos académicos, duración observada, estado, política aplicada, origen de medición, fecha de recepción y advertencias necesarias. V3 no persiste hashes de imágenes porque no los necesita: detectar bytes duplicados no demuestra autoría ni autenticidad.

No se ha probado WebKit ni iPhone real. La revisión manual se realizó en el navegador in-app de esta Mac. LearningApps queda con su integración por eventos independiente; `AppSolved` / `AppCompleted` son señales de finalización y no sustituyen una puntuación perfecta ni evidencian autenticidad. No se desarrolló OCR para LearningApps.
