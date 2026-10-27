import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import Tesseract from 'tesseract.js';
import { parseWordwallResultV2 } from './parser-v2.mjs';
import { evaluateEvidenceV3, nextPassV3 } from './engine-v3.mjs';
import { OCR_PASSES_V2 } from './ocr-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'resultados');
const realManifest = JSON.parse(await fs.readFile(path.join(root, 'capturas/descargas-wordwall-v2.json'), 'utf8'));
const syntheticManifest = JSON.parse(await fs.readFile(path.join(root, 'capturas/sinteticas-v3/manifest.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'capturas/catalog-v3.json'), 'utf8'));
const activity = catalog.activities[0];
const parserActivity = { title: activity.title, activityId: activity.resourceId };
const sourceDirectory = process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'Pruebas para ocr');
const { createWorker, PSM } = Tesseract;
const psmMap = { auto: PSM.AUTO, sparse: PSM.SPARSE_TEXT };
const startupStart = performance.now();
const worker = await createWorker(['spa', 'eng'], 1, { langPath: root, gzip: false, cacheMethod: 'none' });
const workerStartupMs = Math.round(performance.now() - startupStart);

async function runAdaptive(imagePath, expectedLabel, sourceBytesForHash = null, synthetic = false) {
  const reads = [];
  let parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivity, policy: activity.gradingPolicy });
  let next = OCR_PASSES_V2[0];
  let totalMs = 0;
  while (next && reads.length < OCR_PASSES_V2.length) {
    const cropDirectory = synthetic ? path.join(root, 'work/v3-synthetic-crops') : path.join(root, 'work/v2-crops');
    const passImagePath = next.region === 'full'
      ? imagePath
      : path.join(cropDirectory, `${path.parse(imagePath).name}-${next.region}.png`);
    await worker.setParameters({ tessedit_pageseg_mode: psmMap[next.psm], tessedit_char_whitelist: '' });
    const started = performance.now();
    const { data } = await worker.recognize(passImagePath);
    const elapsedMs = Math.round(performance.now() - started);
    totalMs += elapsedMs;
    reads.push({ pass: next.pass, region: next.region, psm: next.psm, confidence: data.confidence, text: data.text, elapsedMs });
    parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivity, policy: activity.gradingPolicy });
    next = nextPassV3(reads, parsed, activity);
  }
  const evidence = evaluateEvidenceV3(parsed, activity);
  return {
    ...(sourceBytesForHash ? { sourceSha256: crypto.createHash('sha256').update(sourceBytesForHash).digest('hex') } : {}),
    inputLabel: expectedLabel,
    ocrMs: totalMs,
    passCount: reads.length,
    readings: reads,
    parsed,
    evidence,
  };
}

const v2Run = JSON.parse(await fs.readFile(path.join(outDir, 'descargas-wordwall-v2.json'), 'utf8'));
const v2Metrics = JSON.parse(await fs.readFile(path.join(outDir, 'metrics-wordwall-v2.json'), 'utf8'));
const realRows = [];
for (const item of realManifest.images) {
  const imagePath = path.join(sourceDirectory, item.filename);
  const bytes = await fs.readFile(imagePath);
  const v3 = await runAdaptive(imagePath, item.visualLabel, bytes);
  const v2 = v2Run.images.find((row) => row.filename === item.filename);
  if (v2?.sourceSha256 !== v3.sourceSha256) throw new Error(`El hash cambió o no corresponde a la línea base V2: ${item.filename}`);
  realRows.push({ filename: item.filename, expected: item.expected, visualLabel: item.visualLabel, v2: { ocrMs: v2.v2.recognitionMs, parsed: v2.v2.parsed, passes: v2.v2.extractedTextByPass.length }, v3 });
  console.log(`REAL ${item.filename.slice(0, 9)}: V3 ${v3.ocrMs} ms, ${v3.passCount} pasadas, ${v3.evidence.activityMatch}, ${v3.evidence.decisions.CONTEXTUAL.decision}`);
}
await fs.rm(path.join(root, 'work/v2-crops'), { recursive: true, force: true });

const realOutPath = path.join(outDir, 'v3-real-wordwall.json');
await fs.writeFile(realOutPath, JSON.stringify({
  datasetType: 'CAPTURAS REALES Wordwall, siete originales leídos en modo solo lectura; no se duplican ni modifican.',
  generatedAt: new Date().toISOString(), engine: 'Tesseract.js 7.0.0', languages: ['spa', 'eng'], workerStartupMs,
  cropFilesRemovedAfterOcr: true, activity, rows: realRows,
}, null, 2) + '\n');

const syntheticRows = [];
for (const fixture of syntheticManifest.fixtures) {
  const imagePath = path.join(root, 'capturas/sinteticas-v3', fixture.filename);
  const bytes = await fs.readFile(imagePath);
  const v3 = await runAdaptive(imagePath, fixture.case, bytes, true);
  syntheticRows.push({ ...fixture, ...v3 });
  console.log(`SYNTHETIC ${fixture.filename}: ${v3.ocrMs} ms, ${v3.passCount} pasadas, strict=${v3.evidence.decisions.STRICT.decision}, contextual=${v3.evidence.decisions.CONTEXTUAL.decision}`);
}
const generic = syntheticRows.find((row) => row.filename === 'synthetic-generic-target.png');
const duplicate = syntheticRows.find((row) => row.filename === 'synthetic-generic-cross-game-duplicate.png');
const sameExactImage = generic.sourceSha256 === duplicate.sourceSha256;
const sameOcrText = JSON.stringify(generic.readings.map((x) => x.text)) === JSON.stringify(duplicate.readings.map((x) => x.text));
const crossActivityFixtures = syntheticRows.filter((row) => row.truth === 'other');
const contextualFalsePositives = crossActivityFixtures.filter((row) => row.evidence.decisions.CONTEXTUAL.decision === 'ACREDITABLE_SEGUN_POLITICA');
const contextualMisattributions = crossActivityFixtures.filter((row) => row.evidence.activityMatch === 'NO_COMPROBADA' && ['ACREDITABLE_SEGUN_POLITICA', 'NO_CUMPLE_CRITERIO'].includes(row.evidence.decisions.CONTEXTUAL.decision));
const adversarialPath = path.join(outDir, 'v3-adversarial-synthetic.json');
await fs.writeFile(adversarialPath, JSON.stringify({
  datasetType: syntheticManifest.datasetType,
  generatedAt: new Date().toISOString(), engine: 'Tesseract.js 7.0.0', workerStartupMs,
  fixturesAreRealStudentSubmissions: false,
  duplicateExperiment: { files: [generic.filename, duplicate.filename], byteIdentical: sameExactImage, identicalOcrReadings: sameOcrText, targetDecision: generic.evidence.decisions.CONTEXTUAL.decision, crossGameDecision: duplicate.evidence.decisions.CONTEXTUAL.decision, productStoresOrHashesLearnerImages: false, interpretation: 'La diferencia de actividad no es observable si los bytes y el contenido visual son iguales; el hash se calcula solo para validar este fixture sintético.' },
  crossActivity: { otherActivityFixtures: crossActivityFixtures.length, contextualMisattributions: contextualMisattributions.length, contextualFalsePositiveCredits: contextualFalsePositives.length, contextualWrongZeros: contextualMisattributions.filter((x) => x.evidence.decisions.CONTEXTUAL.academicGrade === 0).length, misattributedFiles: contextualMisattributions.map((x) => x.filename), strictCreditsAmongOtherActivities: crossActivityFixtures.filter((x) => x.evidence.decisions.STRICT.decision === 'ACREDITABLE_SEGUN_POLITICA').length },
  fixtures: syntheticRows,
}, null, 2) + '\n');

const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
function fieldMetric(rows, v, expected, actual) {
  const checks = rows.map((row) => ({ filename: row.filename, expected: expected(row), actual: actual(row), correct: exact(expected(row), actual(row)) }));
  return { correct: checks.filter((x) => x.correct).length, total: checks.length, checks };
}
const median = (values) => { const s = [...values].sort((a,b)=>a-b); return s.length ? (s.length % 2 ? s[(s.length-1)/2] : Math.round((s[s.length/2-1] + s[s.length/2])/2)) : null; };
const percentile = (values, p) => { const s = [...values].sort((a,b)=>a-b); return s.length ? s[Math.max(0, Math.ceil(p*s.length)-1)] : null; };
const avg = (values) => values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : null;
const v2field = (row) => row.v2.parsed;
const v3field = (row) => row.v3.parsed;
const metrics = {
  generatedAt: new Date().toISOString(), realCaptureCount: realRows.length, syntheticFixturesCount: syntheticRows.length,
  syntheticAndRealMetricsAreSeparate: true,
  activityAssociation: { confirmedTarget: realRows.filter((x) => x.v3.evidence.activityMatch === 'CONFIRMADA').length, contradictedOther: realRows.filter((x) => x.v3.evidence.activityMatch === 'CONTRADICHA').length, notProven: realRows.filter((x) => x.v3.evidence.activityMatch === 'NO_COMPROBADA').length },
  real: {
    v2: {
      finalization: v2Metrics.v2.finalization,
      scoreAndMaximum: v2Metrics.v2.scoreAndMaximum,
      durationSeconds: v2Metrics.v2.durationSeconds,
      latency: { ...v2Metrics.v2.latency, medianMs: median(v2Metrics.v2.latency.perImageMs), p95Ms: percentile(v2Metrics.v2.latency.perImageMs, .95), workerStartupMs: v2Metrics.workerStartupMs },
      strict: { accredited: realRows.filter((row)=>row.v2.parsed.decision==='ACREDITABLE').length, indeterminate: v2Metrics.v2.decisions.indeterminate },
    },
    v3: {
      finalization: fieldMetric(realRows, 'v3', (row)=>row.expected.finalization, (row)=>row.v3.parsed.finalization_detected),
      scoreAndMaximum: fieldMetric(realRows, 'v3', (row)=>[row.expected.score,row.expected.maxScore], (row)=>[row.v3.parsed.score,row.v3.parsed.max_score]),
      durationSeconds: fieldMetric(realRows, 'v3', (row)=>row.expected.durationSeconds, (row)=>row.v3.parsed.duration_seconds),
      strictDecisionCounts: Object.fromEntries([...new Set(realRows.map(row=>row.v3.evidence.decisions.STRICT.decision))].map(status=>[status,realRows.filter(row=>row.v3.evidence.decisions.STRICT.decision===status).length])),
      contextualDecisionCounts: Object.fromEntries([...new Set(realRows.map(row=>row.v3.evidence.decisions.CONTEXTUAL.decision))].map(status=>[status,realRows.filter(row=>row.v3.evidence.decisions.CONTEXTUAL.decision===status).length])),
      contextualCreditCandidates: realRows.filter(row=>row.v3.evidence.decisions.CONTEXTUAL.decision==='ACREDITABLE_SEGUN_POLITICA').length,
      strictCredits: realRows.filter(row=>row.v3.evidence.decisions.STRICT.decision==='ACREDITABLE_SEGUN_POLITICA').length,
      needsNewEvidence: realRows.filter(row=>['REQUIERE_NUEVA_EVIDENCIA','EVIDENCIA_DE_OTRA_ACTIVIDAD','PENDIENTE_REVISION'].includes(row.v3.evidence.decisions.CONTEXTUAL.decision)).length,
      latency: { runs: realRows.length, perImageMs: realRows.map((row)=>row.v3.ocrMs), meanMs: avg(realRows.map((row)=>row.v3.ocrMs)), medianMs: median(realRows.map((row)=>row.v3.ocrMs)), p95Ms: percentile(realRows.map((row)=>row.v3.ocrMs),.95), workerStartupMs },
      passCount: { perImage: realRows.map((row)=>({filename:row.filename,passes:row.v3.passCount})), total: realRows.reduce((sum,row)=>sum+row.v3.passCount,0) },
    },
  },
  adversarialSynthetic: { total: syntheticRows.length, crossActivityCases: crossActivityFixtures.length, contextualMisattributions: contextualMisattributions.length, contextualFalsePositiveCredits: contextualFalsePositives.length, contextualWrongZeros: contextualMisattributions.filter((x)=>x.evidence.decisions.CONTEXTUAL.academicGrade===0).length, duplicateByteIdentity: sameExactImage, duplicateCanBeDistinguishedWithoutVisualSignal: false, strictCreditsForCrossActivity: crossActivityFixtures.filter((x)=>x.evidence.decisions.STRICT.decision==='ACREDITABLE_SEGUN_POLITICA').length },
  caveat: 'Cero créditos falsos observados en siete capturas reales no es garantía. Los fixtures sintéticos muestran el riesgo de atribución del contexto cuando la identidad no aparece en la imagen.',
};
const metricsPath = path.join(outDir, 'metrics-v3.json');
await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2) + '\n');
await fs.rm(path.join(root, 'work/v3-synthetic-crops'), { recursive: true, force: true });
await worker.terminate();
console.log(`\nMétricas V3: ${metricsPath}\n` + JSON.stringify({ real: metrics.real.v3, adversarialSynthetic: metrics.adversarialSynthetic }, null, 2));
