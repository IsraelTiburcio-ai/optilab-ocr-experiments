export const TARGET_ACTIVITY = {
  provider: 'wordwall',
  activityId: '22610275',
  title: 'Método de M Grande',
};

const normalize = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function matchNumber(text, pattern) {
  const m = text.match(pattern);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function parseTime(text, labels) {
  const label = labels.join('|');
  const m = text.match(new RegExp(`(?:${label})\\s*[:\\-]?\\s*(\\d{1,2}):(\\d{2})`, 'i'));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function parseWordwallResult(ocrText, options = {}) {
  const raw = String(ocrText || '');
  const normalized = normalize(raw);
  const activityId = String(options.activityId ?? TARGET_ACTIVITY.activityId);
  const confidence = Number.isFinite(options.confidence) ? options.confidence : null;
  const reasons = [];

  const titleNeedle = normalize(TARGET_ACTIVITY.title);
  const activityRecognized = normalized.includes(titleNeedle) ? TARGET_ACTIVITY.title : null;

  let score = matchNumber(raw, /(?:puntuaci[oóeé]n|score)\s*[:：\-]?\s*(?:\n|\s){0,24}(\d{1,4})\b/i);
  if (score === null) score = matchNumber(raw, /puntuaci[oóeé]n[^\d]{0,8}(\d{1,4})\b/i);
  let scoreKind = score === null ? null : 'final_explicita';
  const liveCounter = raw.match(/[✓✔√☑]\s*(\d{1,4})\b/);
  if (score === null && liveCounter) {
    score = Number(liveCounter[1]);
    scoreKind = 'marcador_en_curso';
  }

  let correct = matchNumber(raw, /(?:aciertos?|respuestas?\s+correctas?|correct)\s*[:：\-]?\s*(\d{1,4})\b/i);
  const incorrect = matchNumber(raw, /(?:errores?|respuestas?\s+incorrectas?|incorrect)\s*[:：\-]?\s*(\d{1,4})\b/i);
  if (score === null && correct !== null) {
    score = correct;
    scoreKind = 'aciertos_explicitos';
  }

  let maxScore = matchNumber(raw, /(?:m[aá]ximo|max(?:imum)?|total\s+de\s+preguntas)\s*[:：\-]?\s*(\d{1,4})\b/i);
  const fraction = raw.match(/(?:puntuaci[oó]n|aciertos?|score|resultado)?\s*[:：]?\s*(\d{1,4})\s*(?:\/|de|of)\s*(\d{1,4})\b/i);
  if (fraction) {
    if (score === null) score = Number(fraction[1]);
    if (maxScore === null) maxScore = Number(fraction[2]);
    if (scoreKind === null) scoreKind = 'fraccion_explicita';
  }
  // Two explicitly labelled counts expose a denominator; a lone score never does.
  if (maxScore === null && correct !== null && incorrect !== null) maxScore = correct + incorrect;

  let percentage = matchNumber(raw, /(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (percentage === null && correct !== null && incorrect !== null && correct + incorrect > 0) {
    percentage = Math.round((correct / (correct + incorrect)) * 10000) / 100;
  }
  if (percentage === null && score !== null && maxScore !== null && maxScore > 0) {
    percentage = Math.round((score / maxScore) * 10000) / 100;
  }

  let durationSeconds = parseTime(raw, ['tiempo\\s+empleado', 'duraci[oó]n', 'elapsed\\s+time', 'time\\s+spent']);
  const timerMatch = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  const timerReadingSeconds = timerMatch ? Number(timerMatch[1]) * 60 + Number(timerMatch[2]) : null;

  const finished = /se\s+acabo\s+el\s+tiempo|fin\s+de\s+(?:la\s+)?actividad|actividad\s+completada|has\s+completado|completaste|game\s+over|you\s+finished|completed\s+activity/.test(normalized)
    ? true
    : (/\biniciar\b|\bverdadero\b|\bfalso\b/.test(normalized) && timerReadingSeconds === null ? false : (timerReadingSeconds !== null ? false : null));

  let feedback = null;
  if (/\bincorrecto\b|\bincorrect\b/.test(normalized)) feedback = 'incorrecto';
  else if (/\bcorrecto\b|\bcorrect\b/.test(normalized)) feedback = 'correcto';

  let decision = 'indeterminado';
  if (activityRecognized && normalize(activityRecognized) !== titleNeedle) {
    decision = 'no_acreditable';
    reasons.push('El título visible no coincide con la actividad objetivo.');
  } else if (finished !== true) {
    reasons.push('La imagen no muestra una señal clara de finalización.');
  } else if (confidence !== null && confidence < 70) {
    reasons.push('La confianza OCR está por debajo del umbral conservador de 70%.');
  } else if (percentage === 100 || (score !== null && maxScore !== null && score === maxScore && maxScore > 0)) {
    if (confidence !== null && confidence < 85) {
      reasons.push('La evidencia de perfección requiere confianza OCR de al menos 85%.');
    } else {
      decision = 'acreditable';
      reasons.push('Finalización y evidencia explícita de 100% o de puntuación igual al máximo.');
    }
  } else if ((percentage !== null && percentage < 100) || (score !== null && maxScore !== null && score < maxScore) || score === 0) {
    decision = 'no_acreditable';
    reasons.push('El resultado final muestra un porcentaje o una puntuación inferior al máximo; 0 puntos también descarta el criterio perfecto para esta actividad.');
  } else {
    reasons.push('La puntuación final visible no incluye el máximo; no se infiere un porcentaje desde un número aislado.');
  }

  if (activityRecognized === null) reasons.push('El título de la actividad no se reconoce en la captura.');
  if (finished === true && maxScore === null && percentage === null) reasons.push('Wordwall no muestra un denominador o porcentaje verificable en esta pantalla.');
  if (durationSeconds === null && timerReadingSeconds !== null) reasons.push('Se ve una lectura de temporizador; no se interpreta como duración de resolución.');
  if (feedback && finished !== true) reasons.push(`«${feedback}» es feedback de una respuesta y no acredita la finalización.`);

  return {
    provider: 'wordwall',
    activityId,
    activityRecognized,
    score,
    scoreKind,
    maxScore,
    percentage,
    correct,
    incorrect,
    durationSeconds,
    timerReadingSeconds,
    finished,
    feedback,
    decision,
    reasons,
    ocrConfidence: confidence,
    authenticityVerified: false,
  };
}
