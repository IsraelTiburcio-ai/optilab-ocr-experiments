import { parseWordwallResultV2 } from './parser-v2.mjs';

export const CLASSIFICATION_V31 = Object.freeze({
  FINAL: 'FINALIZACION_CONFIRMADA',
  NOT_FINAL: 'FINALIZACION_NO_CONFIRMADA',
  UNKNOWN: 'INDETERMINADO',
  ACTIVE: 'PARTIDA_ACTIVA',
  INSUFFICIENT: 'RESULTADO_INSUFICIENTE',
});

export const TEMPLATE_TYPES_V31 = Object.freeze([
  'SCORE_FINAL', 'COMPLETION_ONLY', 'PUZZLE_COMPLETE', 'FEEDBACK_ONLY', 'PROGRESS_ONLY', 'UNKNOWN_LAYOUT',
]);

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function matcher(config, key, text) {
  const pattern = config?.patterns?.[key];
  if (!pattern) return null;
  try { return normalize(text).match(new RegExp(pattern, 'i')); } catch { return null; }
}
function matches(config, key, text) { return Boolean(matcher(config, key, text)); }
function parseLabeledDuration(text, config) {
  const found = matcher(config, 'puzzleTime', text);
  if (!found?.[1]) return null;
  const value = found[1].trim().replace(',', '.');
  const mmss = value.match(/^(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const seconds = value.match(/^(\d+(?:\.\d+)?)\s*s$/i);
  return seconds ? Number(seconds[1]) : null;
}
function parsePieceCount(text, config) {
  const found = matcher(config, 'pieceCount', text);
  return found?.[1] ? Number(found[1]) : null;
}
function resultBase(readings, text) {
  const confidence = readings.map((item) => item.confidence).filter(Number.isFinite);
  return {
    provider: 'NO_DETERMINABLE', providerSource: 'SIN_MARCA_VISUAL_CONFIRMADA', templateType: 'UNKNOWN_LAYOUT',
    finalizationStatus: CLASSIFICATION_V31.UNKNOWN, resultStatus: CLASSIFICATION_V31.UNKNOWN,
    score: null, maxScore: null, scorePerfect: null, observedFraction: null,
    durationSeconds: null, pieceCount: null, activityIdentity: null, identityMatch: 'NO_COMPROBADA',
    evidenceQuality: text.trim() ? 'AMBIGUA' : 'ILEGIBLE', authenticityVerified: false,
    averageOcrConfidence: confidence.length ? Math.round(confidence.reduce((sum, n) => sum + n, 0) / confidence.length * 10) / 10 : null,
    warnings: [], classificationReasons: [], recognizedText: text,
  };
}

/**
 * Conservative result classifier. It classifies only the visible evidence and
 * never returns an academic grade. `providerHint` is explicitly user/catalog
 * context; it is never described as visually verified identity.
 */
export function classifyEvidenceV31(readings, { profiles, providerHint = 'AUTO', expectedActivityTitle = null, expectedActivityId = null } = {}) {
  const text = readings.map((item) => item.text ?? '').join('\n').trim();
  const normalizedText = normalize(text);
  const result = resultBase(readings, text);
  const hasPuzzleCue = matches(profiles, 'puzzleCompletionCue', text);
  const durationSeconds = parseLabeledDuration(text, profiles);
  const pieceCount = parsePieceCount(text, profiles);
  const positiveCue = matches(profiles, 'positiveCue', text);
  const replayAction = matches(profiles, 'replayAction', text);
  const geniallyVisible = matches(profiles, 'geniallyBrand', text);
  const hasGenericFinal = matches(profiles, 'genericFinal', text);
  const hasFeedback = matches(profiles, 'feedbackOnly', text);
  const hasFraction = matcher(profiles, 'fraction', text);
  const hasActiveCue = matches(profiles, 'activeCue', text);
  const parsedWordwall = parseWordwallResultV2(readings, {
    configuredActivity: expectedActivityTitle ? { title: expectedActivityTitle, activityId: expectedActivityId } : undefined,
  });
  const scoreLabelObserved = /\b(score|puntuacion)\b/.test(normalizedText);
  const agreementPasses = parsedWordwall.score_evidence?.agreement_passes?.length ?? 0;
  result.dataInconsistent = Boolean(parsedWordwall.data_inconsistent);
  result.scoreInconsistent = Boolean(parsedWordwall.score_inconsistent && agreementPasses < 2);
  result.scoreLabelObserved = scoreLabelObserved;

  if (expectedActivityTitle && parsedWordwall.activity_matched === true) {
    result.activityIdentity = parsedWordwall.activity_recognized;
    result.identityMatch = 'CONFIRMADA';
  } else if (parsedWordwall.activity_matched === false && parsedWordwall.activity_recognized) {
    result.activityIdentity = parsedWordwall.activity_recognized;
    result.identityMatch = 'CONTRADICHA';
    result.warnings.push('El texto visible parece nombrar otra actividad; solicita la evidencia correcta.');
  }

  if (providerHint && providerHint !== 'AUTO' && providerHint !== 'NO_DETERMINABLE') {
    result.provider = providerHint;
    result.providerSource = 'PISTA_SELECCIONADA_POR_USUARIO_NO_VERIFICADA';
  } else if (geniallyVisible) {
    result.provider = 'GENIALLY';
    result.providerSource = 'MARCA_OCR_VISIBLE';
  } else if (/\bwordwall(?:\.net)?\b/.test(normalizedText)) {
    result.provider = 'WORDWALL';
    result.providerSource = 'MARCA_OCR_VISIBLE';
  }

  if (!text.trim()) {
    result.classificationReasons.push('Tesseract no devolvió texto legible; no se infiere estado ni resultado.');
    result.warnings.push('Solicita una captura más nítida y completa.');
    return result;
  }

  // The puzzle signature is deliberately compound: a congratulation alone is
  // not enough; the capture must contain both labeled summary fields.
  if (hasPuzzleCue && durationSeconds !== null && pieceCount !== null) {
    result.templateType = 'PUZZLE_COMPLETE';
    result.finalizationStatus = CLASSIFICATION_V31.FINAL;
    result.resultStatus = CLASSIFICATION_V31.FINAL;
    result.durationSeconds = durationSeconds;
    result.pieceCount = pieceCount;
    result.evidenceQuality = 'SUFICIENTE';
    result.classificationReasons.push('Felicitación acompañada por tiempo etiquetado y número de piezas: estructura de resultado de rompecabezas.');
    result.classificationReasons.push('El número de piezas se registra como metadato; no se convierte en puntuación.');
    result.warnings.push('No hay puntuación académica visible ni identidad de actividad comprobada.');
    return result;
  }

  // A provider mark helps identify the format, while the terminal action and
  // success message establish a result screen. The name of the activity stays
  // unverified unless a separate title match exists.
  if (positiveCue && replayAction) {
    result.templateType = 'COMPLETION_ONLY';
    result.finalizationStatus = CLASSIFICATION_V31.FINAL;
    result.resultStatus = CLASSIFICATION_V31.FINAL;
    result.evidenceQuality = 'SUFICIENTE';
    result.classificationReasons.push('Mensaje de felicitación más acción explícita para volver a jugar: pantalla terminal observable.');
    result.warnings.push('La pantalla no muestra puntuación; no permite concluir perfección.');
    if (!geniallyVisible) result.warnings.push('La acción de reinicio no identifica por sí sola al proveedor.');
    return result;
  }

  if (hasPuzzleCue && (durationSeconds !== null || pieceCount !== null)) {
    result.templateType = 'UNKNOWN_LAYOUT';
    result.finalizationStatus = CLASSIFICATION_V31.NOT_FINAL;
    result.resultStatus = CLASSIFICATION_V31.UNKNOWN;
    result.durationSeconds = durationSeconds;
    result.pieceCount = pieceCount;
    result.evidenceQuality = 'AMBIGUA';
    result.classificationReasons.push('La captura parece un resumen de rompecabezas, pero no contiene juntos tiempo y piezas para confirmar el perfil.');
    result.warnings.push('Se conserva solo el campo etiquetado que se pudo leer; no se declara la actividad terminada.');
    return result;
  }

  if (parsedWordwall.finalization_detected === true || hasGenericFinal) {
    const score = parsedWordwall.score;
    const maxScore = parsedWordwall.max_score;
    const validScore = Number.isInteger(score) && Number.isInteger(maxScore) && maxScore > 0 && score >= 0 && score <= maxScore;
    result.finalizationStatus = CLASSIFICATION_V31.FINAL;
    result.resultStatus = CLASSIFICATION_V31.FINAL;
    result.durationSeconds = parsedWordwall.duration_seconds ?? durationSeconds;
    result.classificationReasons.push('Se reconoce una señal explícita de resultado final.');
    const scoreResolved = !result.scoreInconsistent;
    if (validScore && !parsedWordwall.data_inconsistent && scoreResolved) {
      result.templateType = 'SCORE_FINAL';
      result.score = score;
      result.maxScore = maxScore;
      result.scorePerfect = score === maxScore;
      result.evidenceQuality = 'SUFICIENTE';
      result.resultStatus = score === maxScore ? CLASSIFICATION_V31.FINAL : CLASSIFICATION_V31.INSUFFICIENT;
      if (score !== maxScore) result.classificationReasons.push('El resultado final muestra score inferior al máximo; esto es una lectura técnica, no una calificación académica.');
      else result.classificationReasons.push('La fracción final válida muestra puntos iguales al máximo.');
    } else {
      result.templateType = scoreLabelObserved || parsedWordwall.data_inconsistent || parsedWordwall.score_inconsistent ? 'SCORE_FINAL' : 'COMPLETION_ONLY';
      result.evidenceQuality = scoreLabelObserved || parsedWordwall.data_inconsistent || parsedWordwall.score_inconsistent ? 'AMBIGUA' : 'SUFICIENTE';
      result.classificationReasons.push(scoreLabelObserved || parsedWordwall.data_inconsistent || parsedWordwall.score_inconsistent
        ? 'El resultado muestra etiqueta o lecturas de score incompatibles; falta recuperar una fracción confiable.'
        : 'No se observó una puntuación final válida; no se inventa score ni porcentaje.');
    }
    result.warnings.push(...parsedWordwall.warnings);
    if (result.identityMatch === 'NO_COMPROBADA') result.warnings.push('La señal final no demuestra a qué actividad pertenece la captura.');
    if (parsedWordwall.uncontextualized_percent_ignored) result.warnings.push('El porcentaje sin etiqueta académica (por ejemplo, batería) se ignoró.');
    return result;
  }

  if (hasFeedback) {
    result.templateType = 'FEEDBACK_ONLY';
    result.finalizationStatus = CLASSIFICATION_V31.NOT_FINAL;
    result.resultStatus = CLASSIFICATION_V31.UNKNOWN;
    result.evidenceQuality = 'AMBIGUA';
    result.classificationReasons.push('La felicitación o el acierto aislados también pueden aparecer entre preguntas; no confirman el cierre.');
    return result;
  }

  if (hasFraction || hasActiveCue) {
    result.templateType = 'PROGRESS_ONLY';
    result.finalizationStatus = CLASSIFICATION_V31.NOT_FINAL;
    result.resultStatus = hasActiveCue || result.identityMatch === 'CONTRADICHA' ? CLASSIFICATION_V31.ACTIVE : CLASSIFICATION_V31.UNKNOWN;
    result.evidenceQuality = 'AMBIGUA';
    if (hasFraction) {
      const fraction = matcher(profiles, 'fraction', text);
      if (fraction) result.observedFraction = { numerator: Number(fraction[1]), denominator: Number(fraction[2]), meaning: 'NO_DETERMINABLE_SIN_CIERRE' };
      result.classificationReasons.push('Hay una fracción visible sin señal final; puede ser progreso o score y no se promociona a puntuación.');
    }
    if (hasActiveCue) result.classificationReasons.push('Pregunta actual, control de avance o temporizador restante indican fase de juego, no cierre.');
    return result;
  }

  if (result.identityMatch === 'CONTRADICHA') {
    result.templateType = 'UNKNOWN_LAYOUT';
    result.finalizationStatus = CLASSIFICATION_V31.NOT_FINAL;
    result.resultStatus = CLASSIFICATION_V31.ACTIVE;
    result.evidenceQuality = 'SUFICIENTE';
    result.classificationReasons.push('Se ve una actividad distinta y no hay una señal terminal; la pantalla parece una partida activa.');
    return result;
  }

  result.templateType = 'UNKNOWN_LAYOUT';
  result.finalizationStatus = CLASSIFICATION_V31.UNKNOWN;
  result.resultStatus = CLASSIFICATION_V31.UNKNOWN;
  result.evidenceQuality = 'AMBIGUA';
  result.durationSeconds = durationSeconds;
  result.pieceCount = pieceCount;
  result.classificationReasons.push('El texto no satisface las señales combinadas de ningún perfil conocido.');
  if (positiveCue) result.classificationReasons.push('Una felicitación aislada no distingue feedback intermedio de pantalla final.');
  if (pieceCount !== null) result.warnings.push('Se leyó un número de piezas etiquetado, pero no hay cierre; no se interpreta como puntuación.');
  return result;
}
