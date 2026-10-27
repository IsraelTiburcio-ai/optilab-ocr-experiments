"""Create temporary proportional crops for the V3 baseline only."""
from pathlib import Path
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
inventory = json.loads((ROOT / 'capturas/inventario-v31.json').read_text())
out = ROOT / 'work/v31-baseline-crops'
out.mkdir(parents=True, exist_ok=True)
regions = {'center': (0.30, 0.22, 0.40, 0.56), 'wide': (0.15, 0.10, 0.70, 0.80)}
selected = [row for row in inventory['files'] if row['eligibility'] == 'NEW_HOLDOUT_OCR']
for row in selected:
    filename = row['filename']
    source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'Downloads' / 'Pruebas para ocr'
    with Image.open(source / filename) as image:
        width, height = image.size
        for name, (rx, ry, rw, rh) in regions.items():
            x, y = round(width * rx), round(height * ry)
            box = (x, y, min(width, x + round(width * rw)), min(height, y + round(height * rh)))
            image.crop(box).save(out / f'{Path(filename).stem}-{name}.png')
print(f'Temporary baseline crops: {len(selected) * len(regions)}; originals unchanged.')
