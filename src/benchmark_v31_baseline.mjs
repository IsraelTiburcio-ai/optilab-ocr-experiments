import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import Tesseract from 'tesseract.js';
import { parseWordwallResultV2 } from './parser-v2.mjs';
import { evaluateEvidenceV3, nextPassV3 } from './engine-v3.mjs';
import { OCR_PASSES_V2 } from './ocr-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(os.homedir(), 'Downloads', 'Pruebas para ocr');
const inventory = JSON.parse(await fs.readFile(path.join(root, 'capturas/inventario-v31.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'capturas/catalog-v3.json'), 'utf8'));
const activity = { ...catalog.activities[0], verificationMode: 'STRICT', allowContextualEvidence: false };
const parserActivity = { title: activity.title, activityId: activity.resourceId };
const selected = inventory.files.filter((row) => row.eligibility === 'NEW_HOLDOUT_OCR');
const psmMap = { auto: Tesseract.PSM.AUTO, sparse: Tesseract.PSM.SPARSE_TEXT };
const startupStart = performance.now();
const worker = await Tesseract.createWorker(['spa', 'eng'], 1, { langPath: root, gzip: false, cacheMethod: 'none' });
const workerStartupMs = Math.round(performance.now() - startupStart);
const rows = [];

for (const label of selected) {
  const imagePath = path.join(sourceDirectory, label.filename);
  const bytes = await fs.readFile(imagePath);
  const reads = [];
  let parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivity });
  let next = OCR_PASSES_V2[0];
  let ocrMs = 0;
  while (next && reads.length < OCR_PASSES_V2.length) {
    const passImage = next.region === 'full' ? imagePath : path.join(root, 'work/v31-baseline-crops', `${path.parse(imagePath).name}-${next.region}.png`);
    await worker.setParameters({ tessedit_pageseg_mode: psmMap[next.psm], tessedit_char_whitelist: '' });
    const start = performance.now();
    const { data } = await worker.recognize(passImage);
    const elapsedMs = Math.round(performance.now() - start);
    ocrMs += elapsedMs;
    reads.push({ pass: next.pass, region: next.region, psm: next.psm, confidence: data.confidence, text: data.text, elapsedMs });
    parsed = parseWordwallResultV2(reads, { configuredActivity: parserActivity });
    next = nextPassV3(reads, parsed, activity);
  }
  const evidence = evaluateEvidenceV3(parsed, activity);
  rows.push({ filename: label.filename, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), visualReference: label, ocrMs, passCount: reads.length, readings: reads, parsed, existingV3Interpretation: evidence });
  console.log(`${label.filename.slice(0, 9)} ${ocrMs} ms; ${reads.length} pasadas; final=${parsed.finalization_detected}; score=${parsed.score}/${parsed.max_score}; duration=${parsed.duration_seconds}`);
}
await worker.terminate();
await fs.rm(path.join(root, 'work/v31-baseline-crops'), { recursive: true, force: true });
const output = {
  datasetType: 'CAPTURAS REALES NUEVAS; conjunto holdout OCR V3.1 antes de ajustes; LearningApps excluido; etiquetas visuales independientes.',
  generatedAt: new Date().toISOString(), engine: 'Tesseract.js 7.0.0', languages: ['spa', 'eng'], workerStartupMs,
  preV31RulesChanged: true, v31AdjustmentsApplied: false, count: rows.length, rows,
};
const outPath = path.join(root, 'resultados/v31-new-format-baseline-before-adjustment.json');
await fs.writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Baseline V3 (sin ajustes): ${outPath}`);
