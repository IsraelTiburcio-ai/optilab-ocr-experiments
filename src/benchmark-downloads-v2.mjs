import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import Tesseract from 'tesseract.js';
import { parseWordwallResult } from './parser.mjs';
import { parseWordwallResultV2 } from './parser-v2.mjs';
import { OCR_PASSES_V2, plannedPassesV2 } from './ocr-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'capturas/descargas-wordwall-v2.json'), 'utf8'));
const sourceDir = process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'Pruebas para ocr');
const outputPath = path.join(root, 'resultados/descargas-wordwall-v2.json');
const resultsDir = path.dirname(outputPath);
await fs.mkdir(resultsDir, { recursive: true });
const { createWorker, PSM } = Tesseract;
const psm = { auto: PSM.AUTO, sparse: PSM.SPARSE_TEXT };
const workerLoads = [];
const startup = performance.now();
const worker = await createWorker(['spa', 'eng'], 1, { langPath: root, gzip: false, cacheMethod: 'none' });
workerLoads.push({ languages: ['spa', 'eng'], startupMs: Math.round(performance.now() - startup), modelSource: 'traineddata local incluido en el experimento' });

const output = [];
for (const item of manifest.images) {
  const sourcePath = path.join(sourceDir, item.filename);
  const sourceBytes = await fs.readFile(sourcePath);
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const v1ReadStart = performance.now();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
  const v1Recognized = await worker.recognize(sourceBytes);
  const v1ElapsedMs = Math.round(performance.now() - v1ReadStart);
  const v1 = parseWordwallResult(v1Recognized.data.text, { confidence: v1Recognized.data.confidence, activityId: manifest.targetActivity.activityId });
  const reads = [];
  let v2 = parseWordwallResultV2(reads, { configuredActivity: manifest.targetActivity });
  let v2ElapsedMs = 0;
  for (const candidate of OCR_PASSES_V2) {
    if (candidate.pass !== 'full-auto' && !plannedPassesV2(reads, v2).some((next) => next.pass === candidate.pass)) continue;
    const imagePath = candidate.region === 'full'
      ? sourcePath
      : path.join(root, 'work/v2-crops', `${path.parse(item.filename).name}-${candidate.region}.png`);
    const passStart = performance.now();
    await worker.setParameters({ tessedit_pageseg_mode: psm[candidate.psm], tessedit_char_whitelist: '' });
    const recognized = await worker.recognize(imagePath);
    const elapsedMs = Math.round(performance.now() - passStart);
    v2ElapsedMs += elapsedMs;
    reads.push({
      pass: candidate.pass,
      region: candidate.region,
      regionLabel: candidate.region === 'full' ? 'Captura completa' : candidate.region === 'center' ? 'Tarjeta central 40 % × 56 %' : 'Zona ampliada 70 % × 80 %',
      psm: candidate.psm,
      confidence: recognized.data.confidence,
      text: recognized.data.text,
      elapsedMs,
    });
    v2 = parseWordwallResultV2(reads, { configuredActivity: manifest.targetActivity });
    if (plannedPassesV2(reads, v2).length === 0) break;
  }
  output.push({
    filename: item.filename,
    sourceSha256,
    visualLabel: item.visualLabel,
    expected: item.expected,
    v1: { recognitionMs: v1ElapsedMs, confidence: v1Recognized.data.confidence, extractedText: v1Recognized.data.text, parsed: v1 },
    v2: { recognitionMs: v2ElapsedMs, passes: reads.length, extractedTextByPass: reads, parsed: v2 },
  });
  console.log(`${item.filename.slice(0, 9)}: V1 ${v1ElapsedMs}ms; V2 ${v2ElapsedMs}ms / ${reads.length} pasadas`);
}
await worker.terminate();
await fs.rm(path.join(root, 'work/v2-crops'), { recursive: true, force: true });
await fs.writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(), engine: 'Tesseract.js 7.0.0',
  sourceImagesReadOnly: true, originalImagesCopiedToExperiment: false, temporaryCropsRemovedAfterOcr: true, workerLoads,
  targetActivity: manifest.targetActivity,
  notes: ['Las etiquetas son inspección visual manual, no inferencia OCR.', 'Pasadas con motor e imagen comunes no son muestras estadísticas independientes.', 'Los resultados sintéticos se prueban por separado.'],
  images: output,
}, null, 2) + '\n');

const normalizeDecision = (value) => ({ acreditable: 'ACREDITABLE', no_acreditable: 'NO_ACREDITABLE', indeterminado: 'INDETERMINADO' }[value] ?? value);
const exactValue = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
function metricFor(expected, actual) {
  const checks = output.map((item) => ({ filename: item.filename, expected: expected(item), actual: actual(item), correct: exactValue(actual(item), expected(item)) }));
  return { correct: checks.filter((x) => x.correct).length, total: checks.length, checks };
}
const metrics = {};
for (const version of ['v1', 'v2']) {
  const fractions = metricFor(
    (item) => [item.expected.score, item.expected.maxScore],
    (item) => version === 'v1' ? [item.v1.parsed.score, item.v1.parsed.maxScore] : [item.v2.parsed.score, item.v2.parsed.max_score],
  );
  const completion = metricFor((item) => item.expected.finalization, (item) => version === 'v1' ? item.v1.parsed.finished === true : item.v2.parsed.finalization_detected);
  const duration = metricFor((item) => item.expected.durationSeconds, (item) => version === 'v1' ? item.v1.parsed.durationSeconds : item.v2.parsed.duration_seconds);
  const decisions = output.map((item) => {
    const actual = normalizeDecision(item[version].parsed.decision);
    const expected = item.expected.activityMatch === false ? 'NO_ACREDITABLE' : 'INDETERMINADO';
    return { filename: item.filename, expected, actual, correct: expected === actual };
  });
  const times = output.map((item) => item[version].recognitionMs);
  metrics[version] = {
    finalization: completion,
    scoreAndMaximum: { ...fractions, scoreBearingOriginals: output.filter((x) => x.expected.score !== null).length, exactOnScoreBearing: fractions.checks.filter((x) => x.expected[0] !== null && x.correct).length },
    durationSeconds: duration,
    decisions: { correct: decisions.filter((x) => x.correct).length, total: decisions.length, indeterminate: decisions.filter((x) => x.actual === 'INDETERMINADO').length, falsePositives: decisions.filter((x) => x.actual === 'ACREDITABLE' && x.expected !== 'ACREDITABLE').length, checks: decisions },
    latency: { runs: times.length, meanMs: average(times), perImageMs: times },
  };
}
const metricsPath = path.join(resultsDir, 'metrics-wordwall-v2.json');
await fs.writeFile(metricsPath, JSON.stringify({
  generatedAt: new Date().toISOString(), datasetImages: output.length,
  labels: 'Inspección visual manual; actividad coincidente solo se marca false para la captura que evidencia otro título, null cuando no se reconoce el recurso objetivo.',
  decisionScoring: 'Otra actividad es NO_ACREDITABLE para el recurso objetivo. Las otras seis son INDETERMINADO porque no demuestran visualmente ser el recurso 22610275.',
  syntheticTestsIncluded: false, workerStartupMs: workerLoads[0].startupMs,
  v1: metrics.v1, v2: metrics.v2,
  falsePositiveRateMeasurable: false,
  falsePositiveRateReason: 'No hay ejemplos positivos de identidad objetivo conocida; el conjunto no permite estimar una tasa estadística de falsos positivos.',
}, null, 2) + '\n');
console.log(`\nResultados: ${outputPath}\nMétricas: ${metricsPath}\n` + JSON.stringify(metrics, null, 2));
