import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
const { createWorker } = Tesseract;
import { parseWordwallResult } from './parser.mjs';

const $ = (id) => document.getElementById(id);
const fileInput = $('image-file');
const preview = $('preview');
const workspace = $('image-workspace');
const analyzeButton = $('analyze');
const resultsPanel = $('results-panel');
const dropzone = $('dropzone');
const languageSelect = $('language');
const preprocessSelect = $('preprocess');
const psmSelect = $('psm');

let selectedFile = null;
let objectUrl = null;
let worker = null;
let workerLanguage = null;
let workerStartupMs = null;
let lastJson = null;

const languageMap = { 'spa+eng': ['spa', 'eng'], spa: 'spa', eng: 'eng' };
const psmMap = { auto: '3', sparse: '11', block: '6', line: '7' };

function showFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  selectedFile = file;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  preview.src = objectUrl;
  $('prepared-wrap').hidden = true;
  workspace.hidden = false;
  resultsPanel.hidden = true;
  analyzeButton.disabled = false;
  $('file-meta').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  const image = new Image();
  image.onload = () => { $('file-meta').textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} · ${(file.size / 1024).toFixed(0)} KB`; };
  image.src = objectUrl;
}

fileInput.addEventListener('change', () => showFile(fileInput.files?.[0]));
$('clear-image').addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  preview.removeAttribute('src');
  workspace.hidden = true;
  resultsPanel.hidden = true;
  analyzeButton.disabled = true;
  lastJson = null;
});

dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragging');
  showFile(event.dataTransfer?.files?.[0]);
});

async function populateSamples() {
  try {
    const response = await fetch('./capturas/manifest.json');
    const manifest = await response.json();
    for (const item of manifest.images) {
      const option = document.createElement('option');
      option.value = item.filename;
      option.textContent = `${item.category === 'original' ? 'Original' : 'Variante'} · ${item.filename.split('/').at(-1)}`;
      $('sample-select').append(option);
    }
  } catch (error) {
    $('sample-select').disabled = true;
    $('sample-select').title = 'Las muestras aparecen al servir la carpeta experimental por HTTP.';
  }
}
populateSamples();
$('load-sample').addEventListener('click', async () => {
  const path = $('sample-select').value;
  if (!path) return;
  const response = await fetch(`./${path}`);
  const blob = await response.blob();
  const file = new File([blob], path.split('/').at(-1), { type: blob.type || 'image/png' });
  showFile(file);
});

async function getWorker() {
  const language = languageSelect.value;
  if (worker && workerLanguage === language) return worker;
  if (worker) await worker.terminate();
  worker = null;
  workerLanguage = language;
  const workerUrl = new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href;
  const coreUrl = new URL('../node_modules/tesseract.js-core/', import.meta.url).href;
  const started = performance.now();
  worker = await createWorker(languageMap[language], 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    logger: (message) => {
      if (message.status) $('progress-text').textContent = `${message.status}${Number.isFinite(message.progress) ? ` · ${Math.round(message.progress * 100)}%` : ''}`;
    },
  });
  workerStartupMs = Math.round(performance.now() - started);
  return worker;
}

function prepareCanvas(image, mode) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight, scale = 1;
  if (mode === 'center') {
    // The measured Wordwall result card occupies a central region around 40% × 56%.
    // Keep this as an explicitly activity-specific preprocessing choice, not a general layout detector.
    sw = Math.round(image.naturalWidth * .40);
    sh = Math.round(image.naturalHeight * .56);
    sx = Math.round((image.naturalWidth - sw) / 2);
    sy = Math.round((image.naturalHeight - sh) / 2);
  } else if (mode === 'upscale' || mode === 'gray') {
    scale = 2;
  }
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if (mode === 'gray') {
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      data[i] = data[i + 1] = data[i + 2] = contrasted;
    }
    context.putImageData(frame, 0, 0);
  }
  return canvas;
}

function formatSeconds(value) {
  if (value === null || value === undefined) return 'No visible';
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function renderResult(result, rawText, timings, confidence, mode) {
  $('metric-activity').textContent = result.activityRecognized || 'No reconocida';
  $('metric-score').textContent = result.score === null ? 'No legible' : `${result.score}${result.scoreKind === 'marcador_en_curso' ? ' · en curso' : ''}`;
  $('metric-max').textContent = result.maxScore === null ? 'No visible' : String(result.maxScore);
  $('metric-percent').textContent = result.percentage === null ? 'No calculable' : `${result.percentage}%`;
  $('metric-counts').textContent = result.correct === null && result.incorrect === null ? 'No visibles' : `${result.correct ?? '—'} / ${result.incorrect ?? '—'}`;
  $('metric-duration').textContent = result.durationSeconds === null ? 'No visible' : formatSeconds(result.durationSeconds);
  $('metric-finished').textContent = result.finished === true ? 'Sí' : result.finished === false ? 'No' : 'Sin evidencia';
  $('metric-runtime').textContent = `${timings.recognitionMs} ms`;
  $('ocr-confidence').textContent = `Confianza OCR: ${confidence === null ? '—' : `${confidence.toFixed(1)}%`}`;
  $('ocr-text').textContent = rawText.trim() || 'Tesseract.js no encontró texto legible.';
  $('reasons-list').replaceChildren(...result.reasons.map((reason) => { const li = document.createElement('li'); li.textContent = reason; return li; }));
  const badge = $('decision-badge');
  badge.textContent = result.decision === 'acreditable' ? 'Acreditable' : result.decision === 'no_acreditable' ? 'No acreditable' : 'Indeterminado';
  badge.className = `decision-badge ${result.decision === 'acreditable' ? 'decision-pass' : result.decision === 'no_acreditable' ? 'decision-fail' : 'decision-unknown'}`;
  $('decision-copy').textContent = result.decision === 'acreditable'
    ? 'La captura contiene finalización y una señal explícita de resultado perfecto. Esto no autentica la imagen ni al alumno.'
    : result.decision === 'no_acreditable'
      ? 'La captura muestra un resultado final que no cumple el criterio perfecto.'
      : 'No se concede el punto automáticamente. Falta una señal clara de finalización, un máximo visible o una lectura suficientemente confiable.';
  if (result.timerReadingSeconds !== null && result.durationSeconds === null) {
    const li = document.createElement('li');
    li.textContent = `Temporizador visible: ${formatSeconds(result.timerReadingSeconds)}; se conserva aparte y no se toma como duración de resolución.`;
    $('reasons-list').append(li);
  }
  if (result.authenticityVerified === false) {
    const li = document.createElement('li');
    li.textContent = 'La autenticidad, identidad del alumno e integridad de la imagen no se verifican mediante OCR.';
    $('reasons-list').append(li);
  }
  $('metric-runtime').title = `Carga inicial del motor: ${timings.workerStartupMs ?? 'no requerida'} ms. Preparación: ${timings.preparationMs} ms. Configuración: ${mode}.`;
  resultsPanel.hidden = false;
}

analyzeButton.addEventListener('click', async () => {
  if (!selectedFile) return;
  analyzeButton.disabled = true;
  resultsPanel.hidden = false;
  $('progress-row').hidden = false;
  $('progress-text').textContent = 'Preparando la imagen…';
  $('ocr-text').textContent = '';
  const chosenMode = preprocessSelect.value;
  try {
    const image = new Image();
    const imageUrl = URL.createObjectURL(selectedFile);
    image.src = imageUrl;
    await image.decode();
    const prepStart = performance.now();
    const canvas = prepareCanvas(image, chosenMode);
    URL.revokeObjectURL(imageUrl);
    $('prepared-preview').src = canvas.toDataURL('image/png');
    $('prepared-wrap').hidden = false;
    const preparationMs = Math.round(performance.now() - prepStart);
    const activeWorker = await getWorker();
    await activeWorker.setParameters({ tessedit_pageseg_mode: psmMap[psmSelect.value] });
    $('progress-text').textContent = 'Reconociendo texto localmente…';
    const started = performance.now();
    const ocrSource = chosenMode === 'original' ? selectedFile : canvas.toDataURL('image/png');
    const { data } = await activeWorker.recognize(ocrSource);
    const recognitionMs = Math.round(performance.now() - started);
    const result = parseWordwallResult(data.text, { confidence: data.confidence, activityId: '22610275' });
    const timings = { workerStartupMs, recognitionMs, preparationMs };
    lastJson = {
      ...result,
      activityContext: { provider: 'wordwall', activityId: '22610275', activityTitle: 'Método de M Grande', source: 'configuración de esta demo; no se infiere del nombre del archivo' },
      imagePersisted: false,
      processing: { engine: 'Tesseract.js 7.0.0', language: languageSelect.value, preprocessing: chosenMode, inputSource: chosenMode === 'original' ? 'local File object' : 'local canvas data URL', pageSegmentation: psmSelect.value, inputWidth: image.naturalWidth, inputHeight: image.naturalHeight, processedWidth: canvas.width, processedHeight: canvas.height, ...timings, confidence: data.confidence },
      extractedText: data.text,
    };
    renderResult(result, data.text, timings, data.confidence, chosenMode);
  } catch (error) {
    $('decision-badge').textContent = 'Indeterminado';
    $('decision-badge').className = 'decision-badge decision-unknown';
    $('decision-copy').textContent = 'El OCR no pudo completar el análisis. No se toma una decisión de acreditación.';
    $('progress-text').textContent = `No se pudo analizar: ${error.message}`;
    $('ocr-text').textContent = 'Revisa la conexión inicial al CDN de datos de idioma y vuelve a intentar. La imagen no se ha enviado.';
    $('reasons-list').replaceChildren(Object.assign(document.createElement('li'), { textContent: String(error) }));
  } finally {
    $('progress-row').hidden = true;
    analyzeButton.disabled = !selectedFile;
  }
});

languageSelect.addEventListener('change', async () => {
  if (worker) { await worker.terminate(); worker = null; workerLanguage = null; }
  workerStartupMs = null;
  lastJson = null;
  $('download-json').disabled = true;
});
$('download-json').addEventListener('click', () => {
  if (!lastJson) return;
  const blob = new Blob([JSON.stringify(lastJson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `resultado-wordwall-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

const observer = new MutationObserver(() => { $('download-json').disabled = !lastJson; });
observer.observe(resultsPanel, { attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('beforeunload', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (worker) worker.terminate();
});
