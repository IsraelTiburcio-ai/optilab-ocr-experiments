/** Most captures exit early; only unreadable, contradictory, or partial output uses the V2 focal pass sequence. */
export function nextPassPlanV31(readings, result, maxPasses = 5, dimensions = null) {
  if (readings.length >= maxPasses) return null;
  const allText = readings.map((reading) => reading.text ?? '').join('\n').trim();
  const unresolvedScore = result.dataInconsistent || result.scoreInconsistent || (result.finalizationStatus === 'FINALIZACION_CONFIRMADA' && result.scoreLabelObserved && result.score === null);
  if (result.finalizationStatus === 'FINALIZACION_CONFIRMADA' && !unresolvedScore) return null;
  if (result.templateType === 'FEEDBACK_ONLY' || result.templateType === 'PROGRESS_ONLY') return null;
  const normalized = allText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const completionCandidate = /felicidades|enhorabuena|congratulations|game complete|juego completado|has terminado|puzzle completed|rompecabezas completado/.test(normalized);
  const hasUsefulSignal = /game complete|juego completado|score|puntuacion|time|hora|tiempo|felicidades|enhorabuena|congratulations|puzzle completed|rompecabezas completado|numero\s+de\s+piezas|\d+\s*\/\s*\d+/.test(normalized);
  const noText = !allText;
  const lowConfidence = (result.averageOcrConfidence ?? 0) < 45;
  const recoverableLayout = result.templateType === 'UNKNOWN_LAYOUT' && (completionCandidate || !hasUsefulSignal);
  const pending = unresolvedScore || noText || lowConfidence || recoverableLayout;
  if (!pending) return null;
  const longestEdge = dimensions ? Math.max(dimensions.width ?? 0, dimensions.height ?? 0) : 0;
  const genericReadLimit = longestEdge >= 600 ? 3 : 2;
  if (!unresolvedScore && readings.length >= (completionCandidate ? 3 : genericReadLimit)) return null;
  const sequence = [
    { pass: 'full-sparse', region: 'full', psm: 'sparse' },
    { pass: 'center-auto', region: 'center', psm: 'auto' },
    { pass: 'center-sparse', region: 'center', psm: 'sparse' },
    { pass: 'wide-sparse', region: 'wide', psm: 'sparse' },
  ];
  return sequence[readings.length - 1] ?? null;
}
