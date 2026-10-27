import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
import { runAdaptiveOcrV31 } from './ocr-v31.mjs';
import { summarizeBenchmark } from './benchmark-summary-v31.mjs';

const $ = (id) => document.getElementById(id);
const { createWorker } = Tesseract;
const profilesPromise = fetch('./capturas/perfiles-v31.json').then(assertOk).then((response) => response.json());
const inventoryPromise = fetch('./capturas/inventario-v31.json').then(assertOk).then((response) => response.json());
const syntheticPromise = fetch('./capturas/sinteticas-v31/manifest.json').then(assertOk).then((response) => response.json());
let profiles;
let inventory;
let worker;
let workerStartupMs = null;
let objectUrl = null;
let chosenFile = null;
let chosenRow = null;
let activeBenchmark = null;
let isBusy = false;
const datasetFiles = new Map();

function assertOk(response) { if (!response.ok) throw new Error(`No se pudo cargar recurso local (${response.status}).`); return response; }
function setProgress(message, visible = true) { const node = $('progress'); node.textContent = message; node.hidden = !visible; }
function setBusy(value) {
  isBusy = value;
  $('analyze').disabled = value || !chosenFile;
  $('discard').disabled = value || !chosenFile;
  $('run-benchmark').disabled = value;
  $('run-synthetic').disabled = value;
  $('dataset-image').disabled = value;
  $('image-file').disabled = value;
  $('dataset-folder').disabled = value;
}
function revokeImage() { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; }
function sizeLabel(file, image) { return `${image.naturalWidth} × ${image.naturalHeight} px · ${(file.size / 1024).toFixed(1)} KB` }
function eligibleRows() { return inventory.files.filter((row) => ['REGRESSION_WORDWALL', 'NEW_HOLDOUT_OCR'].includes(row.eligibility)); }
function sourceGroup(row) { return row.eligibility === 'REGRESSION_WORDWALL' ? 'WORDWALL_REGRESSION' : row.provider; }
function safeReference(row) { const { sourcePath, ...safe } = row; return safe; }
function fileReference(row) {
  const finalization = row.finalizationReference?.startsWith('CONFIRMADA') ? true : row.finalizationReference === 'NO_CONFIRMADA' ? false : null;
  return {
    finalization,
    score: row.scoreMeaning === 'PUNTUACION_FINAL' && row.score !== null && row.maxScore !== null ? [row.score, row.maxScore] : null,
    durationSeconds: row.durationSeconds ?? null,
    pieceCount: row.pieceCount ?? null,
  };
}
function refLabel(value, yes = 'Sí') { return value === true ? yes : value === false ? 'No confirmada' : 'No determinable'; }
function textField(id, value) { $(id).textContent = value; }
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.floor(seconds / 60); const rest = seconds - minutes * 60;
  return minutes ? `${minutes}:${String(Math.round(rest * 10) / 10).padStart(2, '0')}` : `${seconds} s`;
}
function formatMs(ms) { return Number.isFinite(ms) ? `${ms.toLocaleString('es-MX')} ms` : '—'; }
function displayReference(row, status = 'Listo para OCR. La etiqueta se creó por inspección visual.') {
  chosenRow = row;
  textField('capture-name', chosenFile?.name ?? '—');
  textField('reference-status', row ? `${status} Grupo: ${row.eligibility === 'REGRESSION_WORDWALL' ? 'regresión Wordwall' : 'captura nueva observada/calibración'}.` : 'No hay etiqueta visual de referencia para esta imagen.');
  const target = $('reference-grid');
  target.replaceChildren();
  const items = row ? [
    ['Proveedor inspeccionado', row.provider],
    ['Tipo de pantalla', row.screenType],
    ['Finalización visual', refLabel(fileReference(row).finalization)],
    ['Score visual', row.scoreMeaning === 'PUNTUACION_FINAL' ? `${row.score}/${row.maxScore}` : row.scoreMeaning],
    ['Tiempo visual', formatDuration(row.durationSeconds)],
    ['Piezas visuales', row.pieceCount ?? 'No aplica / no visible'],
  ] : [['Etiqueta', 'No disponible'], ['Origen', 'Imagen elegida desde el dispositivo']];
  for (const [label, value] of items) {
    const item = document.createElement('div'); item.append(document.createTextNode(label));
    const strong = document.createElement('strong'); strong.textContent = String(value ?? 'No determinable'); item.append(strong); target.append(item);
  }
}
function clearResult() {
  $('result-panel').hidden = true;
  textField('reference-status', chosenRow ? 'Listo para OCR. La etiqueta se creó por inspección visual.' : 'No hay etiqueta visual de referencia para esta imagen.');
}
async function chooseImage(file, row = null) {
  if (!file || !file.type.startsWith('image/')) return;
  revokeImage();
  chosenFile = file;
  objectUrl = URL.createObjectURL(file);
  const image = $('preview'); image.src = objectUrl;
  $('selected-wrap').hidden = false;
  $('result-panel').hidden = true;
  image.onload = () => { $('preview-meta').textContent = `${sizeLabel(file, image)} · vista previa temporal`; };
  $('preview-meta').textContent = 'Cargando vista previa…';
  displayReference(row);
  $('dataset-image').value = row ? row.filename : '';
  $('image-file').value = '';
  setProgress('', false);
  setBusy(false);
  clearResult();
}
function clearChosenImage() {
  revokeImage(); chosenFile = null; chosenRow = null;
  $('preview').removeAttribute('src'); $('preview-meta').textContent = '';
  $('selected-wrap').hidden = true; $('result-panel').hidden = true;
  $('image-file').value = ''; $('dataset-image').value = '';
  setProgress('', false); setBusy(false);
}
async function getWorker() {
  if (worker) return worker;
  setProgress('Cargando Tesseract.js y modelos locales español/inglés…');
  const start = performance.now();
  worker = await createWorker(['spa', 'eng'], 1, {
    workerPath: new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
    corePath: new URL('../node_modules/tesseract.js-core/', import.meta.url).href,
    langPath: new URL('../', import.meta.url).href,
    gzip: false,
    cacheMethod: 'none',
    logger: ({ status, progress }) => {
      if (status && isBusy) setProgress(`${status}${Number.isFinite(progress) ? ` · ${Math.round(progress * 100)} %` : ''}`);
    },
  });
  workerStartupMs = Math.round(performance.now() - start);
  return worker;
}
async function decodeBlob(blob) {
  const url = URL.createObjectURL(blob); const image = new Image(); image.src = url;
  try { await image.decode(); return { image, revoke: () => URL.revokeObjectURL(url) }; }
  catch (error) { URL.revokeObjectURL(url); throw error; }
}
async function runImageFile(file, row) {
  const { image, revoke } = await decodeBlob(file);
  try {
    const w = await getWorker();
    return await runAdaptiveOcrV31(w, image, profiles, { imageBytes: file.size });
  } finally { revoke(); }
}
function listInto(id, values, emptyLabel) {
  const node = $(id); node.replaceChildren();
  if (!values?.length) { const li = document.createElement('li'); li.textContent = emptyLabel; node.append(li); return; }
  for (const value of values) { const li = document.createElement('li'); li.textContent = String(value); node.append(li); }
}
function renderEvidence(result, run) {
  const evidence = result.evidence;
  $('result-panel').hidden = false;
  textField('template', evidence.templateType);
  textField('finalization', evidence.finalizationStatus);
  textField('score', evidence.score === null ? 'No visible' : `${evidence.score}/${evidence.maxScore ?? '?'}`);
  textField('perfect', evidence.scorePerfect === null ? 'No determinable' : evidence.scorePerfect ? 'Sí, según la fracción visible' : 'No');
  textField('duration', formatDuration(evidence.durationSeconds));
  textField('pieces', evidence.pieceCount === null ? '—' : String(evidence.pieceCount));
  textField('provider', `${evidence.provider} · ${evidence.providerSource}`);
  textField('identity', `${evidence.identityMatch}${evidence.activityIdentity ? ` · ${evidence.activityIdentity}` : ''}`);
  textField('quality', `${evidence.evidenceQuality}${Number.isFinite(evidence.averageOcrConfidence) ? ` · confianza OCR ${evidence.averageOcrConfidence}` : ''}`);
  textField('latency', `${formatMs(result.ocrMs)} · ${result.passCount} pasada(s)${workerStartupMs ? ` · arranque ${formatMs(workerStartupMs)}` : ''}`);
  listInto('reasons', evidence.classificationReasons, 'Sin razones adicionales.');
  listInto('warnings', evidence.warnings, 'Sin advertencias adicionales. La autenticidad sigue sin comprobarse.');
  const readings = $('readings'); readings.replaceChildren();
  result.readings.forEach((reading) => {
    const row = document.createElement('article'); row.className = 'pass-row';
    const header = document.createElement('header');
    const name = document.createElement('span'); name.textContent = `${reading.pass} · ${reading.region} · PSM ${reading.psm}`;
    const meta = document.createElement('span'); meta.textContent = `${formatMs(reading.elapsedMs)} · confianza ${Math.round(reading.confidence ?? 0)}`;
    header.append(name, meta);
    const pre = document.createElement('pre'); pre.textContent = reading.text || '[sin texto reconocido]'; row.append(header, pre); readings.append(row);
  });
  $('structured-output').textContent = JSON.stringify({ ...result, workerStartupMs, datasetReference: chosenRow ? fileReference(chosenRow) : null }, null, 2);
  displayReference(chosenRow, chosenRow ? compareReference(chosenRow, evidence) : 'Imagen propia: no hay etiqueta visual de referencia.');
  $('result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function compareReference(row, evidence) {
  const ref = fileReference(row); const discrepancies = [];
  if (ref.finalization !== null && (evidence.finalizationStatus === 'FINALIZACION_CONFIRMADA') !== ref.finalization) discrepancies.push('finalización');
  if (ref.score && (evidence.score !== ref.score[0] || evidence.maxScore !== ref.score[1])) discrepancies.push('score');
  if (ref.durationSeconds !== null && evidence.durationSeconds !== ref.durationSeconds) discrepancies.push('tiempo');
  if (ref.pieceCount !== null && evidence.pieceCount !== ref.pieceCount) discrepancies.push('piezas');
  return discrepancies.length ? `Diferencias frente a la inspección visual: ${discrepancies.join(', ')}.` : 'Coincide con los campos que tienen etiqueta visual determinable.';
}
async function analyzeChosen() {
  if (!chosenFile || isBusy) return;
  setBusy(true); $('result-panel').hidden = true;
  try {
    setProgress('Preparando captura local…');
    const activeWorker = await getWorker();
    const result = await runAdaptiveOcrV31(activeWorker, $('preview'), profiles, { imageBytes: chosenFile.size });
    renderEvidence(result, chosenRow);
    setProgress('Terminado. La imagen no se conserva fuera de esta pestaña.', true);
  } catch (error) {
    setProgress(`OCR no disponible: ${error.message}. Confirma que la demo se abrió desde el servidor local y prueba otra imagen.`);
  } finally { setBusy(false); }
}
function predictedFinalization(evidence) {
  if (evidence.finalizationStatus === 'FINALIZACION_CONFIRMADA') return true;
  if (evidence.finalizationStatus === 'FINALIZACION_NO_CONFIRMADA') return false;
  return null;
}
function latencyStats(rows) {
  const values = rows.map((row) => row.result?.ocrMs ?? row.ocrMs).sort((a, b) => a - b);
  const median = values.length % 2 ? values[(values.length - 1) / 2] : Math.round((values[values.length / 2 - 1] + values[values.length / 2]) / 2);
  return { mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length), median, p95: values[Math.ceil(values.length * .95) - 1] };
}
function metricLabel(metric) { return `${metric.correct}/${metric.total}`; }
function renderBenchmarkRows(rows, outputId = 'benchmark-rows') {
  const body = $(outputId); body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    const expected = fileReference(row.reference).finalization;
    const finalState = `${refLabel(expected)} → ${row.result.evidence.finalizationStatus}`;
    const fields = [sourceGroup(row.reference), finalState,
      row.reference.scoreMeaning === 'PUNTUACION_FINAL' ? `${row.result.evidence.score ?? '—'}/${row.result.evidence.maxScore ?? '—'}` : '—',
      row.result.evidence.durationSeconds === null ? '—' : formatDuration(row.result.evidence.durationSeconds),
      row.result.evidence.pieceCount ?? '—', formatMs(row.result.ocrMs), row.result.passCount];
    for (const value of fields) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
    body.append(tr);
  }
}
function renderBenchmarkSummary(summary, note) {
  const node = $('benchmark-summary'); node.hidden = false; node.replaceChildren();
  const values = [
    ['Imágenes', summary.imageCount], ['Finalización correcta', metricLabel(summary.finalization)], ['Estados clasificados', `${summary.finalization.classified}/${summary.finalization.total}`], ['Abstenciones de finalización', summary.finalization.indeterminateOutput], ['Score', metricLabel(summary.score)],
    ['Tiempo', metricLabel(summary.time)], ['Piezas', metricLabel(summary.pieces)], ['Indeterminados', summary.indeterminate],
    ['Latencia media / mediana / P95', `${summary.latency.mean}/${summary.latency.median}/${summary.latency.p95} ms`],
    ['Pasadas OCR', summary.passCount], ['Nota', note],
  ];
  for (const [label, value] of values) { const span = document.createElement('span'); span.textContent = `${label}: `; const strong = document.createElement('strong'); strong.textContent = String(value); span.append(strong); node.append(span); }
}
async function localFileFor(row) {
  const file = datasetFiles.get(row.filename);
  if (!file) throw new Error(`Falta ${row.filename}; selecciona la carpeta original «Pruebas para ocr».`);
  return file;
}
async function runBenchmark(rows, isSynthetic = false) {
  if (isBusy) return;
  if (!isSynthetic) {
    const missing = rows.filter((row) => !datasetFiles.has(row.filename));
    if (missing.length) {
      $('benchmark-progress').hidden = false;
      $('benchmark-progress').textContent = `Carga la carpeta original «Pruebas para ocr»; faltan ${missing.length} imágenes aptas (${missing.slice(0, 2).map((row) => row.filename).join(', ')}${missing.length > 2 ? ', …' : ''}).`;
      return;
    }
  }
  setBusy(true);
  const progressNode = isSynthetic ? $('synthetic-summary') : $('benchmark-progress');
  if (!isSynthetic) { $('benchmark-summary').hidden = true; $('benchmark-rows').replaceChildren(); $('benchmark-state').textContent = 'Ejecutando OCR local…'; }
  const outputs = [];
  try {
    await getWorker();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const message = `OCR ${index + 1}/${rows.length}: ${row.filename}.`;
      if (isSynthetic) { progressNode.hidden = false; progressNode.textContent = message; }
      else { $('benchmark-progress').hidden = false; $('benchmark-progress').textContent = message; }
      const path = isSynthetic ? `./capturas/sinteticas-v31/${encodeURIComponent(row.filename)}` : null;
      const blob = isSynthetic ? assertOk(await fetch(path, { cache: 'no-store' })).blob() : localFileFor(row);
      const fileBlob = await blob;
      const result = await runImageFile(fileBlob, row);
      outputs.push({ filename: row.filename, group: isSynthetic ? 'SINTETICO' : sourceGroup(row), reference: safeReference(row), result });
    }
    if (isSynthetic) {
      const manifest = await syntheticPromise;
      const expected = outputs.filter((item) => item.reference.expected?.finalization !== null && item.reference.expected?.finalization !== undefined);
      const classified = expected.filter((item) => predictedFinalization(item.result.evidence) !== null);
      const correct = classified.filter((item) => predictedFinalization(item.result.evidence) === item.reference.expected.finalization).length;
      const summary = { fixtures: rows.length, finalizationCorrect: correct, finalizationTotal: expected.length, finalizationClassified: classified.length, finalizationAbstentions: expected.length - classified.length, templateExact: outputs.filter((item) => item.result.evidence.templateType === item.reference.expected?.templateType).length, latency: latencyStats(outputs.map((item) => ({ ocrMs: item.result.ocrMs }))), passCount: outputs.reduce((sum, item) => sum + item.result.passCount, 0), watermark: manifest.watermark };
      progressNode.hidden = false; progressNode.replaceChildren();
      const lines = [`Fixtures sintéticos: ${summary.fixtures} · estado final correcto ${summary.finalizationCorrect}/${summary.finalizationTotal} · clasificados ${summary.finalizationClassified}/${summary.finalizationTotal} · abstenciones ${summary.finalizationAbstentions} · plantilla exacta ${summary.templateExact}/${summary.fixtures}`, `Latencia media/mediana/P95: ${summary.latency.mean}/${summary.latency.median}/${summary.latency.p95} ms · ${summary.passCount} pasadas · ${summary.watermark}`];
      for (const line of lines) { const span = document.createElement('span'); span.textContent = line; progressNode.append(span); }
      const synthBody = document.createElement('p'); synthBody.className = 'helper'; synthBody.textContent = outputs.map((item) => `${item.filename}: ${item.result.evidence.templateType}/${item.result.evidence.finalizationStatus}`).join(' · '); progressNode.append(synthBody);
      activeBenchmark = { ...(activeBenchmark ?? {}), synthetic: { summary, rows: outputs } };
    } else {
      const summary = summarizeBenchmark(outputs, fileReference);
      renderBenchmarkRows(outputs);
      renderBenchmarkSummary(summary, 'Los 4 nuevos ya influyeron en el ajuste; el retest no es holdout independiente.');
      $('benchmark-progress').hidden = true; $('benchmark-state').textContent = 'Benchmark terminado';
      activeBenchmark = { ...(activeBenchmark ?? {}), real: { summary, rows: outputs }, generatedAt: new Date().toISOString(), workerStartupMs, engine: 'Tesseract.js 7.0.0', languageModels: ['spa', 'eng'], learningAppsOcrRun: false };
    }
    $('download-benchmark').disabled = false;
  } catch (error) {
    if (isSynthetic) { progressNode.hidden = false; progressNode.textContent = `El benchmark sintético se detuvo: ${error.message}`; }
    else { $('benchmark-progress').hidden = false; $('benchmark-progress').textContent = `El benchmark se detuvo: ${error.message}`; $('benchmark-state').textContent = 'Error'; }
  } finally { setBusy(false); }
}
function seedDataset() {
  const select = $('dataset-image');
  const rows = eligibleRows();
  for (const row of rows) {
    const option = document.createElement('option'); option.value = row.filename;
    option.textContent = `${row.eligibility === 'REGRESSION_WORDWALL' ? 'Wordwall · regresión' : `${row.provider} · nuevo visto`} · ${row.filename.slice(0, 18)}`;
    select.append(option);
  }
  const grouped = rows.reduce((count, row) => { count[row.eligibility] = (count[row.eligibility] ?? 0) + 1; return count; }, {});
  $('benchmark-state').textContent = `${grouped.REGRESSION_WORDWALL} regresión + ${grouped.NEW_HOLDOUT_OCR} nuevas`;
}
function downloadResult() {
  if (!activeBenchmark) return;
  const blob = new Blob([JSON.stringify(activeBenchmark, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'optilab-ocr-v31-benchmark-local.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function initialize() {
  try { [profiles, inventory] = await Promise.all([profilesPromise, inventoryPromise]); seedDataset(); }
  catch (error) { $('benchmark-state').textContent = `No se pudo leer el inventario local: ${error.message}`; }
}

$('dataset-folder').addEventListener('change', (event) => {
  const allowed = new Set(eligibleRows().map((row) => row.filename));
  datasetFiles.clear();
  for (const file of event.currentTarget.files ?? []) {
    const name = file.name;
    if (allowed.has(name)) datasetFiles.set(name, file);
  }
  const rows = eligibleRows();
  const count = rows.filter((row) => datasetFiles.has(row.filename)).length;
  $('folder-status').textContent = `${count}/${rows.length} imágenes aptas cargadas en memoria; ${rows.length - count} faltantes. Los archivos ajenos al inventario OCR se ignoran.`;
  $('dataset-image').disabled = count === 0;
  for (const option of $('dataset-image').options) if (option.value) option.disabled = !datasetFiles.has(option.value);
  $('benchmark-state').textContent = count === rows.length ? '11 imágenes disponibles localmente' : `${count}/${rows.length} imágenes disponibles`;
});
$('dataset-image').addEventListener('change', async (event) => {
  const filename = event.currentTarget.value; if (!filename) return;
  const row = eligibleRows().find((item) => item.filename === filename); if (!row) return;
  setBusy(true);
  try { const file = await localFileFor(row); await chooseImage(file, row); }
  catch (error) { setProgress(`No se pudo abrir la imagen local: ${error.message}`); }
  finally { setBusy(false); }
});
$('image-file').addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  const known = inventory.files.find((row) => row.filename === file?.name);
  if (known && !['REGRESSION_WORDWALL', 'NEW_HOLDOUT_OCR'].includes(known.eligibility)) {
    clearChosenImage();
    $('folder-status').textContent = 'Ese archivo está etiquetado como LearningApps o con procedencia ambigua; no se ejecutó OCR. Usa eventos para LearningApps.';
    return;
  }
  chooseImage(file, eligibleRows().find((row) => row.filename === file?.name) ?? null);
});
$('analyze').addEventListener('click', analyzeChosen);
$('discard').addEventListener('click', clearChosenImage);
$('run-benchmark').addEventListener('click', () => runBenchmark(eligibleRows()));
$('run-synthetic').addEventListener('click', async () => { try { const manifest = await syntheticPromise; await runBenchmark(manifest.fixtures.filter((row) => !row.resourceStressOnly), true); } catch (error) { $('synthetic-summary').hidden = false; $('synthetic-summary').textContent = error.message; } });
$('download-benchmark').addEventListener('click', downloadResult);
window.addEventListener('pagehide', () => { $('preview').removeAttribute('src'); revokeImage(); if (worker) worker.terminate(); });
await initialize();
