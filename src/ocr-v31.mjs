import { classifyEvidenceV31 } from './classifier-v31.mjs';
import { nextPassPlanV31 } from './plan-v31.mjs';
import { fitOcrDimensionsV31, OCR_LIMITS_V31 } from './image-sizing-v31.mjs';
import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
const { PSM } = Tesseract;

function makeCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function makeWideCrop(source) {
  const x = Math.round(source.width * 0.03);
  const y = Math.round(source.height * 0.05);
  const width = Math.max(1, Math.round(source.width * 0.94));
  const height = Math.max(1, Math.round(source.height * 0.90));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}
function makeCenterCrop(source) {
  const x = Math.round(source.width * 0.30);
  const y = Math.round(source.height * 0.22);
  const width = Math.max(1, Math.round(source.width * 0.40));
  const height = Math.max(1, Math.round(source.height * 0.56));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

/** Local OCR with no network/cache persistence and a strict two-pass default. */
export async function runAdaptiveOcrV31(worker, source, profiles, options = {}) {
  const limits = { ...OCR_LIMITS_V31, ...(options.limits ?? {}) };
  const dimensions = fitOcrDimensionsV31(source.naturalWidth ?? source.width, source.naturalHeight ?? source.height, limits);
  let base = makeCanvas(source, dimensions.width, dimensions.height);
  const readings = [];
  let evidence = classifyEvidenceV31(readings, { profiles, ...options });
  let ocrMs = 0;
  let plan = { pass: 'full-auto', region: 'full', psm: 'auto' };
  const passSummary = [];

  try {
    while (plan && readings.length < limits.maxPasses) {
      const input = plan.region === 'wide' ? makeWideCrop(base) : plan.region === 'center' ? makeCenterCrop(base) : base;
      await worker.setParameters({ tessedit_pageseg_mode: plan.psm === 'sparse' ? PSM.SPARSE_TEXT : PSM.AUTO, tessedit_char_whitelist: '' });
      const start = performance.now();
      let data;
      try { ({ data } = await worker.recognize(input)); }
      finally { if (input !== base) { input.width = 0; input.height = 0; } }
      const elapsedMs = Math.round(performance.now() - start);
      ocrMs += elapsedMs;
      const reading = { pass: plan.pass, region: plan.region, psm: plan.psm, confidence: data.confidence, text: data.text, elapsedMs };
      readings.push(reading);
      passSummary.push({ pass: reading.pass, region: reading.region, psm: reading.psm, confidence: reading.confidence, elapsedMs });
      evidence = classifyEvidenceV31(readings, { profiles, ...options });
      plan = nextPassPlanV31(readings, evidence, limits.maxPasses, dimensions);
    }
    const estimateCanvasBytes = dimensions.width * dimensions.height * 4;
    return {
      evidence, readings, ocrMs, passCount: readings.length,
      sourceWidth: source.naturalWidth ?? source.width,
      sourceHeight: source.naturalHeight ?? source.height,
      processedWidth: dimensions.width, processedHeight: dimensions.height, scaleFactor: dimensions.scale,
      estimatedWorkingCanvasMiB: Math.round(estimateCanvasBytes / (1024 * 1024) * 10) / 10,
      imageBytes: options.imageBytes ?? null,
      passes: passSummary,
      imageSentToServer: false,
      imagePersisted: false,
    };
  } finally {
    base.width = 0;
    base.height = 0;
  }
}
