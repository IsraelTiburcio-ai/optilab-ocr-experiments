"""Create clearly marked synthetic image fixtures for Wordwall cross-activity tests."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "capturas/sinteticas-v3"
OUT.mkdir(parents=True, exist_ok=True)
regular = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 42)
bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 54)
small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 24)

def make_card(filename, lines, battery=None, crop=False):
    size = (550, 210) if crop else (1200, 800)
    image = Image.new("RGB", size, "#f5f4fb")
    draw = ImageDraw.Draw(image)
    if crop:
        draw.rounded_rectangle((15, 15, 535, 195), radius=16, fill="white", outline="#7666df", width=4)
        draw.text((45, 72), lines[0], font=bold, fill="#1e2140")
        return image.save(OUT / filename)
    draw.rounded_rectangle((180, 90, 1020, 710), radius=28, fill="white", outline="#7666df", width=5)
    draw.rounded_rectangle((180, 90, 1020, 170), radius=26, fill="#edebff")
    draw.text((212, 115), "FIXTURE SINTÉTICO · NO ES CAPTURA REAL", font=small, fill="#5549b5")
    y = 230
    for index, line in enumerate(lines):
        font = bold if index == 0 else regular
        draw.text((250, y), line, font=font, fill="#20243e")
        y += 108
    if battery is not None:
        draw.rounded_rectangle((30, 25, 210, 80), radius=12, fill="#252a3d")
        draw.text((55, 36), f"{battery}%", font=regular, fill="white")
    image.save(OUT / filename)

make_card("synthetic-visible-other-title.png", ["JUEGO COMPLETADO", "Actividad B", "Puntuación 6/6", "Hora 1:26"])
make_card("synthetic-generic-target.png", ["JUEGO COMPLETADO", "Puntuación 6/6", "Hora 1:26"])
make_card("synthetic-cropped-only-fraction.png", ["6/6"], crop=True)
make_card("synthetic-other-perfect-4of4.png", ["GAME COMPLETE", "Score 4/4", "Time 0:52"])
make_card("synthetic-other-nonperfect-8of10.png", ["JUEGO COMPLETADO", "Puntuación 8/10", "Hora 0:52"])
make_card("synthetic-no-final-result.png", ["Actividad B", "Selecciona el juego", "Iniciar"])
make_card("synthetic-battery-cross-activity.png", ["JUEGO COMPLETADO", "Score 6/6", "Time 1:26"], battery=61)

# Byte-identical second copy deliberately represents a different source activity.
shutil.copyfile(OUT / "synthetic-generic-target.png", OUT / "synthetic-generic-cross-game-duplicate.png")
manifest = {
    "datasetType": "SINTÉTICO — fixtures generados para evaluar límites de atribución; no son capturas de partidas reales",
    "fixtures": [
        {"filename": "synthetic-visible-other-title.png", "truth": "other", "case": "título visible de otra actividad", "duplicateOf": None},
        {"filename": "synthetic-generic-target.png", "truth": "target", "case": "resultado final genérico sin título, actividad objetivo simulada", "duplicateOf": None},
        {"filename": "synthetic-generic-cross-game-duplicate.png", "truth": "other", "case": "misma imagen exacta, pero se declara actividad fuente distinta", "duplicateOf": "synthetic-generic-target.png"},
        {"filename": "synthetic-cropped-only-fraction.png", "truth": "unknown", "case": "recorte 6/6 sin cierre ni nombre", "duplicateOf": None},
        {"filename": "synthetic-other-perfect-4of4.png", "truth": "other", "case": "otra plantilla/puntuación perfecta 4/4 sin título", "duplicateOf": None},
        {"filename": "synthetic-other-nonperfect-8of10.png", "truth": "other", "case": "otra actividad sin título con resultado final no perfecto 8/10", "duplicateOf": None},
        {"filename": "synthetic-no-final-result.png", "truth": "unknown", "case": "sin resultado final", "duplicateOf": None},
        {"filename": "synthetic-battery-cross-activity.png", "truth": "other", "case": "otra actividad genérica, 6/6 y batería 61%", "duplicateOf": None}
    ]
}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Generadas {len(manifest['fixtures'])} imágenes de fixture sintético en {OUT}")
