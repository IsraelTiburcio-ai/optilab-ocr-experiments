from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps
import hashlib, json

ROOT = Path(__file__).resolve().parents[1]
ORIG = ROOT / 'capturas' / 'originales'
VAR = ROOT / 'capturas' / 'variantes'
VAR.mkdir(parents=True, exist_ok=True)

# Reference labels were assigned by looking at each original screenshot, separately from OCR.
labels = {
 'wordwall-container-control.png': dict(state='contenedor_sin_juego', activityRecognized=None, score=None, scoreKind=None, finished=None, feedback=None, timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-container-inicio.png': dict(state='pantalla_inicial', activityRecognized='Método de M Grande', score=None, scoreKind=None, finished=False, feedback=None, timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-embed-inicio.png': dict(state='pantalla_inicial', activityRecognized='Método de M Grande', score=None, scoreKind=None, finished=False, feedback=None, timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-container-running.png': dict(state='partida_en_curso', activityRecognized=None, score=0, scoreKind='marcador_en_curso', finished=False, feedback=None, timerRemainingSeconds=118, decision='indeterminado'),
 'wordwall-ronda-error-start.png': dict(state='partida_en_curso', activityRecognized=None, score=0, scoreKind='marcador_en_curso', finished=False, feedback=None, timerRemainingSeconds=118, decision='indeterminado'),
 'wordwall-error-feedback.png': dict(state='partida_en_curso', activityRecognized=None, score=0, scoreKind='marcador_en_curso', finished=False, feedback='Incorrecto', timerRemainingSeconds=106, decision='indeterminado'),
 'wordwall-respuesta-correcta.png': dict(state='partida_en_curso', activityRecognized=None, score=1, scoreKind='marcador_en_curso', finished=False, feedback=None, timerRemainingSeconds=80, decision='indeterminado'),
 'wordwall-feedback-correcto.png': dict(state='partida_en_curso', activityRecognized=None, score=1, scoreKind='marcador_en_curso', finished=False, feedback='Correcto', timerRemainingSeconds=79, decision='indeterminado'),
 'wordwall-prompt-1.png': dict(state='partida_en_curso', activityRecognized=None, score=0, scoreKind='marcador_en_curso', finished=False, feedback=None, timerRemainingSeconds=99, decision='indeterminado'),
 'wordwall-prompt-2.png': dict(state='partida_en_curso', activityRecognized=None, score=2, scoreKind='marcador_en_curso', finished=False, feedback='Correcto', timerRemainingSeconds=54, decision='indeterminado'),
 'wordwall-ronda-error-prompt.png': dict(state='partida_en_curso', activityRecognized=None, score=None, scoreKind=None, finished=False, feedback=None, timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-prompt-error-run.png': dict(state='partida_en_curso', activityRecognized=None, score=None, scoreKind=None, finished=False, feedback=None, timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-ronda-error-feedback.png': dict(state='partida_en_curso', activityRecognized=None, score=2, scoreKind='marcador_en_curso', finished=False, feedback=None, timerRemainingSeconds=67, decision='indeterminado'),
 'wordwall-fin-por-tiempo-puntuacion-3.png': dict(state='fin_por_tiempo', activityRecognized=None, score=3, scoreKind='puntuacion_final', finished=True, feedback='Se acabó el tiempo', timerRemainingSeconds=None, decision='indeterminado'),
 'wordwall-resultado-ronda-1.png': dict(state='fin_por_tiempo', activityRecognized=None, score=0, scoreKind='puntuacion_final', finished=True, feedback='Se acabó el tiempo', timerRemainingSeconds=None, decision='no_acreditable'),
 'wordwall-resultado-ronda-2.png': dict(state='fin_por_tiempo', activityRecognized=None, score=0, scoreKind='puntuacion_final', finished=True, feedback='Se acabó el tiempo', timerRemainingSeconds=None, decision='no_acreditable'),
}

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1<<20), b''): h.update(block)
    return h.hexdigest()

def save_variant(src_name, out_name, transform, note, reference_override=None):
    src=ORIG/src_name
    im=Image.open(src).convert('RGB')
    out=VAR/out_name
    im=transform(im)
    if out.suffix.lower() in ('.jpg','.jpeg'):
        im.save(out, 'JPEG', quality=int(out_name.split('q')[-1].split('.')[0]), optimize=True)
    else:
        im.save(out, 'PNG', optimize=True)
    return dict(filename=str(out.relative_to(ROOT)), category='variant', derivedFrom=f'capturas/originales/{src_name}', sourceCaptureId=sha(src), sha256=sha(out), transform=note, reference={**labels[src_name], **(reference_override or {})}, exactDuplicateOf=None)

manifest=[]
for name in sorted(labels):
    path=ORIG/name
    image_hash=sha(path)
    reference=labels[name]
    manifest.append(dict(filename=f'capturas/originales/{name}', category='original', derivedFrom=None, sourceCaptureId=image_hash, sha256=image_hash, transform='ninguna; archivo original copiado sin modificar', reference=reference, exactDuplicateOf=None))

variants=[
 ('wordwall-embed-inicio.png','v01-inicio-resize-50.png',lambda im: im.resize((round(im.width*.5),round(im.height*.5)),Image.Resampling.LANCZOS),'Redimensionada al 50%; conserva el encuadre y el contenido visible.',None),
 ('wordwall-embed-inicio.png','v02-inicio-jpeg-q35.jpg',lambda im: im,'JPEG calidad 35; conserva el encuadre. Compresión con pérdida.',None),
 ('wordwall-feedback-correcto.png','v03-acierto-contraste-bajo.png',lambda im: ImageEnhance.Contrast(im).enhance(.48),'Contraste reducido a 48%; conserva el encuadre.',None),
 ('wordwall-feedback-correcto.png','v04-acierto-resize-40.png',lambda im: im.resize((round(im.width*.4),round(im.height*.4)),Image.Resampling.LANCZOS),'Redimensionada al 40%; conserva el encuadre.',None),
 ('wordwall-error-feedback.png','v05-error-jpeg-q25.jpg',lambda im: im,'JPEG calidad 25; conserva el encuadre. Compresión con pérdida.',None),
 ('wordwall-error-feedback.png','v06-error-resize-50.png',lambda im: im.resize((round(im.width*.5),round(im.height*.5)),Image.Resampling.LANCZOS),'Redimensionada al 50%; conserva el encuadre.',None),
 ('wordwall-fin-por-tiempo-puntuacion-3.png','v07-final3-resize-40.png',lambda im: im.resize((round(im.width*.4),round(im.height*.4)),Image.Resampling.LANCZOS),'Redimensionada al 40%; conserva la tarjeta final.',None),
 ('wordwall-fin-por-tiempo-puntuacion-3.png','v08-final3-jpeg-q30.jpg',lambda im: im,'JPEG calidad 30; conserva el encuadre. Compresión con pérdida.',None),
 ('wordwall-fin-por-tiempo-puntuacion-3.png','v09-final3-gris-contraste-bajo.png',lambda im: ImageEnhance.Contrast(ImageOps.grayscale(im)).enhance(.55),'Escala de grises y contraste 55%; conserva el encuadre.',None),
 ('wordwall-fin-por-tiempo-puntuacion-3.png','v10-final3-recorte-centro.png',lambda im: im.crop((round(im.width*.30),round(im.height*.24),round(im.width*.70),round(im.height*.76))),'Recorte central que conserva la tarjeta y elimina la mayor parte del fondo.',None),
 ('wordwall-resultado-ronda-1.png','v11-final0-jpeg-q35.jpg',lambda im: im,'JPEG calidad 35; conserva el encuadre. Compresión con pérdida.',None),
 ('wordwall-container-running.png','v12-partida-contraste-bajo.png',lambda im: ImageEnhance.Contrast(im).enhance(.5),'Contraste reducido a 50%; conserva el encuadre.',None),
 ('wordwall-resultado-ronda-1.png','v13-final0-recorte-centro.png',lambda im: im.crop((round(im.width*.30),round(im.height*.22),round(im.width*.70),round(im.height*.78))),'Recorte central de la tarjeta final para probar OCR por región.',None),
 ('wordwall-fin-por-tiempo-puntuacion-3.png','v14-final3-upscale-2x.png',lambda im: im.resize((im.width*2,im.height*2),Image.Resampling.LANCZOS),'Redimensionada al 200% para comparar escalado. Conserva el contenido.',None),
]
for spec in variants:
    manifest.append(save_variant(*spec))

# Mark byte-identical originals/variants; a derived image inherits its original capture group.
by_hash={}
for item in manifest:
    item['exactDuplicateOf']=by_hash.get(item['sha256'])
    by_hash.setdefault(item['sha256'],item['filename'])

out=ROOT/'capturas'/'manifest.json'
out.write_text(json.dumps({'activityContext':{'provider':'wordwall','activityId':'22610275','activityTitle':'Método de M Grande','activityUrl':'https://wordwall.net/resource/22610275/m%C3%A9todo-de-m-grande','embedUrl':'https://wordwall.net/es/embed/cc167dda64954e3dbb379706dd8348c8?themeId=66&templateId=35&fontStackId=0'},'labeling':'Etiquetas visuales manuales asignadas antes de ejecutar OCR. Las variantes heredan la captura de origen y no son partidas independientes.','images':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"manifest: {len(manifest)} imágenes ({sum(i['category']=='original' for i in manifest)} originales, {sum(i['category']=='variant' for i in manifest)} variantes)")
print(f"archivos únicos por hash: {len({i['sha256'] for i in manifest})}")
print(f"capturas de origen únicas: {len({i['sourceCaptureId'] for i in manifest})}")
