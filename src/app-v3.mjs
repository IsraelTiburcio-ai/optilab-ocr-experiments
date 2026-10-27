import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
import { parseWordwallResultV2 } from './parser-v2.mjs';
import { cropBounds, OCR_PASSES_V2 } from './ocr-v2.mjs';
import { evaluateEvidenceV3, makeRecordV3, nextPassV3 } from './engine-v3.mjs';

const { createWorker, PSM } = Tesseract;
const $ = (id) => document.getElementById(id);
const fileInput = $('image-file');
const psmMap = { auto: PSM.AUTO, sparse: PSM.SPARSE_TEXT };
const catalogPromise = fetch('./capturas/catalog-v3.json').then((response) => response.json());
let activity = null;
let selectedFile = null;
let objectUrl = null;
let worker = null;
let workerStartupMs = null;
let currentParsed = null;
let currentEvidence = null;
let currentReads = [];
let currentProcessing = null;
let imageWasRecorded = false;
let experimentalMetrics = null;

const demoRows = [
  { student:'Alumno demo 001', activity:'Método de M Grande', resultStatus:'PERFECTO', score:6, maxScore:6, durationSeconds:86, submissionStatus:'ACREDITABLE_SEGUN_POLITICA', academicGrade:1, gradingPolicy:'PUNTUACION_PERFECTA', verificationMode:'CONTEXTUAL', receivedAt:'Simulación', warnings:'Identidad visual no comprobada; contexto aprobado solo para el experimento.', simulated:true },
  { student:'Alumno demo 002', activity:'Método de M Grande', resultStatus:'INSUFICIENTE', score:8, maxScore:10, durationSeconds:52, submissionStatus:'NO_CUMPLE_CRITERIO', academicGrade:0, gradingPolicy:'PUNTUACION_PERFECTA', verificationMode:'STRICT', receivedAt:'Simulación', warnings:'Fixture sintético; título visible y criterio incumplido demostrado.', simulated:true },
  { student:'Alumno demo 003', activity:'Método de M Grande', resultStatus:'COMPLETADO', score:null, maxScore:null, durationSeconds:127, submissionStatus:'REQUIERE_NUEVA_EVIDENCIA', academicGrade:null, gradingPolicy:'PUNTUACION_PERFECTA', verificationMode:'STRICT', receivedAt:'Simulación', warnings:'No hay puntuación para probar el criterio perfecto; pendiente no equivale a cero.', simulated:true },
  { student:'Alumno demo 004', activity:'Método de M Grande', resultStatus:'PERFECTO', score:6, maxScore:6, durationSeconds:86, submissionStatus:'EVIDENCIA_DE_OTRA_ACTIVIDAD', academicGrade:null, gradingPolicy:'PUNTUACION_PERFECTA', verificationMode:'CONTEXTUAL', receivedAt:'Simulación', warnings:'Otra actividad visible. Solicitar evidencia correcta, no registrar cero.', simulated:true },
  { student:'Alumno demo 005', activity:'Método de M Grande', resultStatus:'DESCONOCIDO', score:null, maxScore:null, durationSeconds:null, submissionStatus:'PENDIENTE_REVISION', academicGrade:null, gradingPolicy:'PUNTUACION_PERFECTA', verificationMode:'STRICT', receivedAt:'Simulación', warnings:'No se recibió evidencia; queda pendiente, no es cero.', simulated:true },
];
let records = [...demoRows];

function activeActivityConfig() {
  return {
    ...activity,
    gradingPolicy: $('grading-policy').value,
    verificationMode: $('verification-mode').value,
    allowContextualEvidence: $('context-approved').checked,
  };
}

function showFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  selectedFile = file;
  currentParsed = null; currentEvidence = null; currentReads = []; currentProcessing = null; imageWasRecorded = false;
  $('preview').src = objectUrl;
  $('file-meta').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  $('upload-workspace').hidden = false; $('result-panel').hidden = true; $('analyze').disabled = false;
  $('record-feedback').textContent = '';
  const image = new Image(); image.onload = () => { $('file-meta').textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${(file.size / 1024).toFixed(0)} KB`; }; image.src = objectUrl;
}

function discardImage() {
  selectedFile = null; currentParsed = null; currentEvidence = null; currentReads = []; currentProcessing = null; imageWasRecorded = false;
  $('image-file').value = ''; $('preview').removeAttribute('src'); $('upload-workspace').hidden = true; $('result-panel').hidden = true; $('analyze').disabled = true; $('record-feedback').textContent = '';
  if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null;
}

async function getWorker() {
  if (worker) return worker;
  $('progress').textContent = 'Cargando reconocimiento local español e inglés…';
  const started = performance.now();
  worker = await createWorker(['spa', 'eng'], 1, {
    workerPath: new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
    corePath: new URL('../node_modules/tesseract.js-core/', import.meta.url).href,
    langPath: new URL('../', import.meta.url).href,
    gzip: false,
    logger: ({ status, progress }) => { if (status) $('progress').textContent = `${status}${Number.isFinite(progress) ? ` · ${Math.round(progress * 100)} %` : ''}`; },
  });
  workerStartupMs = Math.round(performance.now() - started);
  return worker;
}

function makeRegionCanvas(image, region) {
  const bounds = cropBounds(image.naturalWidth, image.naturalHeight, region);
  const canvas = document.createElement('canvas'); canvas.width = bounds.width; canvas.height = bounds.height;
  canvas.getContext('2d').drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return { canvas, bounds };
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'No visible';
  const minutes = Math.floor(seconds / 60); const rest = seconds - minutes * 60;
  return minutes ? `${minutes}:${String(Math.round(rest * 10) / 10).padStart(2, '0')}` : `${seconds} s`;
}
function niceGrade(grade) { return grade === 1 ? '1 · simulado' : grade === 0 ? '0 · simulado' : 'Pendiente'; }
function formatRecordSummary(record) {
  const score = record.score === null || record.score === undefined ? 'No visible' : `${record.score}/${record.maxScore ?? '?'}`;
  return `${score} · ${formatDuration(record.durationSeconds)}`;
}

function renderDecision(prefix, decision) {
  $(`${prefix}-decision`).textContent = decision.decision;
  $(`${prefix}-grade`).textContent = niceGrade(decision.academicGrade);
  $(`${prefix}-reasons`).replaceChildren(...decision.reasons.map((reason) => { const li = document.createElement('li'); li.textContent = reason; return li; }));
}

function renderEvidence(evidence, reads, elapsedMs) {
  $('score').textContent = evidence.score === null ? 'No visible' : `${evidence.score}${evidence.maxScore === null ? '' : ` / ${evidence.maxScore}`}`;
  $('duration').textContent = formatDuration(evidence.durationSeconds);
  $('result-status').textContent = evidence.resultStatus;
  $('activity-match').textContent = evidence.activityMatch;
  $('evidence-quality').textContent = evidence.evidenceQuality;
  $('finalization').textContent = evidence.finalizationDetected ? 'Detectada' : 'No detectada';
  $('latency').textContent = `${elapsedMs} ms · ${reads.length} pasadas · carga inicial ${workerStartupMs ?? '—'} ms`;
  renderDecision('strict', evidence.decisions.STRICT);
  renderDecision('context', evidence.decisions.CONTEXTUAL);
  $('identity-warning').hidden = evidence.activityMatch !== 'NO_COMPROBADA';
  $('ocr-passes').replaceChildren(...reads.map((reading) => {
    const article = document.createElement('article'); article.className = 'pass-read';
    const header = document.createElement('header');
    const name = document.createElement('span'); name.textContent = `${reading.pass} · ${reading.region}`;
    const meta = document.createElement('span'); meta.textContent = `PSM ${reading.psm} · confianza ${Number.isFinite(reading.confidence) ? `${reading.confidence.toFixed(1)} %` : '—'} · ${reading.elapsedMs} ms`;
    const pre = document.createElement('pre'); pre.textContent = reading.text.trim() || '(no se encontró texto legible)';
    header.append(name, meta); article.append(header, pre); return article;
  }));
  $('record-submission').disabled = false;
  $('result-panel').hidden = false;
}

async function reEvaluate() {
  if (!currentParsed) return;
  const config = activeActivityConfig();
  currentEvidence = evaluateEvidenceV3(currentParsed, config);
  renderEvidence(currentEvidence, currentReads, currentProcessing?.ocrMs ?? 0);
  $('record-feedback').textContent = 'La regla se actualizó para esta demo; la captura no se conserva fuera de esta pestaña.';
}

function safeCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function recordsJson() {
  return { dataset: 'SIMULADO; registros mantenidos solo en memoria', exportedAt: new Date().toISOString(), imageFilesStored: false, records };
}
function renderRecords() {
  $('records-body').replaceChildren(...records.map((record) => {
    const tr = document.createElement('tr');
    const cells = [
      record.student,
      `${record.activity} · ${record.resultStatus}`,
      formatRecordSummary(record),
      `${record.submissionStatus}${record.academicGrade === null ? ' · Pendiente' : ` · ${record.academicGrade}`}`,
      `${record.gradingPolicy} · ${record.verificationMode}`,
      record.receivedAt,
      record.warnings,
    ];
    for (let index = 0; index < cells.length; index++) { const td = document.createElement('td'); td.textContent = cells[index] ?? ''; if (index === 0) { const strong = document.createElement('strong'); strong.textContent = cells[index]; td.replaceChildren(strong); } tr.append(td); }
    return tr;
  }));
  $('records-count').textContent = `${records.length} filas · todo ficticio y temporal`;
}

function renderSavings() {
  const students = Math.max(0, Number($('students').value) || 0);
  const activities = Math.max(0, Number($('activities').value) || 0);
  const manualMinutes = Math.max(0, Number($('manual-minutes').value) || 0);
  const rate = Math.min(100, Math.max(0, Number($('automation-rate').value) || 0)) / 100;
  const exceptionMinutes = Math.max(0, Number($('exception-minutes').value) || 0);
  const total = students * activities;
  const manual = total * manualMinutes;
  const remaining = total * (1 - rate) * exceptionMinutes;
  const saved = Math.max(0, manual - remaining);
  const reduction = manual ? (saved / manual) * 100 : 0;
  const format = (minutes) => minutes >= 60 ? `${(minutes / 60).toFixed(1)} h` : `${minutes.toFixed(1)} min`;
  $('total-evidence').textContent = String(total); $('manual-time').textContent = format(manual); $('remaining-time').textContent = format(remaining); $('saved-time').textContent = format(saved); $('reduction').textContent = `${reduction.toFixed(1)} %`;
}

function setView(view) {
  const isStudent = view === 'student';
  $('student-view').hidden = !isStudent;
  $('admin-view').hidden = isStudent;
  $('view-student').classList.toggle('active', isStudent);
  $('view-admin').classList.toggle('active', !isStudent);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadExperimentalMetrics() {
  try {
    const response = await fetch('./resultados/metrics-v3.json');
    if (!response.ok) return;
    experimentalMetrics = await response.json();
    const real = experimentalMetrics.real.v3;
    const visibleScores = real.scoreAndMaximum.checks.filter((check) => check.expected[0] !== null);
    const visibleTimes = real.durationSeconds.checks.filter((check) => check.expected !== null);
    const positiveClosures = real.finalization.checks.filter((check) => check.expected === true);
    $('real-summary').textContent = `En 7 capturas: clasificación final/activa ${real.finalization.correct}/${real.finalization.total} (${positiveClosures.length} cierres positivos); puntuaciones visibles exactas ${visibleScores.filter((check) => check.correct).length}/${visibleScores.length}; tiempos visibles exactos ${visibleTimes.filter((check) => check.correct).length}/${visibleTimes.length}. Identidad objetivo confirmada ${experimentalMetrics.activityAssociation.confirmedTarget}/7. Candidatas contextuales: ${real.contextualCreditCandidates}/7; estricto: ${real.strictCredits}/7.`;
    const adv = experimentalMetrics.adversarialSynthetic;
    $('synthetic-summary').textContent = `${adv.total} fixtures sintéticos; ${adv.contextualMisattributions}/${adv.crossActivityCases} cruces invisibles se atribuirían al contexto: ${adv.contextualFalsePositiveCredits} créditos 1 falsos y ${adv.contextualWrongZeros} ceros equivocados. No son tasas de juego real.`;
  } catch { /* El flujo de carga OCR funciona aunque los resultados de benchmark aún no se generen. */ }
}

function csvContent() {
  const headers = ['Alumno demo', 'ID actividad', 'Actividad', 'Resultado reconocido', 'Puntuación', 'Máximo', 'Duración segundos', 'Estado de entrega', 'Calificación simulada', 'Regla', 'Modo', 'Coincidencia visual', 'Calidad evidencia', 'Recibida', 'Advertencias', 'Autenticidad verificada', 'Tipo de fila'];
  const rows = records.map((r) => [r.student, r.activityId ?? activity.id, r.activity, r.resultStatus, r.score ?? '', r.maxScore ?? '', r.durationSeconds ?? '', r.submissionStatus, r.academicGrade ?? 'Pendiente', r.gradingPolicy, r.verificationMode, r.activityMatch, r.evidenceQuality, r.receivedAt, r.warnings, false, 'DEMO']);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(safeCsvCell).join(';')).join('\r\n');
}

fileInput.addEventListener('change', () => showFile(fileInput.files?.[0]));
$('dropzone').addEventListener('dragover', (event) => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); showFile(event.dataTransfer?.files?.[0]); });
$('discard-image').addEventListener('click', discardImage);
$('new-evidence').addEventListener('click', discardImage);
$('view-student').addEventListener('click', () => setView('student'));
$('view-admin').addEventListener('click', () => setView('admin'));

$('show-embed').addEventListener('click', () => {
  const wrap = $('game-wrap');
  if (wrap.hidden) { $('game-frame').src = activity.embedUrl; wrap.hidden = false; $('show-embed').textContent = 'Ocultar juego'; }
  else { $('game-frame').removeAttribute('src'); wrap.hidden = true; $('show-embed').textContent = 'Ver juego aquí'; }
});

$('analyze').addEventListener('click', async () => {
  if (!selectedFile) return;
  $('analyze').disabled = true; $('progress').hidden = false; $('progress').textContent = 'Preparando captura local…'; $('result-panel').hidden = false;
  const image = new Image(); image.src = objectUrl;
  try {
    await image.decode();
    const activeWorker = await getWorker();
    const reads = []; let parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivityForActive(), policy: $('grading-policy').value });
    const start = performance.now(); let next = OCR_PASSES_V2[0];
    while (next && reads.length < OCR_PASSES_V2.length) {
      const bounds = cropBounds(image.naturalWidth, image.naturalHeight, next.region);
      const canvas = document.createElement('canvas'); canvas.width = bounds.width; canvas.height = bounds.height;
      canvas.getContext('2d').drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      await activeWorker.setParameters({ tessedit_pageseg_mode: psmMap[next.psm], tessedit_char_whitelist: '' });
      $('progress').textContent = `Revisando el resultado… pasada ${reads.length + 1} de máximo 5.`;
      const passStart = performance.now(); const { data } = await activeWorker.recognize(canvas); const elapsedMs = Math.round(performance.now() - passStart);
      reads.push({ pass: next.pass, region: next.region, psm: next.psm, confidence: data.confidence, text: data.text, elapsedMs });
      parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivityForActive(), policy: $('grading-policy').value });
      next = nextPassV3(reads, parsed, activeActivityConfig());
    }
    const ocrMs = Math.round(performance.now() - start);
    currentReads = reads; currentParsed = parsed;
    currentProcessing = { ocrMs, workerStartupMs, inputWidth: image.naturalWidth, inputHeight: image.naturalHeight, sourceFilename: selectedFile.name, imageSentToServer: false, imagePersisted: false };
    currentEvidence = evaluateEvidenceV3(parsed, activeActivityConfig());
    renderEvidence(currentEvidence, reads, ocrMs);
    $('progress').textContent = 'Listo. La captura permanece solo en esta pestaña hasta que la descartes.';
  } catch (error) {
    $('progress').textContent = `No se pudo leer la imagen: ${error.message}. Adjunta otra captura.`;
    $('result-status').textContent = 'DESCONOCIDO'; $('activity-match').textContent = 'NO_COMPROBADA'; $('evidence-quality').textContent = 'ILEGIBLE';
    $('strict-decision').textContent = 'REQUIERE_NUEVA_EVIDENCIA'; $('context-decision').textContent = 'REQUIERE_NUEVA_EVIDENCIA';
    $('record-submission').disabled = true;
  } finally { $('analyze').disabled = false; }
});

function parserActivityForActive() { return { title: activity.title, activityId: activity.resourceId }; }

for (const id of ['grading-policy', 'verification-mode', 'context-approved']) $(id).addEventListener('change', reEvaluate);
$('record-submission').addEventListener('click', () => {
  if (!currentEvidence || imageWasRecorded) return;
  const row = makeRecordV3(currentEvidence, $('student-id').value);
  records.unshift({ ...row, receivedAt: new Date().toLocaleString('es-MX') });
  imageWasRecorded = true; $('record-submission').disabled = true;
  $('record-feedback').textContent = `Se añadió ${row.submissionStatus} a la tabla en memoria. No se creó un cero cuando la actividad o evidencia quedaron sin comprobar.`;
  renderRecords();
});
$('export-csv').addEventListener('click', () => downloadBlob('optilab-entregas-demo.csv', csvContent(), 'text/csv;charset=utf-8'));
$('export-records-json').addEventListener('click', () => downloadBlob('optilab-entregas-demo.json', JSON.stringify(recordsJson(), null, 2), 'application/json'));
$('export-current-json').addEventListener('click', () => {
  if (!currentEvidence) return;
  downloadBlob('optilab-evidencia-ocr-v3.json', JSON.stringify({ ...currentEvidence, processing: currentProcessing, imageStored: false }, null, 2), 'application/json');
});
$('export-audit-json').addEventListener('click', async () => {
  if (!experimentalMetrics) { await loadExperimentalMetrics(); }
  downloadBlob('optilab-auditoria-v3.json', JSON.stringify({ metrics: experimentalMetrics, syntheticFixtures: './capturas/sinteticas-v3/manifest.json', realDataset: './capturas/descargas-wordwall-v2.json' }, null, 2), 'application/json');
});
for (const id of ['students','activities','manual-minutes','automation-rate','exception-minutes']) $(id).addEventListener('input', renderSavings);

const catalog = await catalogPromise;
activity = catalog.activities[0];
$('activity-title').textContent = activity.title;
$('open-game').href = activity.originalUrl;
$('context-approved').checked = activity.allowContextualEvidence;
$('verification-mode').value = activity.verificationMode;
renderRecords(); renderSavings(); loadExperimentalMetrics();
