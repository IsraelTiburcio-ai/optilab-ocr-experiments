"""Prepare one temporary wide crop per V3.1 benchmark image."""
from pathlib import Path
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'Downloads' / 'Pruebas para ocr'
inventory = json.loads((ROOT / 'capturas/inventario-v31.json').read_text())
synthetics = json.loads((ROOT / 'capturas/sinteticas-v31/manifest.json').read_text())
out = ROOT / 'work/v31-benchmark-crops'
out.mkdir(parents=True, exist_ok=True)
paths = [SOURCE / row['filename'] for row in inventory['files'] if row['eligibility'] in {'REGRESSION_WORDWALL', 'NEW_HOLDOUT_OCR'}]
paths += [ROOT / 'capturas/sinteticas-v31' / row['filename'] for row in synthetics['fixtures'] if not row.get('resourceStressOnly')]
for path in paths:
    with Image.open(path) as image:
        width, height = image.size
        longest = max(width, height)
        scale = min(1, 2400 / longest) if longest > 2400 else min(3, 900 / longest) if longest < 900 else 1
        processed = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS) if scale != 1 else image.copy()
        if scale != 1:
            processed.save(out / f'{path.stem}-processed.png')
        width, height = processed.size
        x, y = round(width * 0.03), round(height * 0.05)
        crop_w, crop_h = round(width * 0.94), round(height * 0.90)
        processed.crop((x, y, min(width, x + crop_w), min(height, y + crop_h))).save(out / f'{path.stem}-wide.png')
        x, y = round(width * 0.30), round(height * 0.22)
        crop_w, crop_h = round(width * 0.40), round(height * 0.56)
        processed.crop((x, y, min(width, x + crop_w), min(height, y + crop_h))).save(out / f'{path.stem}-center.png')
print(f'Wide crops temporales: {len(paths)}; imágenes fuente intactas.')
