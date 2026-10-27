import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import Tesseract from 'tesseract.js';
import { classifyEvidenceV31, CLASSIFICATION_V31 } from './classifier-v31.mjs';
import { nextPassPlanV31 } from './plan-v31.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(os.homedir(), 'Downloads', 'Pruebas para ocr');
const inventory = JSON.parse(await fs.readFile(path.join(root, 'capturas/inventario-v31.json'), 'utf8'));
const profiles = JSON.parse(await fs.readFile(path.join(root, 'capturas/perfiles-v31.json'), 'utf8'));
const synthetics = JSON.parse(await fs.readFile(path.join(root, 'capturas/sinteticas-v31/manifest.json'), 'utf8'));
const baseline = JSON.parse(await fs.readFile(path.join(root, 'resultados/v31-new-format-baseline-before-adjustment.json'), 'utf8'));
const regressionRows = inventory.files.filter((row) => row.eligibility === 'REGRESSION_WORDWALL');
const newRows = inventory.files.filter((row) => row.eligibility === 'NEW_HOLDOUT_OCR');
const realRows = [...regressionRows, ...newRows];
const psmMap = { auto: Tesseract.PSM.AUTO, sparse: Tesseract.PSM.SPARSE_TEXT };
const startupStart = performance.now();
const worker = await Tesseract.createWorker(['spa', 'eng'], 1, { langPath: root, gzip: false, cacheMethod: 'none' });
const workerStartupMs = Math.round(performance.now() - startupStart);

async function runFile(imagePath, label, group, expectedActivityTitle = null) {
  const bytes = await fs.readFile(imagePath);
  const reads = [];
  let evidence = classifyEvidenceV31(reads, { profiles, expectedActivityTitle, expectedActivityId: expectedActivityTitle ? '22610275' : null });
  let plan = { pass: 'full-auto', region: 'full', psm: 'auto' };
  let ocrMs = 0;
  while (plan && reads.length < 5) {
    const stem = path.parse(imagePath).name;
    const cropPath = plan.region === 'wide' ? path.join(root, 'work/v31-benchmark-crops', `${stem}-wide.png`) : plan.region === 'center' ? path.join(root, 'work/v31-benchmark-crops', `${stem}-center.png`) : path.join(root, 'work/v31-benchmark-crops', `${stem}-processed.png`);
    let imagePathForPass = cropPath;
    try { await fs.access(imagePathForPass); } catch { imagePathForPass = imagePath; }
    await worker.setParameters({ tessedit_pageseg_mode: psmMap[plan.psm], tessedit_char_whitelist: '' });
    const start = performance.now();
    const { data } = await worker.recognize(imagePathForPass);
    const elapsedMs = Math.round(performance.now() - start);
    ocrMs += elapsedMs;
    reads.push({ pass: plan.pass, region: plan.region, psm: plan.psm, confidence: data.confidence, text: data.text, elapsedMs });
    evidence = classifyEvidenceV31(reads, { profiles, expectedActivityTitle, expectedActivityId: expectedActivityTitle ? '22610275' : null });
    plan = nextPassPlanV31(reads, evidence, 5, label.dimensions);
  }
  const { sourcePath, ...reference } = label;
  return { filename: path.basename(imagePath), group, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ocrMs, passCount: reads.length, readings: reads, evidence, reference };
}

const real = [];
for (const row of realRows) {
  const isWordwall = row.eligibility === 'REGRESSION_WORDWALL';
  const imagePath = path.join(sourceDirectory, row.filename);
  const output = await runFile(imagePath, row, isWordwall ? 'WORDWALL_REGRESSION' : row.provider, isWordwall ? 'Método de M Grande' : null);
  real.push(output);
  console.log(`REAL ${output.filename.slice(0, 9)} (${output.group}) ${output.ocrMs} ms/${output.passCount} pasadas → ${output.evidence.templateType}/${output.evidence.finalizationStatus}`);
}

const synthetic = [];
for (const fixture of synthetics.fixtures.filter((row) => !row.resourceStressOnly)) {
  const imagePath = path.join(root, 'capturas/sinteticas-v31', fixture.filename);
  const output = await runFile(imagePath, fixture, 'SYNTHETIC');
  synthetic.push(output);
  console.log(`SYNTHETIC ${fixture.filename}: ${output.ocrMs} ms/${output.passCount} pasadas → ${output.evidence.templateType}/${output.evidence.finalizationStatus}`);
}

await worker.terminate();
await fs.rm(path.join(root, 'work/v31-benchmark-crops'), { recursive: true, force: true });

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    meanMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
    medianMs: sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : null,
    p95NearestRankMs: sorted.length ? sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)] : null,
    perImageMs: values,
  };
}
function finalizationMetrics(rows, labelFn, predictedFn) {
  const eligible = rows.filter((row) => labelFn(row) === true || labelFn(row) === false);
  let tp = 0, tn = 0, fp = 0, fn = 0, indeterminateOutput = 0;
  for (const row of eligible) {
    const expected = labelFn(row); const actual = predictedFn(row);
    if (actual === null || actual === undefined) { indeterminateOutput++; continue; }
    if (expected && actual) tp++;
    else if (!expected && !actual) tn++;
    else if (!expected && actual) fp++;
    else fn++;
  }
  return { correct: tp + tn, total: eligible.length, classified: eligible.length - indeterminateOutput, indeterminateOutput, truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn, indeterminateReferenceExcluded: rows.length - eligible.length };
}
function predictedFinalization(row) {
  if (row.evidence.finalizationStatus === CLASSIFICATION_V31.FINAL) return true;
  if (row.evidence.finalizationStatus === CLASSIFICATION_V31.NOT_FINAL) return false;
  return null;
}
function fieldMetric(rows, labelFn, valueFn) {
  const eligible = rows.filter((row) => labelFn(row) !== null && labelFn(row) !== undefined);
  const correct = eligible.filter((row) => JSON.stringify(labelFn(row)) === JSON.stringify(valueFn(row))).length;
  return { correct, total: eligible.length };
}
function referenceTemplate(row) {
  if (row.screenType === 'RESULTADO_DE_ROMPECABEZAS') return 'PUZZLE_COMPLETE';
  if (row.screenType === 'PANTALLA_FINAL_FELICITACION') return 'COMPLETION_ONLY';
  if (row.screenType === 'CONTADOR_O_PROGRESO_AMBIGUO') return 'UNKNOWN_LAYOUT';
  if (row.screenType === 'PARTIDA_ACTIVA') return 'PROGRESS_ONLY';
  if (row.screenType === 'RESULTADO_FINAL') return row.scoreMeaning === 'PUNTUACION_FINAL' ? 'SCORE_FINAL' : 'COMPLETION_ONLY';
  return null;
}
function summarizeReal(rows) {
  const timing = stats(rows.map((row) => row.ocrMs));
  const passCount = rows.reduce((sum, row) => sum + row.passCount, 0);
  return {
    imageCount: rows.length,
    labelledFinalization: finalizationMetrics(rows, (row) => {
      const ref = row.reference.finalizationReference;
      if (ref.startsWith('CONFIRMADA')) return true;
      if (ref === 'NO_CONFIRMADA') return false;
      return null;
    }, predictedFinalization),
    templateExact: fieldMetric(rows, (row) => referenceTemplate(row.reference), (row) => row.evidence.templateType),
    finalizationByTemplate: Object.fromEntries([...new Set(rows.map((row) => row.reference.screenType))].map((template) => [template, finalizationMetrics(rows.filter((row) => row.reference.screenType === template), (row) => {
      const ref = row.reference.finalizationReference;
      if (ref.startsWith('CONFIRMADA')) return true;
      if (ref === 'NO_CONFIRMADA') return false;
      return null;
    }, predictedFinalization)])),
    visibleFinalScores: fieldMetric(rows, (row) => row.reference.scoreMeaning === 'PUNTUACION_FINAL' ? [row.reference.score, row.reference.maxScore] : null, (row) => [row.evidence.score, row.evidence.maxScore]),
    visibleTimes: fieldMetric(rows, (row) => row.reference.durationSeconds, (row) => row.evidence.durationSeconds),
    visiblePieceCounts: fieldMetric(rows, (row) => row.reference.pieceCount, (row) => row.evidence.pieceCount),
    identityContradiction: { expectedOtherTitles: rows.filter((row) => row.reference.identityVisible).length, detected: rows.filter((row) => row.reference.identityVisible && row.evidence.identityMatch === 'CONTRADICHA').length },
    indeterminate: rows.filter((row) => row.evidence.resultStatus === CLASSIFICATION_V31.UNKNOWN).length,
    providerBreakdown: Object.fromEntries([...new Set(rows.map((row) => row.group))].map((group) => {
      const groupRows = rows.filter((row) => row.group === group);
      return [group, { count: groupRows.length, finalization: finalizationMetrics(groupRows, (row) => {
        const ref = row.reference.finalizationReference;
        if (ref.startsWith('CONFIRMADA')) return true;
        if (ref === 'NO_CONFIRMADA') return false;
        return null;
      }, predictedFinalization), scoreExact: fieldMetric(groupRows, (row) => row.reference.scoreMeaning === 'PUNTUACION_FINAL' ? [row.reference.score, row.reference.maxScore] : null, (row) => [row.evidence.score, row.evidence.maxScore]), timeExact: fieldMetric(groupRows, (row) => row.reference.durationSeconds, (row) => row.evidence.durationSeconds), piecesExact: fieldMetric(groupRows, (row) => row.reference.pieceCount, (row) => row.evidence.pieceCount) }];
    })),
    latency: timing,
    totalOcrPasses: passCount,
  };
}
function summarizeSynthetic(rows) {
  const labeled = rows.filter((row) => row.reference.expected.finalization !== null && row.reference.expected.finalization !== undefined);
  const finalization = finalizationMetrics(labeled, (row) => row.reference.expected.finalization, predictedFinalization);
  return {
    datasetType: synthetics.datasetType,
    accuracyFixtures: rows.length,
    finalization,
    templateTypes: Object.fromEntries([...new Set(rows.map((row) => row.reference.expected.templateType))].map((type) => [type, { count: rows.filter((row) => row.reference.expected.templateType === type).length, matched: rows.filter((row) => row.reference.expected.templateType === type && row.evidence.templateType === type).length }])),
    visibleScores: fieldMetric(rows, (row) => row.reference.expected.score === null ? null : [row.reference.expected.score, row.reference.expected.maxScore], (row) => [row.evidence.score, row.evidence.maxScore]),
    visibleTimes: fieldMetric(rows, (row) => row.reference.expected.durationSeconds, (row) => row.evidence.durationSeconds),
    visiblePieces: fieldMetric(rows, (row) => row.reference.expected.pieceCount, (row) => row.evidence.pieceCount),
    latency: stats(rows.map((row) => row.ocrMs)),
    totalOcrPasses: rows.reduce((sum, row) => sum + row.passCount, 0),
  };
}

const baselineByName = new Map(baseline.rows.map((row) => [row.filename, row]));
const baselineRows = newRows.map((label) => ({ reference: label, parsed: baselineByName.get(label.filename)?.parsed }));
const baselineNewFormat = {
  imageCount: baselineRows.length,
  finalization: finalizationMetrics(baselineRows, (row) => row.reference.finalizationReference.startsWith('CONFIRMADA') ? true : row.reference.finalizationReference === 'NO_CONFIRMADA' ? false : null, (row) => row.parsed.finalization_detected === true),
  visibleTimes: fieldMetric(baselineRows, (row) => row.reference.durationSeconds, (row) => row.parsed.duration_seconds),
  visiblePieces: fieldMetric(baselineRows, (row) => row.reference.pieceCount, () => null),
  latency: baseline.rows.map((row) => ({ filename: row.filename, ocrMs: row.ocrMs, passes: row.passCount })),
  note: 'Ejecución congelada con V3 antes de modificar reglas; cuatro capturas vistas para calibración después, por lo que el retest V3.1 no es validación independiente.',
};
const wordwallV3 = JSON.parse(await fs.readFile(path.join(root, 'resultados/metrics-v3.json'), 'utf8')).real.v3;
const wordwallV31 = summarizeReal(real.filter((row) => row.group === 'WORDWALL_REGRESSION'));
const output = {
  datasetType: 'Benchmark V3.1: Wordwall es regresión, cuatro capturas nuevas reales son calibración/holdout observado, sintéticos se mantienen separados.',
  generatedAt: new Date().toISOString(), engine: 'Tesseract.js 7.0.0', languages: ['spa', 'eng'], workerStartupMs,
  inventory: { sourceFiles: inventory.fileCount, uniqueImages: inventory.uniqueImageCount, selectedWordwallRegression: regressionRows.length, selectedNewReal: newRows.length, knownLearningAppsExcluded: inventory.files.filter((row) => row.eligibility === 'EXCLUDE_LEARNINGAPPS_EVENTS').length, ambiguousPossibleLearningAppsExcluded: inventory.files.filter((row) => row.eligibility === 'EXCLUDE_PROVIDER_AMBIGUOUS_POSSIBLE_LEARNINGAPPS').length, exactDuplicateExcluded: inventory.files.filter((row) => row.eligibility === 'DUPLICATE_NOT_INDEPENDENT').length },
  newFormatsBeforeAdjustment: baselineNewFormat,
  real: { all: summarizeReal(real), wordwallRegression: summarizeReal(real.filter((row) => row.group === 'WORDWALL_REGRESSION')), newObservedAfterCalibration: summarizeReal(real.filter((row) => row.group !== 'WORDWALL_REGRESSION')) },
  synthetic: summarizeSynthetic(synthetic),
  wordwallComparison: {
    v3: { finalization: `${wordwallV3.finalization.correct}/${wordwallV3.finalization.total}`, visibleScoreFieldsIncludingNoScore: `${wordwallV3.scoreAndMaximum.correct}/${wordwallV3.scoreAndMaximum.total}`, visibleDurationFieldsIncludingNoDuration: `${wordwallV3.durationSeconds.correct}/${wordwallV3.durationSeconds.total}`, latency: wordwallV3.latency, passes: wordwallV3.passCount.total },
    v31: { finalization: `${wordwallV31.labelledFinalization.correct}/${wordwallV31.labelledFinalization.total}`, visibleScores: `${wordwallV31.visibleFinalScores.correct}/${wordwallV31.visibleFinalScores.total}`, visibleTimes: `${wordwallV31.visibleTimes.correct}/${wordwallV31.visibleTimes.total}`, templates: `${wordwallV31.templateExact.correct}/${wordwallV31.templateExact.total}`, latency: wordwallV31.latency, passes: wordwallV31.totalOcrPasses },
  },
  mobile: { physicalIphoneTested: false, physicalAndroidTested: false, responsiveBrowserTest: 'Chrome in-app a 390×844 px, sin desbordamiento horizontal; no se usó un teléfono físico.', resourceEstimate: 'Canvas limitado a 2400 px de lado largo; 6000×4000 se reduce a 2400×1600, aprox. 14.6 MiB RGBA; el uso total de RAM no se midió.' },
  originalsModified: false, learningAppsOcrRun: false, learnerImagePersistence: false,
  rows: real,
  syntheticRows: synthetic,
};
const out = path.join(root, 'resultados/benchmark-v31.json');
await fs.writeFile(out, JSON.stringify(output, null, 2) + '\n');
console.log(`V3.1 benchmark: ${out}`);
