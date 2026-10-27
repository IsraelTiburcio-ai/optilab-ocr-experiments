#!/usr/bin/env python3
"""Create an auditable inventory without changing source screenshots."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import sys

ROOT = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'Downloads' / 'Pruebas para ocr'
OUT = Path(__file__).resolve().parents[1] / 'capturas' / 'inventario-v31.json'
OLD_LABELS = Path(__file__).resolve().parents[1] / 'capturas' / 'descargas-wordwall-v2.json'

# These references were assigned from visual inspection before the V3.1 OCR run.
NEW_LABELS = {
    '502451717_1776704529722762_3347568964989757863_n.jpg': {
        'provider': 'NO_DETERMINABLE', 'providerEvidence': 'No hay marca ni URL; solo se ve un diálogo de respuestas correctas.',
        'screenType': 'RETROALIMENTACION_O_RESULTADO_NO_DETERMINABLE', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Enhorabuena! Lograste dar con la(s) respuesta(s) correcta(s). · OK', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA_PROVEEDOR_NO_DETERMINABLE', 'eligibility': 'EXCLUDE_PROVIDER_AMBIGUOUS_POSSIBLE_LEARNINGAPPS',
        'eligibilityReason': 'El diálogo aislado no permite separar una felicitación intermedia de fin de actividad; se excluye por posible origen LearningApps.'},
    '502464710_1776704356389446_7827323037009430339_n.jpg': {
        'provider': 'NO_DETERMINABLE', 'providerEvidence': 'Escena de juego recortada, sin logotipo ni URL.',
        'screenType': 'CONTADOR_O_PROGRESO_AMBIGUO', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '5/5 sobre un letrero en una escena de juego; no aparece una tarjeta de resultados ni una señal final inequívoca.', 'finalizationReference': 'NO_CONFIRMADA',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'NEW_HOLDOUT_OCR',
        'eligibilityReason': 'Se conserva como prueba negativa de un contador 5/5 sin contexto suficiente para llamarlo puntuación o progreso.'},
    '502598462_1776704569722758_6435364164750454503_n.jpg': {
        'provider': 'NO_DETERMINABLE', 'providerEvidence': 'No hay marca ni URL; fondo verde pálido y diálogo centrado.',
        'screenType': 'RETROALIMENTACION_O_RESULTADO_NO_DETERMINABLE', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Muy bien! · botón OK; no se ve la actividad subyacente.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA_PROVEEDOR_NO_DETERMINABLE', 'eligibility': 'EXCLUDE_PROVIDER_AMBIGUOUS_POSSIBLE_LEARNINGAPPS',
        'eligibilityReason': 'El diálogo aislado no permite distinguir feedback de cierre y la procedencia puede ser LearningApps.'},
    '502905858_1776704386389443_3457655670125621835_n.jpg': {
        'provider': 'ROMPECABEZAS_EXTERNO_NO_IDENTIFICADO', 'providerEvidence': 'Tarjeta textual de piezas/tiempo; no se ve marca ni URL.',
        'screenType': 'RESULTADO_DE_ROMPECABEZAS', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_APLICA', 'durationSeconds': 206, 'pieceCount': 28,
        'visibleText': '¡Felicidades! · Tiempo [mm:ss]: 3:26 · Número de piezas: 28 · controles de compartir/menú visibles.', 'finalizationReference': 'CONFIRMADA_POR_RESUMEN_Y_FELICITACION',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'NEW_HOLDOUT_OCR',
        'eligibilityReason': 'Caso real apto para perfil PUZZLE_COMPLETE; piezas son metadato, nunca puntuación.'},
    '641428789_3513221928830854_949754119378444759_n.jpg': {
        'provider': 'LearningApps', 'providerEvidence': 'URL learningapps.org visible en Safari.',
        'screenType': 'TABLERO_DE_CARRERA_O_PUNTAJE', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': 'Tablero de carrera; se ven contadores 10/10 y 5/10 asociados a jugadores, sin tarjeta de cierre inequívoca.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'EXCLUDE_LEARNINGAPPS_EVENTS',
        'eligibilityReason': 'LearningApps se acredita por la integración de eventos separada; no entra a benchmark OCR.'},
    '642892215_3515487508604296_9144621108481121291_n.jpg': {
        'provider': 'Genially', 'providerEvidence': 'Marca Powered by Genially visible en pantalla.',
        'screenType': 'PANTALLA_FINAL_FELICITACION', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_APLICA', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡ENHORABUENA! · icono de aprobación · Volver a empezar.', 'finalizationReference': 'CONFIRMADA_POR_TEXTO_Y_ACCION_REINICIAR',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'NEW_HOLDOUT_OCR',
        'eligibilityReason': 'Caso real para perfil COMPLETION_ONLY; el mensaje no contiene puntuación ni nombre de actividad.'},
    '653709479_3537396559746724_2807866198313383516_n.jpg': {
        'provider': 'ROMPECABEZAS_EXTERNO_NO_IDENTIFICADO', 'providerEvidence': 'Tarjeta textual y controles; no se ve marca ni URL.',
        'screenType': 'RESULTADO_DE_ROMPECABEZAS', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_APLICA', 'durationSeconds': 172, 'pieceCount': 24,
        'visibleText': '¡Felicidades! · Tiempo [mm:ss]: 2:52 · Número de piezas: 24 · botones de reiniciar/compartir.', 'finalizationReference': 'CONFIRMADA_POR_RESUMEN_Y_FELICITACION',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'NEW_HOLDOUT_OCR',
        'eligibilityReason': 'Caso real para perfil PUZZLE_COMPLETE; piezas son metadato, nunca puntuación.'},
    '663041501_3556281397858240_6910402071098458933_n.jpg': {
        'provider': 'NO_DETERMINABLE', 'providerEvidence': 'No se ve URL; diálogo y tablero coinciden visualmente con las capturas LearningApps del conjunto.',
        'screenType': 'RETROALIMENTACION_EN_TABLERO', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Enhorabuena! Lograste dar con las respuestas correctas. · OK sobre tablero aún visible.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA_PROVEEDOR_NO_DETERMINABLE', 'eligibility': 'EXCLUDE_PROVIDER_AMBIGUOUS_POSSIBLE_LEARNINGAPPS',
        'eligibilityReason': 'No se usa OCR porque el proveedor podría ser LearningApps y la felicitación puede ser intermedia.'},
    '666058245_3560255834127463_303239307331689541_n.jpg': {
        'provider': 'LearningApps', 'providerEvidence': 'URL learningapps.org visible en Safari.',
        'screenType': 'RETROALIMENTACION_EN_ACTIVIDAD', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Muy bien! · OK sobre actividad; controles y contenido de juego permanecen visibles.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'EXCLUDE_LEARNINGAPPS_EVENTS',
        'eligibilityReason': 'LearningApps se acredita por eventos; este diálogo visual no es una prueba de finalización.'},
    '672307755_3567591176727262_5928333384145472981_n.jpg': {
        'provider': 'LearningApps', 'providerEvidence': 'URL learningapps.org visible en Safari.',
        'screenType': 'RETROALIMENTACION_EN_ACTIVIDAD', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Enhorabuena! Lograste dar con la(s) respuesta(s) correcta(s). · OK sobre tablero y marcadores.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': None, 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'EXCLUDE_LEARNINGAPPS_EVENTS',
        'eligibilityReason': 'LearningApps se acredita por eventos; el modal de acierto no demuestra cierre de toda la actividad.'},
    '679268880_3574782672674779_1473279203101759685_n.jpg': {
        'provider': 'LearningApps', 'providerEvidence': 'URL learningapps.org visible en Safari.',
        'screenType': 'RETROALIMENTACION_EN_ACTIVIDAD', 'score': None, 'maxScore': None, 'scoreMeaning': 'NO_DETERMINABLE', 'durationSeconds': None, 'pieceCount': None,
        'visibleText': '¡Muy bien! · OK sobre pestaña CPM y contenido de actividad.', 'finalizationReference': 'NO_DETERMINABLE',
        'identityVisible': 'CPM', 'labelStatus': 'VISUAL_REVISADA', 'eligibility': 'EXCLUDE_LEARNINGAPPS_EVENTS',
        'eligibilityReason': 'LearningApps se acredita por eventos; feedback parcial y actividad visible no son tarjeta final.'},
}
NEW_LABELS['642892215_3515487508604296_9144621108481121291_n (1).jpg'] = dict(
    NEW_LABELS['642892215_3515487508604296_9144621108481121291_n.jpg']
)

old = json.loads(OLD_LABELS.read_text())
old_by_name = {row['filename']: row for row in old['images']}
rows = []
seen_hashes = {}
# Prefer the filename without an added “(1)” suffix as the representative row.
for path in sorted(ROOT.iterdir(), key=lambda item: (' (1)' in item.name, item.name)):
    if not path.is_file():
        continue
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    with Image.open(path) as image:
        width, height, fmt = image.width, image.height, image.format
    filename = path.name
    if filename in old_by_name:
        source = old_by_name[filename]
        expected = source['expected']
        label = {
            'provider': 'Wordwall', 'providerEvidence': 'Recurso/plantilla Wordwall identificado visualmente en el benchmark V1–V3.',
            'screenType': 'RESULTADO_FINAL' if expected['finalization'] else 'PARTIDA_ACTIVA',
            'score': expected['score'], 'maxScore': expected['maxScore'],
            'scoreMeaning': 'PUNTUACION_FINAL' if expected['score'] is not None and expected['finalization'] else ('PROGRESO_EN_CURSO' if expected['score'] is not None else 'NO_VISIBLE'),
            'durationSeconds': expected['durationSeconds'], 'pieceCount': None,
            'visibleText': source['visualLabel'],
            'finalizationReference': 'CONFIRMADA' if expected['finalization'] else 'NO_CONFIRMADA',
            'identityVisible': 'Características del M.P.L.' if expected.get('activityMatch') is False else None,
            'labelStatus': 'ETIQUETA_VISUAL_INDEPENDIENTE_V1_V3',
            'eligibility': 'REGRESSION_WORDWALL',
            'eligibilityReason': 'Regresión; ya se utilizó en V1–V3, no cuenta como generalización nueva.',
        }
    else:
        label = NEW_LABELS[filename]
    duplicate_of = seen_hashes.get(sha)
    if duplicate_of:
        label = dict(label)
        label['eligibility'] = 'DUPLICATE_NOT_INDEPENDENT'
        label['eligibilityReason'] = f'Contenido byte a byte idéntico a {duplicate_of}; se conserva en inventario pero se excluye de los denominadores.'
    else:
        seen_hashes[sha] = filename
    rows.append({
        'filename': filename, 'format': fmt, 'dimensions': {'width': width, 'height': height},
        'bytes': len(data), 'sha256': sha, 'duplicateOf': duplicate_of,
        'datasetSplit': 'WORDWALL_V1_V3_REGRESSION' if filename in old_by_name else ('DUPLICATE' if duplicate_of else 'NEW_CAPTURE'),
        **label,
    })

assert len(rows) == 19, f'Expected 19 source files; got {len(rows)}'
OUT.write_text(json.dumps({
    'dataset': 'Pruebas para ocr', 'fileCount': len(rows),
    'uniqueImageCount': len(seen_hashes), 'visualLabelsCreatedBeforeV31OCR': True,
    'originalsModifiedOrMoved': False, 'learningAppsIncludedInOcrBenchmark': False,
    'notes': [
        'Etiquetas asignadas mediante inspección visual independiente; no se usó OCR para crear la referencia.',
        'Proveedor no determinable significa que la captura no muestra una marca/URL concluyente; capturas con posible origen LearningApps se excluyen conservadoramente.',
        'Los SHA-256 solo detectan duplicados del archivo; no verifican autenticidad.',
    ], 'files': rows,
}, ensure_ascii=False, indent=2) + '\n')
print(f'Inventario: {OUT} ({len(rows)} archivos, {len(seen_hashes)} imágenes únicas)')
