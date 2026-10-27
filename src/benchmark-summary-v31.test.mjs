import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBenchmark } from './benchmark-summary-v31.mjs';

test('benchmark summary uses nested OCR results, counts classified finalization and abstentions, and excludes unknown reference labels', () => {
  const rows = [
    { reference: { finalization: true, score: [14, 14], durationSeconds: 67, pieceCount: null }, result: { ocrMs: 100, passCount: 1, evidence: { finalizationStatus: 'FINALIZACION_CONFIRMADA', resultStatus: 'FINALIZACION_CONFIRMADA', score: 14, maxScore: 14, durationSeconds: 67, pieceCount: null } } },
    { reference: { finalization: false, score: null, durationSeconds: null, pieceCount: null }, result: { ocrMs: 200, passCount: 2, evidence: { finalizationStatus: 'FINALIZACION_NO_CONFIRMADA', resultStatus: 'PARTIDA_ACTIVA', score: null, maxScore: null, durationSeconds: null, pieceCount: null } } },
    { reference: { finalization: true, score: null, durationSeconds: null, pieceCount: 28 }, result: { ocrMs: 300, passCount: 1, evidence: { finalizationStatus: 'INDETERMINADO', resultStatus: 'INDETERMINADO', score: null, maxScore: null, durationSeconds: null, pieceCount: 28 } } },
    { reference: { finalization: null, score: null, durationSeconds: null, pieceCount: null }, result: { ocrMs: 400, passCount: 3, evidence: { finalizationStatus: 'FINALIZACION_CONFIRMADA', resultStatus: 'FINALIZACION_CONFIRMADA', score: null, maxScore: null, durationSeconds: null, pieceCount: null } } },
  ];

  const summary = summarizeBenchmark(rows, (reference) => reference);
  assert.deepEqual(summary.finalization, { correct: 2, total: 3, classified: 2, indeterminateOutput: 1 });
  assert.deepEqual(summary.score, { correct: 1, total: 1 });
  assert.deepEqual(summary.time, { correct: 1, total: 1 });
  assert.deepEqual(summary.pieces, { correct: 1, total: 1 });
  assert.equal(summary.indeterminate, 1);
  assert.deepEqual(summary.latency, { mean: 250, median: 250, p95: 400 });
  assert.equal(summary.passCount, 7);
});
