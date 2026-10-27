"""Generate temporary proportional OCR crops from source captures without changing them."""
from pathlib import Path
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "capturas/descargas-wordwall-v2.json").read_text())
source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / "Downloads" / "Pruebas para ocr"
out = ROOT / "work/v2-crops"
out.mkdir(parents=True, exist_ok=True)
regions = {
    "center": (0.30, 0.22, 0.40, 0.56),
    "wide": (0.15, 0.10, 0.70, 0.80),
}
for item in manifest["images"]:
    filename = item["filename"]
    with Image.open(source / filename) as image:
        width, height = image.size
        for name, (rx, ry, rw, rh) in regions.items():
            x, y = round(width * rx), round(height * ry)
            box = (x, y, min(width, x + round(width * rw)), min(height, y + round(height * rh)))
            image.crop(box).save(out / f"{Path(filename).stem}-{name}.png")
print(json.dumps({"source_read_only": True, "crop_dir": str(out), "derived_images": len(manifest["images"]) * len(regions)}, indent=2))
