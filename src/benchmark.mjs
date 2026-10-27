import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createWorker, PSM } from 'tesseract.js';
import { parseWordwallResult } from './parser.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'capturas/manifest.json'), 'utf8'));
const resultsDir = path.join(root, 'resultados');
await fs.mkdir(resultsDir, { recursive: true });
const langArgs = { spa: 'spa', eng: 'eng', 'spa+eng': ['spa', 'eng'] };
const psmArgs = { auto: PSM.AUTO, sparse: PSM.SPARSE_TEXT, block: PSM.SINGLE_BLOCK, line: PSM.SINGLE_LINE };
const workerLoads = [];
let activeWorker = null;
let activeLanguage = null;
let activeStartup = null;

async function useWorker(language) {
  if (activeWorker && activeLanguage === language) return activeWorker;
  if (activeWorker) await activeWorker.terminate();
  activeWorker = null;
  activeLanguage = language;
  const started = performance.now();
  activeWorker = await createWorker(langArgs[language], 1);
  activeStartup = Math.round(performance.now() - started);
  workerLoads.push({ language, startupMs: activeStartup, measuredAt: new Date().toISOString() });
  return activeWorker;
}

async function runOne({ image, category, language = 'spa+eng', psm = 'auto', replicate, region = 'full', whitelist = null }) {
  const worker = await useWorker(language);
  await worker.setParameters({
    tessedit_pageseg_mode: psmArgs[psm],
    ...(whitelist ? { tessedit_char_whitelist: whitelist } : { tessedit_char_whitelist: '' }),
  });
  const filePath = path.join(root, image);
  const start = performance.now();
  const recognized = await worker.recognize(filePath);
  const recognitionMs = Math.round(performance.now() - start);
  const data = recognized.data;
  const parsed = parseWordwallResult(data.text, { confidence: data.confidence, activityId: '22610275' });
  return {
    image,
    category,
    sourceCaptureId: manifest.images.find((item) => item.filename === image)?.sourceCaptureId ?? null,
    config: { language, psm, region, whitelist: Boolean(whitelist) },
    replicate,
    workerStartupMs: activeStartup,
    recognitionMs,
    confidence: data.confidence,
    rawText: data.text,
    parsed,
  };
}

const baseline = [];
for (const item of manifest.images) {
  for (let replicate = 1; replicate <= 3; replicate++) {
    baseline.push(await runOne({ image: item.filename, category: item.category, replicate }));
  }
}
await fs.writeFile(path.join(resultsDir, 'ocr-baseline.json'), JSON.stringify({ engine: 'Tesseract.js 7.0.0', enginePath: 'local npm package; images read from local disk', languages: ['spa','eng'], psm: 'AUTO (3)', repsPerImage: 3, workerLoads: [...workerLoads], runs: baseline }, null, 2) + '\n');

const ablation = [];
const langImages = [
  'capturas/originales/wordwall-embed-inicio.png',
  'capturas/originales/wordwall-feedback-correcto.png',
  'capturas/originales/wordwall-error-feedback.png',
  'capturas/originales/wordwall-fin-por-tiempo-puntuacion-3.png',
];
for (const language of ['spa','eng','spa+eng']) {
  for (const image of langImages) {
    for (let replicate=1; replicate<=3; replicate++) ablation.push(await runOne({ image, category:'original', language, psm:'auto', replicate, region:'full' }));
  }
}
const regionPairs = [
  ['capturas/originales/wordwall-fin-por-tiempo-puntuacion-3.png','full'],
  ['capturas/variantes/v10-final3-recorte-centro.png','central-crop'],
  ['capturas/originales/wordwall-resultado-ronda-1.png','full'],
  ['capturas/variantes/v13-final0-recorte-centro.png','central-crop'],
];
for (const [image, region] of regionPairs) {
  for (const psm of ['auto','sparse','block','line']) {
    for (let replicate=1; replicate<=3; replicate++) ablation.push(await runOne({ image, category: image.includes('/variantes/') ? 'variant' : 'original', language:'spa+eng', psm, replicate, region }));
  }
}
for (const image of ['capturas/variantes/v10-final3-recorte-centro.png','capturas/variantes/v13-final0-recorte-centro.png']) {
  for (let replicate=1; replicate<=3; replicate++) ablation.push(await runOne({ image, category:'variant', language:'spa+eng', psm:'block', replicate, region:'central-crop-numeric-whitelist', whitelist:'0123456789%:/' }));
}
await fs.writeFile(path.join(resultsDir, 'ocr-ablation.json'), JSON.stringify({ engine:'Tesseract.js 7.0.0', experiments: { languageComparison: langImages, fullVsRegion: regionPairs, psmValues: psmArgs, numericWhitelist: '0123456789%:/' }, workerLoads: [...workerLoads], runs: ablation }, null, 2) + '\n');
await activeWorker?.terminate();

const byFilename = new Map();
for (const row of baseline) {
  if (!byFilename.has(row.image)) byFilename.set(row.image, []);
  byFilename.get(row.image).push(row);
}
function majority(values) {
  const counts = new Map();
  for (const value of values) counts.set(JSON.stringify(value), (counts.get(JSON.stringify(value)) ?? 0) + 1);
  const winner = [...counts.entries()].sort((a,b) => b[1]-a[1])[0];
  return winner ? JSON.parse(winner[0]) : null;
}
function exact(field, expectedField = field) {
  const items = manifest.images.filter((item) => item.category === 'original' && item.reference[expectedField] !== null && item.reference[expectedField] !== undefined);
  const unique = new Map(items.map((item) => [item.sha256, item]));
  const checks = [...unique.values()].map((item) => {
    const rows = byFilename.get(item.filename) ?? [];
    const predicted = majority(rows.map((row) => row.parsed[field]));
    const expected = item.reference[expectedField];
    return { image:item.filename, expected, predicted, correct:JSON.stringify(predicted)===JSON.stringify(expected) };
  });
  return { correct:checks.filter((x)=>x.correct).length, total:checks.length, accuracy:checks.length ? checks.filter((x)=>x.correct).length/checks.length : null, checks };
}
const originalUnique = new Map(manifest.images.filter((i)=>i.category==='original').map((i)=>[i.sha256,i]));
const classificationChecks = [...originalUnique.values()].map((item) => {
  const rows=byFilename.get(item.filename) ?? [];
  const predicted=majority(rows.map((r)=>r.parsed.decision));
  return { image:item.filename, expected:item.reference.decision, predicted, correct:predicted===item.reference.decision, sourceCaptureId:item.sourceCaptureId };
});
const classifications = classificationChecks.reduce((acc,x)=>{acc[x.predicted]=(acc[x.predicted]??0)+1; return acc;},{});
const fp=classificationChecks.filter(x=>x.predicted==='acreditable'&&x.expected!=='acreditable');
const tp=classificationChecks.filter(x=>x.expected==='acreditable');
const times=baseline.map(x=>x.recognitionMs).sort((a,b)=>a-b);
const percentile=(p)=>times.length?times[Math.min(times.length-1,Math.ceil(p*times.length)-1)]:null;
const stable = [...byFilename.entries()].map(([image,rows])=>({image, stable: new Set(rows.map(r=>JSON.stringify({score:r.parsed.score, maxScore:r.parsed.maxScore, finished:r.parsed.finished, decision:r.parsed.decision}))).size===1}));
const maxLabeled = manifest.images.filter(i=>i.reference.maxScore!==null).length;
const metrics = {
  generatedAt:new Date().toISOString(),
  engine:'Tesseract.js 7.0.0',
  dataset:{images:manifest.images.length, originals:manifest.images.filter(i=>i.category==='original').length, variants:manifest.images.filter(i=>i.category==='variant').length, exactUniqueHashes:new Set(manifest.images.map(i=>i.sha256)).size, uniqueOriginalCaptureHashes:originalUnique.size, baselineRepetitions:3, baselineRuns:baseline.length, variantsCountedAsIndependent:false},
  workerLoads,
  fields:{
    activityTitle:exact('activityRecognized'),
    score:exact('score'),
    finished:exact('finished'),
    timerRemainingSeconds:exact('timerReadingSeconds','timerRemainingSeconds'),
    maxScore:{accuracy:null, labeledCases:maxLabeled, recognizedCases:baseline.filter(r=>r.parsed.maxScore!==null).length, note:'Ninguna captura de referencia muestra un máximo; exactitud de reconocimiento no estimable.'},
    durationSeconds:{accuracy:null, labeledCases:0, recognizedCases:baseline.filter(r=>r.parsed.durationSeconds!==null).length, note:'Las capturas en curso muestran cuenta regresiva; ninguna muestra tiempo de resolución.'},
  },
  classification:{correct:classificationChecks.filter(x=>x.correct).length,total:classificationChecks.length,accuracy:classificationChecks.length?classificationChecks.filter(x=>x.correct).length/classificationChecks.length:null,counts:classifications, falsePositives:fp, falseNegativePerfectCases:tp.length?classificationChecks.filter(x=>x.expected==='acreditable'&&x.predicted!=='acreditable'):null, perfectGroundTruthCases:tp.length, indeterminate:classificationChecks.filter(x=>x.predicted==='indeterminado').length, checks:classificationChecks},
  repeatStability:{stableImages:stable.filter(x=>x.stable).length,totalImages:stable.length,accuracy:stable.filter(x=>x.stable).length/stable.length,checks:stable},
  runtime:{runs:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,medianMs:percentile(.5),p95Ms:percentile(.95),minMs:times[0]??null,maxMs:times.at(-1)??null,workerStartupMsByLoad:workerLoads.map(x=>({language:x.language,startupMs:x.startupMs}))},
};
await fs.writeFile(path.join(resultsDir, 'metrics.json'), JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({dataset:metrics.dataset, workerLoads:metrics.workerLoads, fields:{activityTitle:metrics.fields.activityTitle.accuracy,score:metrics.fields.score.accuracy,finished:metrics.fields.finished.accuracy,timer:metrics.fields.timerRemainingSeconds.accuracy},classification:metrics.classification,runtime:metrics.runtime},null,2));
