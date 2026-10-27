import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
import { ACADEMIC_POLICIES, parseWordwallResultV2 } from './parser-v2.mjs';
import { OCR_PASSES_V2, OCR_REGION_V2, cropBounds, plannedPassesV2 } from './ocr-v2.mjs';

const { createWorker, PSM } = Tesseract;
const $ = (id) => document.getElementById(id);
const psmMap = { auto: PSM.AUTO, sparse: PSM.SPARSE_TEXT };
const fileInput = $('image-file');
let selectedFile = null;
let objectUrl = null;
let worker = null;
let workerStartedMs = null;
let lastJson = null;

function setFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  selectedFile = file;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  $('preview').src = objectUrl;
  $('file-meta').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  $('workspace').hidden = false;
  $('result-panel').hidden = true;
  $('analyze').disabled = false;
  const image = new Image();
  image.onload = () => { $('file-meta').textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${(file.size / 1024).toFixed(0)} KB`; };
  image.src = objectUrl;
}

fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
$('dropzone').addEventListener('dragover', (event) => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); setFile(event.dataTransfer?.files?.[0]); });
$('clear-image').addEventListener('click', () => {
  selectedFile = null; fileInput.value = ''; $('preview').removeAttribute('src'); $('workspace').hidden = true; $('result-panel').hidden = true; $('analyze').disabled = true; lastJson = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null;
});

async function getWorker() {
  if (worker) return worker;
  $('progress').textContent = 'Cargando Tesseract.js y los modelos locales español/inglés…';
  const started = performance.now();
  worker = await createWorker(['spa', 'eng'], 1, {
    workerPath: new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
    corePath: new URL('../node_modules/tesseract.js-core/', import.meta.url).href,
    langPath: new URL('../', import.meta.url).href,
    gzip: false,
    logger: ({ status, progress }) => { if (status) $('progress').textContent = `${status}${Number.isFinite(progress) ? ` · ${Math.round(progress * 100)}%` : ''}`; },
  });
  workerStartedMs = Math.round(performance.now() - started);
  return worker;
}

function regionCanvas(image, regionName) {
  const bounds = cropBounds(image.naturalWidth, image.naturalHeight, regionName);
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width; canvas.height = bounds.height;
  canvas.getContext('2d').drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return { canvas, bounds };
}

function showResult(result, reads, totalMs) {
  $('score').textContent = result.score === null ? 'No legible' : String(result.score);
  $('maximum').textContent = result.max_score === null ? 'No visible' : String(result.max_score);
  $('percentage').textContent = result.percentage === null ? 'No calculable' : `${result.percentage}%`;
  $('finished').textContent = result.finalization_detected ? 'Sí' : 'No confirmada';
  $('success').textContent = result.successful_completion_detected === true ? 'Sí' : result.successful_completion_detected === false ? 'No' : 'No determinada';
  $('duration').textContent = result.duration_seconds === null ? 'No visible' : `${result.duration_seconds} s`;
  $('activity').textContent = result.activity_recognized ?? 'No reconocida';
  $('matched').textContent = result.activity_matched === true ? 'Sí' : result.activity_matched === false ? 'No' : 'Sin evidencia';
  $('selected-rule').textContent = result.selected_rule;
  $('runtime').textContent = `${totalMs} ms total · ${reads.length} pasadas · carga inicial ${workerStartedMs ?? '—'} ms`;
  const badge = $('decision');
  badge.textContent = result.decision;
  badge.className = `decision ${result.decision === 'ACREDITABLE' ? 'accreditable' : result.decision === 'NO_ACREDITABLE' ? 'no' : ''}`;
  const reasonItems = [...result.reasons, ...result.warnings, result.authenticity_warning];
  $('reasons').replaceChildren(...reasonItems.map((reason) => { const li = document.createElement('li'); li.textContent = reason; return li; }));
  $('pass-list').replaceChildren(...reads.map((reading) => {
    const card = document.createElement('article'); card.className = 'pass-card';
    const top = document.createElement('div'); top.className = 'pass-top';
    const name = document.createElement('strong'); name.textContent = `${reading.pass} · ${reading.regionLabel}`;
    const metrics = document.createElement('span'); metrics.textContent = `PSM ${reading.psm} · ${reading.confidence === null ? 'confianza —' : `confianza ${reading.confidence.toFixed(1)} %`} · ${reading.elapsedMs} ms`;
    const text = document.createElement('pre'); text.textContent = reading.text.trim() || '(sin texto detectado)';
    top.append(name, metrics); card.append(top, text); return card;
  }));
  $('result-panel').hidden = false;
}

$('analyze').addEventListener('click', async () => {
  if (!selectedFile) return;
  $('analyze').disabled = true; $('result-panel').hidden = false; $('progress').hidden = false; $('progress').textContent = 'Preparando análisis…'; $('pass-list').replaceChildren();
  const image = new Image(); image.src = URL.createObjectURL(selectedFile);
  try {
    await image.decode();
    const activeWorker = await getWorker();
    const configuredActivity = { activityId: $('activity-id').value.trim(), title: $('activity-title').value.trim() };
    const policy = $('policy').value;
    const reads = [];
    const startAll = performance.now();
    let parsed = parseWordwallResultV2(reads, { configuredActivity, policy });
    for (const candidate of OCR_PASSES_V2) {
      if (candidate.pass !== 'full-auto' && !plannedPassesV2(reads, parsed).some((next) => next.pass === candidate.pass)) continue;
      const { canvas, bounds } = regionCanvas(image, candidate.region);
      await activeWorker.setParameters({ tessedit_pageseg_mode: psmMap[candidate.psm], tessedit_char_whitelist: '' });
      $('progress').textContent = `OCR ${candidate.pass} · ${bounds.label} · procesado en el navegador…`;
      const started = performance.now();
      const { data } = await activeWorker.recognize(canvas);
      reads.push({ pass: candidate.pass, region: candidate.region, regionLabel: bounds.label, psm: candidate.psm, confidence: Number.isFinite(data.confidence) ? data.confidence : null, text: data.text, elapsedMs: Math.round(performance.now() - started) });
      parsed = parseWordwallResultV2(reads, { configuredActivity, policy });
      if (plannedPassesV2(reads, parsed).length === 0) break;
    }
    const totalMs = Math.round(performance.now() - startAll);
    lastJson = {
      ...parsed,
      source_filename: selectedFile.name,
      input_dimensions: { width: image.naturalWidth, height: image.naturalHeight },
      processing: { engine: 'Tesseract.js 7.0.0', languages: ['spa', 'eng'], execution: 'navegador local', image_uploaded_to_server: false, max_passes: OCR_PASSES_V2.length, total_ocr_ms: totalMs, worker_startup_ms: workerStartedMs, pass_configurations: reads.map(({ pass, region, psm, elapsedMs }) => ({ pass, region, psm, elapsed_ms: elapsedMs })) },
      extracted_text_by_pass: reads.map(({ pass, region, text }) => ({ pass, region, text })),
    };
    showResult(lastJson, reads, totalMs);
    $('progress').textContent = 'Listo. La evidencia no se ha enviado ni almacenado en servidor.';
  } catch (error) {
    $('progress').textContent = `No se pudo analizar: ${error.message}`;
    $('decision').textContent = 'INDETERMINADO'; $('decision').className = 'decision';
    $('reasons').replaceChildren(Object.assign(document.createElement('li'), { textContent: 'Falló el OCR; no se concede acreditación.' }));
  } finally {
    URL.revokeObjectURL(image.src); $('analyze').disabled = false;
  }
});

$('download-json').addEventListener('click', () => {
  if (!lastJson) return;
  const blob = new Blob([JSON.stringify(lastJson, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'wordwall-ocr-v2.json'; link.click(); URL.revokeObjectURL(link.href);
});
const observer = new MutationObserver(() => { $('download-json').disabled = !lastJson; }); observer.observe($('result-panel'), { attributes: true, attributeFilter: ['hidden'] });
