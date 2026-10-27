"""Generate watermarked OCR fixtures; none are captures of real students."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'capturas/sinteticas-v31'
OUT.mkdir(parents=True, exist_ok=True)
FONT_PATHS = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial.ttf',
]
font_path = next((p for p in FONT_PATHS if Path(p).exists()), None)
if not font_path:
    raise RuntimeError('No se encontró una fuente sans serif del sistema para los fixtures.')

FIXTURES = [
    ('synthetic-puzzle-final.png', ['¡Felicidades!', 'Tiempo [mm:ss]: 3:26', 'Número de piezas: 28'], 'Puzle sintético final; esperado PUZZLE_COMPLETE, 206 s, 28 piezas, sin score.', {'templateType': 'PUZZLE_COMPLETE', 'finalization': True, 'score': None, 'maxScore': None, 'durationSeconds': 206, 'pieceCount': 28}),
    ('synthetic-puzzle-mid-feedback.png', ['¡Felicidades!', 'Nivel 2 de 5', 'Continuar'], 'Felicitación intermedia sintética; no hay resumen ni cierre inequívoco.', {'templateType': 'UNKNOWN_LAYOUT', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-feedback-muy-bien.png', ['¡Muy bien!', 'Pregunta 3 de 5', 'Siguiente pregunta'], 'Retroalimentación intermedia sintética; no finaliza.', {'templateType': 'FEEDBACK_ONLY', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-feedback-correcto.png', ['Correcto', 'Siguiente pregunta'], 'Feedback sintético; no finaliza.', {'templateType': 'FEEDBACK_ONLY', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-progress-5of5.png', ['Progreso de actividad', 'Pregunta 5 de 5', '5/5'], 'Progreso completo aparente sintético sin pantalla final.', {'templateType': 'PROGRESS_ONLY', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-has-terminado.png', ['Has terminado', 'Volver a empezar'], 'Cierre genérico sintético con acción terminal; solo finalización.', {'templateType': 'COMPLETION_ONLY', 'finalization': True, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-wordwall-perfect.png', ['GAME COMPLETE', 'Score 14/14', 'Time 1:07'], 'Resultado sintético final perfecto; perfil SCORE_FINAL.', {'templateType': 'SCORE_FINAL', 'finalization': True, 'score': 14, 'maxScore': 14, 'durationSeconds': 67, 'pieceCount': None}),
    ('synthetic-wordwall-nonperfect.png', ['JUEGO COMPLETADO', 'Puntuación 4/5', 'Hora 0:34'], 'Resultado sintético final no perfecto; resultado técnico insuficiente, sin calificación académica.', {'templateType': 'SCORE_FINAL', 'finalization': True, 'score': 4, 'maxScore': 5, 'durationSeconds': 34, 'pieceCount': None}),
    ('synthetic-wordwall-battery.png', ['GAME COMPLETE', 'Score 6/6', 'Time 0:45', 'Battery 61%'], 'Resultado sintético final perfecto con batería; el porcentaje de batería no sustituye score.', {'templateType': 'SCORE_FINAL', 'finalization': True, 'score': 6, 'maxScore': 6, 'durationSeconds': 45, 'pieceCount': None}),
    ('synthetic-puzzle-pieces-only.png', ['Número de piezas: 28', 'Continuar armando'], 'Metadato de piezas en fase no final; no es score ni cierre.', {'templateType': 'UNKNOWN_LAYOUT', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': 28}),
    ('synthetic-unknown-layout.png', ['Panel de actividad', 'Abrir'], 'Formato sin señales de puntuación o finalización.', {'templateType': 'UNKNOWN_LAYOUT', 'finalization': None, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
    ('synthetic-other-game-running.png', ['JUEGO B · Pregunta 2 de 3', 'Progreso 1/3'], 'Partida activa de otro juego sintético; el título visible no pertenece a la actividad objetivo.', {'templateType': 'PROGRESS_ONLY', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}),
]

manifest = {
    'datasetType': 'SINTÉTICO — imágenes generadas por Pillow, rotuladas; no son partidas reales ni capturas de estudiantes.',
    'watermark': 'SINTÉTICO · NO ES CAPTURA REAL',
    'fixtures': [],
}
for filename, lines, purpose, truth in FIXTURES:
    image = Image.new('RGB', (1200, 620), '#f4f5f7')
    draw = ImageDraw.Draw(image)
    watermark_font = ImageFont.truetype(font_path, 28)
    title_font = ImageFont.truetype(font_path, 56)
    body_font = ImageFont.truetype(font_path, 46)
    draw.rectangle((0, 0, 1200, 72), fill='#ffe3e3')
    draw.text((36, 18), 'SINTÉTICO · NO ES CAPTURA REAL', fill='#9b1c1c', font=watermark_font)
    y = 145
    for index, line in enumerate(lines):
        draw.text((60, y), line, fill='#111827', font=title_font if index == 0 else body_font)
        y += 108
    draw.rectangle((28, 98, 1172, 592), outline='#1f2937', width=3)
    image.save(OUT / filename, format='PNG', optimize=True)
    manifest['fixtures'].append({'filename': filename, 'purpose': purpose, 'truthSource': 'predefined synthetic scenario', 'isRealCapture': False, 'expected': truth})

# Partial crop: the final-title region has been cut out, leaving a bare score
# fraction and time. A synthetic label stays visible to avoid confusing this
# fixture with a learner screenshot.
filename = 'synthetic-partial-crop-score.png'
image = Image.new('RGB', (1200, 420), '#f4f5f7')
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 1200, 56), fill='#ffe3e3')
draw.text((28, 11), 'SINTÉTICO · RECORTE PARCIAL', fill='#9b1c1c', font=ImageFont.truetype(font_path, 27))
draw.rectangle((30, 72, 1170, 395), outline='#1f2937', width=3)
draw.text((60, 110), 'Score 6/6', fill='#111827', font=ImageFont.truetype(font_path, 56))
draw.text((60, 218), 'Time 0:45', fill='#111827', font=ImageFont.truetype(font_path, 48))
image.save(OUT / filename, format='PNG', optimize=True)
manifest['fixtures'].append({'filename': filename, 'purpose': 'Captura parcial: no conserva una señal de finalización; score aislado no acredita cierre.', 'truthSource': 'predefined synthetic scenario', 'isRealCapture': False, 'expected': {'templateType': 'PROGRESS_ONLY', 'finalization': False, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}})

# Deliberately unreadable synthetic image with only a synthetic watermark.
filename = 'synthetic-illegible.png'
image = Image.effect_noise((1200, 620), 100).convert('RGB')
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 1200, 64), fill='#ffe3e3')
draw.text((28, 15), 'SINTÉTICO · IMAGEN ILEGIBLE', fill='#9b1c1c', font=ImageFont.truetype(font_path, 28))
image.save(OUT / filename, format='PNG', optimize=True)
manifest['fixtures'].append({'filename': filename, 'purpose': 'Imagen sintética con ruido no interpretable; el sistema debe conservar UNKNOWN_LAYOUT.', 'truthSource': 'predefined synthetic scenario', 'isRealCapture': False, 'expected': {'templateType': 'UNKNOWN_LAYOUT', 'finalization': None, 'score': None, 'maxScore': None, 'durationSeconds': None, 'pieceCount': None}})

# A synthetic source-resolution stress case. Only the browser demo's resized
# derivative is measured; this does not count as an independent accuracy case.
filename = 'synthetic-high-resolution-stress.png'
image = Image.new('RGB', (6000, 4000), '#f4f5f7')
draw = ImageDraw.Draw(image)
watermark_font = ImageFont.truetype(font_path, 120)
title_font = ImageFont.truetype(font_path, 260)
body_font = ImageFont.truetype(font_path, 190)
draw.rectangle((0, 0, 6000, 250), fill='#ffe3e3')
draw.text((180, 60), 'SINTÉTICO · NO ES CAPTURA REAL · PRUEBA DE MEMORIA', fill='#9b1c1c', font=watermark_font)
draw.text((180, 700), 'GAME COMPLETE', fill='#111827', font=title_font)
draw.text((180, 1250), 'Score 6/6', fill='#111827', font=body_font)
draw.text((180, 1650), 'Time 0:45', fill='#111827', font=body_font)
image.save(OUT / filename, format='PNG', optimize=True)
manifest['fixtures'].append({'filename': filename, 'purpose': 'Prueba sintética de escalado y recursos; no computa en accuracy.', 'truthSource': 'predefined synthetic scenario', 'isRealCapture': False, 'resourceStressOnly': True})
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'{len(manifest["fixtures"])} fixtures generados en {OUT}')
