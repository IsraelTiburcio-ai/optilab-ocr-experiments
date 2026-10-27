"""Create ephemeral proportional crops for synthetic attribution fixtures."""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "capturas/sinteticas-v3/manifest.json"
manifest = json.loads(manifest_path.read_text())
out = ROOT / "work/v3-synthetic-crops"
out.mkdir(parents=True, exist_ok=True)
for fixture in manifest["fixtures"]:
    source = ROOT / "capturas/sinteticas-v3" / fixture["filename"]
    with Image.open(source) as image:
        width, height = image.size
        for name, (rx, ry, rw, rh) in {"center": (.30,.22,.40,.56), "wide": (.15,.10,.70,.80)}.items():
            x, y = round(width * rx), round(height * ry)
            box = (x, y, min(width, x + round(width * rw)), min(height, y + round(height * rh)))
            image.crop(box).save(out / f"{source.stem}-{name}.png")
print(f"Recortes sintéticos temporales listos: {out}")
