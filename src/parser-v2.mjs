export const TARGET_ACTIVITY_V2 = {
  provider: 'wordwall',
  activityId: '22610275',
  title: 'Método de M Grande',
};

export const ACADEMIC_POLICIES = {
  PERFECT_SCORE: 'PUNTUACION_PERFECTA',
  ACTIVITY_COMPLETED: 'ACTIVIDAD_COMPLETADA',
};

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const successfulCompletionPattern = /\bgame\s+complete(?:d)?\b|\bjuego\s+completado\b|\bactividad\s+completada\b|\bhas\s+completado\b|\bcompletaste\b|\byou\s+(?:have\s+)?completed\b|\byou\s+finished\b|\bcompleted\s+activity\b/;
const timeoutPattern = /\bse\s+acabo\s+el\s+tiempo\b|\btime\s*(?:is\s*)?up\b/;
const otherEndPattern = /\bgame\s+over\b|\bactividad\s+terminada\b|\bfin\s+de\s+(?:la\s+)?actividad\b/;
const scoreLabelPattern = /\b(?:score|puntuaci[oóo0]n|aciertos?|respuestas?\s+correctas?|correct\s+answers?)\b/i;

function completionFor(text) {
  const normalized = normalize(text);
  const success = successfulCompletionPattern.test(normalized);
  const timeout = timeoutPattern.test(normalized);
  const otherEnd = otherEndPattern.test(normalized);
  return {
    finalizationDetected: success || timeout || otherEnd,
    successfulCompletionDetected: success ? true : timeout ? false : otherEnd ? null : null,
    reason: success ? 'frase explícita de juego/actividad completada'
      : timeout ? 'fin por tiempo; finaliza, pero no expresa éxito'
        : otherEnd ? 'frase de fin sin evidencia explícita de éxito' : null,
  };
}

function detectActivity(text, configuredActivity) {
  const normalized = normalize(text);
  const configuredTitle = normalize(configuredActivity?.title ?? '');
  if (configuredTitle && normalized.includes(configuredTitle)) {
    return { title: configuredActivity.title, id: configuredActivity.activityId ?? null, matched: true, source: 'texto OCR exacto del título configurado' };
  }
  if (configuredActivity?.activityId && new RegExp(`\\b${String(configuredActivity.activityId)}\\b`).test(normalized)) {
    return { title: configuredActivity.title ?? null, id: String(configuredActivity.activityId), matched: true, source: 'identificador exacto del recurso visible en el OCR' };
  }

  if (/caracteristicas\s+del\s+m\.?\s*p\.?\s*l\.?\b/.test(normalized)) {
    return { title: 'Características del M.P.L.', id: null, matched: false, source: 'título alternativo visible en el OCR' };
  }

  return { title: null, id: null, matched: null, source: null };
}

function findFractions(text) {
  const raw = String(text ?? '');
  const hasScoreContext = scoreLabelPattern.test(raw);
  const hasCompletionContext = successfulCompletionPattern.test(normalize(raw));
  const hasStandaloneFraction = raw.split(/\r?\n/).some((line) => /^\s*\d{1,4}\s*\/\s*\d{1,4}\s*$/.test(line));
  if (!hasScoreContext && !hasCompletionContext && !hasStandaloneFraction) return [];
  const fractions = [];
  const pattern = /(?:^|[^\d:])(\d{1,4})\s*\/\s*(\d{1,4})(?!\d)/g;
  for (const match of raw.matchAll(pattern)) {
    const score = Number(match[1]);
    const maxScore = Number(match[2]);
    fractions.push({ score, maxScore, valid: maxScore > 0 && score <= maxScore, text: `${score}/${maxScore}` });
  }
  return fractions;
}

function findLabeledScore(text) {
  const raw = String(text ?? '');
  if (!scoreLabelPattern.test(raw)) return null;
  const fraction = findFractions(raw);
  if (fraction.length) return null;
  const m = raw.match(/\b(?:score|puntuaci[oóo0]n|aciertos?|respuestas?\s+correctas?|correct\s+answers?)\b[^\d]{0,28}(\d{1,4})\b/i);
  return m ? Number(m[1]) : null;
}

function contextualPercentageMatches(text) {
  const raw = String(text ?? '');
  const matches = [];
  const label = /\b(?:porcentaje|percentage|accuracy|exactitud|score|puntuaci[oóo0]n)\b[^\d%]{0,20}(\d{1,3}(?:[.,]\d+)?)\s*%/ig;
  for (const match of raw.matchAll(label)) {
    const value = Number(match[1].replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && value <= 100) matches.push({ value, index: match.index, length: match[0].length, source: 'score label' });
  }
  // Wordwall often prints “14/14 100%” without a label. Accept a percentage only
  // when it is on the same OCR line and tightly adjacent to a validated fraction.
  for (const match of raw.matchAll(/(\d{1,4})\s*\/\s*(\d{1,4})[^\S\r\n]{0,4}(\d{1,3}(?:[.,]\d+)?)\s*%/g)) {
    const score = Number(match[1]);
    const maximum = Number(match[2]);
    const value = Number(match[3].replace(',', '.'));
    if (maximum > 0 && score <= maximum && Number.isFinite(value) && value >= 0 && value <= 100) {
      matches.push({ value, index: match.index, length: match[0].length, source: 'adjacent to score fraction' });
    }
  }
  return matches;
}

function hasUncontextualizedPercent(text) {
  const raw = String(text ?? '');
  const tokens = [...raw.matchAll(/\d{1,3}(?:[.,]\d+)?\s*%/g)];
  const contexts = contextualPercentageMatches(raw);
  return tokens.some((token) => !contexts.some((context) => token.index >= context.index && token.index < context.index + context.length));
}

function parseLabeledDuration(text, finalizationDetected, successfulCompletionDetected) {
  if (!finalizationDetected) return { durationSeconds: null, timerRemainingSeconds: null, sourceLabel: null };
  const raw = String(text ?? '');
  const label = /\b(?:time|hora|tiempo|duraci[oó]n|elapsed\s+time|time\s+spent)\b/i.exec(raw);
  if (!label) return { durationSeconds: null, timerRemainingSeconds: null, sourceLabel: null };
  // OCR may put the label and value on different lines, with the score between them
  // (for example, “Score / Time” then “14/14 1:07”). Restrict parsing to text after
  // the explicit final-card label so unrelated clocks elsewhere are not considered.
  const tail = raw.slice(label.index + label[0].length, label.index + label[0].length + 120);
  const m = tail.match(/(\d{1,2}\s*:\s*\d{2}(?:[.,]\d+)?|\d{1,3}\s*[.,]\s*\d+\s*s(?:ec(?:onds?)?)?|\d{1,3}\s*[.,]\s*\d+)/i);
  if (!m) return { durationSeconds: null, timerRemainingSeconds: null, sourceLabel: null };
  const value = m[1].replace(/\s/g, '').replace(',', '.');
  if (value.includes(':')) {
    const [minutes, seconds] = value.split(':').map(Number);
    const durationSeconds = minutes * 60 + seconds;
    return { durationSeconds, timerRemainingSeconds: null, sourceLabel: m[0].trim() };
  }
  const durationSeconds = Number.parseFloat(value.replace(/s(?:ec(?:onds?)?)?$/i, ''));
  return { durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null, timerRemainingSeconds: null, sourceLabel: m[0].trim() };
}

function parseRemainingTimer(text, finalizationDetected) {
  if (finalizationDetected) return null;
  const raw = String(text ?? '');
  const m = raw.match(/\b(?:tiempo\s+restante|time\s+remaining|remaining\s+time|time\s+left|cron[oó]metro)\b\s*[:\-]?\s*(\d{1,2})\s*:\s*(\d{2})/i);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function readingFractions(readings) {
  const observations = [];
  const invalid = [];
  for (const reading of readings) {
    const fractions = findFractions(reading.text);
    if (fractions.length > 1) {
      invalid.push({ pass: reading.pass, kind: 'multiple_fractions_in_one_read', values: fractions.map((x) => x.text) });
      continue;
    }
    if (!fractions.length) continue;
    const candidate = { ...fractions[0], pass: reading.pass, confidence: reading.confidence ?? null, region: reading.region ?? 'full' };
    if (!candidate.valid) invalid.push({ pass: reading.pass, kind: candidate.maxScore === 0 ? 'zero_denominator' : 'score_exceeds_maximum', value: candidate.text });
    else observations.push(candidate);
  }
  return { observations, invalid };
}

function reconcileScore(readings) {
  const { observations, invalid } = readingFractions(readings);
  const groups = new Map();
  for (const observation of observations) {
    const key = `${observation.score}/${observation.maxScore}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const warnings = [];
  if (invalid.length) warnings.push('Una o más lecturas OCR produjeron fracciones imposibles; no se corrigieron por conjetura.');
  if (groups.size > 1) warnings.push('Las lecturas OCR válidas discrepan entre sí; puntuación y máximo quedan sin confirmar.');

  if (groups.size > 1) return { score: null, maxScore: null, perfect: null, observations, invalid, warnings, inconsistent: true, unresolved: true, agreementPasses: [] };
  if (groups.size === 0) {
    return { score: null, maxScore: null, perfect: null, observations, invalid, warnings, inconsistent: invalid.length > 0, unresolved: invalid.length > 0, agreementPasses: [] };
  }

  const [key, matching] = [...groups.entries()][0];
  if (invalid.length && matching.length < 2) {
    warnings.push('La lectura válida no tuvo una segunda confirmación tras detectar una fracción imposible.');
    return { score: null, maxScore: null, perfect: null, observations, invalid, warnings, inconsistent: true, unresolved: true, agreementPasses: matching.map((x) => x.pass) };
  }

  const [score, maxScore] = key.split('/').map(Number);
  if (invalid.length) warnings.push(`Se confirmó ${key} con ${matching.length} lecturas OCR coincidentes después de descartar una fracción imposible.`);
  return {
    score,
    maxScore,
    perfect: score === maxScore,
    observations,
    invalid,
    warnings,
    inconsistent: invalid.length > 0,
    unresolved: false,
    agreementPasses: matching.map((x) => x.pass),
  };
}

function parseSingleScore(readings) {
  const values = [];
  for (const reading of readings) {
    const score = findLabeledScore(reading.text);
    if (score !== null) values.push({ score, pass: reading.pass });
  }
  const distinct = new Set(values.map((x) => x.score));
  return distinct.size === 1 ? { score: values[0].score, values, inconsistent: false } : { score: null, values, inconsistent: distinct.size > 1 };
}

export function decideWordwallV2(result, policy = ACADEMIC_POLICIES.PERFECT_SCORE) {
  const reasons = [];
  let decision = 'INDETERMINADO';
  const activityMatched = result.activity_matched;

  if (activityMatched === false) {
    decision = 'NO_ACREDITABLE';
    reasons.push('La captura identifica una actividad distinta de la configurada.');
  } else if (activityMatched !== true) {
    reasons.push('No se pudo vincular visualmente la captura con la actividad configurada.');
  } else if (policy === ACADEMIC_POLICIES.ACTIVITY_COMPLETED) {
    if (result.successful_completion_detected === true) {
      decision = 'ACREDITABLE';
      reasons.push('Actividad coincidente y señal explícita de finalización satisfactoria.');
    } else if (result.finalization_detected === true && result.successful_completion_detected === false) {
      decision = 'NO_ACREDITABLE';
      reasons.push('La actividad coincidente terminó sin una señal de finalización satisfactoria.');
    } else {
      reasons.push('No hay evidencia suficiente de una terminación satisfactoria.');
    }
  } else if (policy === ACADEMIC_POLICIES.PERFECT_SCORE) {
    if (result.finalization_detected !== true) {
      reasons.push('No se reconoció una señal explícita de finalización.');
    } else if (result.data_inconsistent) {
      reasons.push('Hay lecturas OCR numéricas inconsistentes; se conserva la ambigüedad.');
    } else if (result.score_perfect_detected === true) {
      decision = 'ACREDITABLE';
      reasons.push('La actividad coincide, terminó y puntuación obtenida es igual al máximo visible.');
    } else if (result.score_perfect_detected === false) {
      decision = 'NO_ACREDITABLE';
      reasons.push('La actividad coincide y la puntuación final visible es menor que el máximo.');
    } else {
      reasons.push('La captura no muestra una puntuación completa verificable.');
    }
  } else {
    reasons.push('La política académica seleccionada no está reconocida.');
  }

  return { decision, reasons };
}

export function parseWordwallResultV2(readings, options = {}) {
  const normalizedReadings = (Array.isArray(readings) ? readings : [{ pass: 'full-auto', region: 'full', text: String(readings ?? ''), confidence: options.confidence ?? null }])
    .map((reading, index) => ({ pass: reading.pass ?? `pass-${index + 1}`, region: reading.region ?? 'full', text: String(reading.text ?? ''), confidence: Number.isFinite(reading.confidence) ? reading.confidence : null }));
  const combinedText = normalizedReadings.map((x) => x.text).filter(Boolean).join('\n');
  const configuredActivity = options.configuredActivity ?? TARGET_ACTIVITY_V2;
  const activity = detectActivity(combinedText, configuredActivity);
  const completion = completionFor(combinedText);
  const reconciled = reconcileScore(normalizedReadings);
  const singleScore = parseSingleScore(normalizedReadings);
  const singleScoreConflict = reconciled.score !== null && singleScore.values.some((item) => item.score !== reconciled.score);
  const singleConflictRecovered = singleScoreConflict && reconciled.agreementPasses.length >= 2;
  if (singleScoreConflict) reconciled.warnings.push(singleConflictRecovered
    ? 'Una lectura aislada contradijo la fracción; dos lecturas de fracción coincidieron y se conserva la discrepancia como advertencia.'
    : 'Una lectura aislada contradijo la fracción; faltan lecturas coincidentes para resolverla.');
  const scoreConflictUnresolved = singleScoreConflict && !singleConflictRecovered;
  const hasInvalidFraction = reconciled.invalid.length > 0;
  const singleScoreDistinct = new Set(singleScore.values.map((item) => item.score));
  const singleScoreInconsistent = singleScoreDistinct.size > 1;
  if (singleScoreInconsistent) reconciled.warnings.push('Las lecturas OCR de puntuación sin máximo discrepan entre sí.');
  const unresolved = reconciled.unresolved || scoreConflictUnresolved || singleScoreInconsistent;
  const score = unresolved ? null : reconciled.score ?? (hasInvalidFraction ? null : singleScore.score);
  const maxScore = unresolved || reconciled.score === null ? null : reconciled.maxScore;
  let percentage = maxScore !== null && maxScore > 0 && score !== null
    ? Math.round((score / maxScore) * 10000) / 100
    : null;
  let explicitPercentage = null;
  if (percentage === null && !unresolved && !hasInvalidFraction) {
    for (const reading of normalizedReadings) {
      const contextual = contextualPercentageMatches(reading.text)[0];
      if (contextual) {
        explicitPercentage = contextual.value;
        percentage = contextual.value;
        break;
      }
    }
  }
  const rawPercentReadings = normalizedReadings.filter((x) => hasUncontextualizedPercent(x.text));
  const duration = parseLabeledDuration(combinedText, completion.finalizationDetected, completion.successfulCompletionDetected);
  const timerRemainingSeconds = parseRemainingTimer(combinedText, completion.finalizationDetected);
  const finalIdentity = {
    configured: configuredActivity ? { provider: 'wordwall', id: configuredActivity.activityId ?? null, title: configuredActivity.title ?? null } : null,
    recognizedTitle: activity.title,
    identified: activity.title !== null,
    matched: activity.matched,
    source: activity.source,
  };
  const result = {
    provider: 'wordwall',
    configured_activity: finalIdentity.configured,
    activity_recognized: activity.title,
    activity_identified: finalIdentity.identified,
    activity_matched: finalIdentity.matched,
    activity_identity_source: finalIdentity.source,
    finalization_detected: completion.finalizationDetected,
    successful_completion_detected: completion.successfulCompletionDetected,
    finalization_reason: completion.reason,
    score,
    max_score: maxScore,
    percentage,
    score_perfect_detected: reconciled.perfect ?? (explicitPercentage === null ? null : explicitPercentage === 100),
    score_evidence: { agreement_passes: reconciled.agreementPasses, observations: reconciled.observations, invalid_observations: reconciled.invalid, single_score_observations: singleScore.values },
    score_inconsistent: reconciled.inconsistent || singleScoreConflict || singleScoreInconsistent,
    data_inconsistent: unresolved,
    duration_seconds: duration.durationSeconds,
    duration_source_label: duration.sourceLabel,
    timer_remaining_seconds: timerRemainingSeconds,
    feedback_only: /\b(?:correcto|correct)\b/.test(normalize(combinedText)) && !completion.finalizationDetected,
    uncontextualized_percent_ignored: rawPercentReadings.length > 0,
    uncontextualized_percent_passes: rawPercentReadings.map((x) => x.pass),
    evidence_authenticated: false,
    ocr_passes: normalizedReadings,
    warnings: [...reconciled.warnings],
  };

  if (singleScore.inconsistent) result.warnings.push('Las lecturas de puntuación aislada discrepan; no se elige una arbitrariamente.');
  if (rawPercentReadings.length) result.warnings.push('Se ignoró uno o más porcentajes sin etiqueta académica cercana; pueden pertenecer a la interfaz o al sistema operativo.');
  if (duration.durationSeconds !== null) result.warnings.push(`El campo temporal se tomó de la tarjeta final (${duration.sourceLabel}); no se asume que otros mm:ss sean duración.`);
  if (timerRemainingSeconds !== null) result.warnings.push('Se detectó un contador explícito de tiempo restante; no se usa como duración de resolución.');
  if (result.feedback_only) result.warnings.push('«Correcto» se trata como feedback de respuesta, no como finalización.');

  const policy = options.policy ?? ACADEMIC_POLICIES.PERFECT_SCORE;
  const decision = decideWordwallV2(result, policy);
  result.selected_rule = policy;
  result.decision = decision.decision;
  result.reasons = decision.reasons;
  result.authenticity_warning = 'OCR no verifica identidad, origen ni integridad de la captura.';
  return result;
}

export function needsOcrRetry(result) {
  return result.data_inconsistent
    || result.score === null
    || result.finalization_detected !== true
    || result.activity_matched === null
    || result.uncontextualized_percent_ignored
    || (result.score_perfect_detected === null && result.score !== null);
}
