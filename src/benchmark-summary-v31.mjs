function fieldResults(rows, referenceFn, actualFn) {
  const eligible = rows.filter((row) => referenceFn(row) !== null && referenceFn(row) !== undefined);
  const correct = eligible.filter((row) => JSON.stringify(referenceFn(row)) === JSON.stringify(actualFn(row))).length;
  return { correct, total: eligible.length };
}

function predictedFinalization(evidence) {
  if (evidence.finalizationStatus === 'FINALIZACION_CONFIRMADA') return true;
  if (evidence.finalizationStatus === 'FINALIZACION_NO_CONFIRMADA') return false;
  return null;
}

function latencyStats(rows) {
  const values = rows.map((row) => row.result.ocrMs).sort((a, b) => a - b);
  const median = values.length % 2
    ? values[(values.length - 1) / 2]
    : Math.round((values[values.length / 2 - 1] + values[values.length / 2]) / 2);
  return {
    mean: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    median,
    p95: values[Math.ceil(values.length * 0.95) - 1],
  };
}

export function summarizeBenchmark(rows, referenceFor) {
  const finalRows = rows.filter((row) => referenceFor(row.reference).finalization !== null);
  const classifiedFinalRows = finalRows.filter((row) => predictedFinalization(row.result.evidence) !== null);
  const finalization = {
    correct: classifiedFinalRows.filter((row) => predictedFinalization(row.result.evidence) === referenceFor(row.reference).finalization).length,
    total: finalRows.length,
    classified: classifiedFinalRows.length,
    indeterminateOutput: finalRows.length - classifiedFinalRows.length,
  };
  const score = fieldResults(rows, (row) => referenceFor(row.reference).score, (row) => [row.result.evidence.score, row.result.evidence.maxScore]);
  const time = fieldResults(rows, (row) => referenceFor(row.reference).durationSeconds, (row) => row.result.evidence.durationSeconds);
  const pieces = fieldResults(rows, (row) => referenceFor(row.reference).pieceCount, (row) => row.result.evidence.pieceCount);
  return {
    imageCount: rows.length,
    finalization,
    score,
    time,
    pieces,
    indeterminate: rows.filter((row) => row.result.evidence.resultStatus === 'INDETERMINADO').length,
    latency: latencyStats(rows),
    passCount: rows.reduce((sum, row) => sum + row.result.passCount, 0),
  };
}
