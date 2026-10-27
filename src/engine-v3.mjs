import { ACADEMIC_POLICIES, parseWordwallResultV2 } from './parser-v2.mjs';
import { OCR_PASSES_V2 } from './ocr-v2.mjs';

export const RESULT_STATUS_V3 = Object.freeze({ PERFECT: 'PERFECTO', COMPLETED: 'COMPLETADO', INSUFFICIENT: 'INSUFICIENTE', UNKNOWN: 'DESCONOCIDO' });
export const ACTIVITY_MATCH_V3 = Object.freeze({ CONFIRMED: 'CONFIRMADA', CONTRADICTED: 'CONTRADICHA', UNKNOWN: 'NO_COMPROBADA' });
export const EVIDENCE_QUALITY_V3 = Object.freeze({ SUFFICIENT: 'SUFICIENTE', AMBIGUOUS: 'AMBIGUA', ILLEGIBLE: 'ILEGIBLE' });
export const VERIFICATION_MODES_V3 = Object.freeze({ STRICT: 'STRICT', CONTEXTUAL: 'CONTEXTUAL' });
export const OPERATIONAL_STATUS_V3 = Object.freeze({ CREDIT: 'ACREDITABLE_SEGUN_POLITICA', FAIL: 'NO_CUMPLE_CRITERIO', NEW_EVIDENCE: 'REQUIERE_NUEVA_EVIDENCIA', WRONG_ACTIVITY: 'EVIDENCIA_DE_OTRA_ACTIVIDAD', REVIEW: 'PENDIENTE_REVISION' });

const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseActivityMatchV3(parsed, activity) {
  if (parsed.activity_matched === true) return { value: ACTIVITY_MATCH_V3.CONFIRMED, recognizedTitle: parsed.activity_recognized, source: parsed.activity_identity_source ?? 'OCR exacto' };
  const allText = (parsed.ocr_passes ?? []).map((pass) => pass.text).join('\n');
  const normalized = normalize(allText);
  for (const title of activity.knownOtherTitles ?? []) {
    if (title && normalized.includes(normalize(title))) return { value: ACTIVITY_MATCH_V3.CONTRADICTED, recognizedTitle: title, source: 'título alternativo configurado en catálogo' };
  }
  if (parsed.activity_matched === false) return { value: ACTIVITY_MATCH_V3.CONTRADICTED, recognizedTitle: parsed.activity_recognized, source: parsed.activity_identity_source };
  return { value: ACTIVITY_MATCH_V3.UNKNOWN, recognizedTitle: null, source: null };
}

export function normalizeEvidenceV3(parsed, activity) {
  const text = (parsed.ocr_passes ?? []).map((pass) => pass.text).join('\n').trim();
  const final = parsed.finalization_detected === true;
  const perfect = parsed.score_perfect_detected === true;
  let resultStatus = RESULT_STATUS_V3.UNKNOWN;
  if (final && !parsed.data_inconsistent && perfect) resultStatus = RESULT_STATUS_V3.PERFECT;
  else if (final && !parsed.data_inconsistent && parsed.score_perfect_detected === false) resultStatus = RESULT_STATUS_V3.INSUFFICIENT;
  else if (final && parsed.successful_completion_detected === true) resultStatus = RESULT_STATUS_V3.COMPLETED;

  let evidenceQuality = EVIDENCE_QUALITY_V3.ILLEGIBLE;
  if (text) evidenceQuality = EVIDENCE_QUALITY_V3.AMBIGUOUS;
  if (final && !parsed.data_inconsistent && (parsed.score_perfect_detected !== null || activity.gradingPolicy === ACADEMIC_POLICIES.ACTIVITY_COMPLETED)) evidenceQuality = EVIDENCE_QUALITY_V3.SUFFICIENT;
  if (parsed.data_inconsistent) evidenceQuality = EVIDENCE_QUALITY_V3.AMBIGUOUS;

  const activityMatch = parseActivityMatchV3(parsed, activity);
  return {
    provider: activity.provider,
    activityId: activity.id,
    activityTitle: activity.title,
    originalUrl: activity.originalUrl,
    gymId: activity.gymId,
    gradingPolicy: activity.gradingPolicy,
    resultStatus,
    activityMatch: activityMatch.value,
    activityMatchEvidence: { recognizedTitle: activityMatch.recognizedTitle, source: activityMatch.source },
    evidenceQuality,
    verificationMode: activity.verificationMode ?? VERIFICATION_MODES_V3.STRICT,
    allowContextualEvidence: Boolean(activity.allowContextualEvidence),
    score: parsed.score,
    maxScore: parsed.max_score,
    percentage: parsed.percentage,
    durationSeconds: parsed.duration_seconds,
    finalizationDetected: parsed.finalization_detected,
    successfulCompletionDetected: parsed.successful_completion_detected,
    scorePerfectDetected: parsed.score_perfect_detected,
    scoreInconsistent: parsed.score_inconsistent,
    dataInconsistent: parsed.data_inconsistent,
    ocrPassCount: parsed.ocr_passes?.length ?? 0,
    ocrText: parsed.ocr_passes ?? [],
    warnings: [...(parsed.warnings ?? [])],
    authenticityVerified: false,
  };
}

function decisionForMode(evidence, activity, mode) {
  const reasons = [];
  let decision;
  let academicGrade = null;
  if (evidence.activityMatch === ACTIVITY_MATCH_V3.CONTRADICTED) {
    decision = OPERATIONAL_STATUS_V3.WRONG_ACTIVITY;
    reasons.push('El texto visible identifica otra actividad; solicita la captura correcta y no asigna cero.');
    return { mode, decision, academicGrade, reasons, identityAssumedFromContext: false };
  }
  if (evidence.dataInconsistent) {
    decision = OPERATIONAL_STATUS_V3.REVIEW;
    reasons.push('Hay lecturas incompatibles sin resolver; requiere revisión o una nueva captura.');
    return { mode, decision, academicGrade, reasons, identityAssumedFromContext: false };
  }
  if (mode === VERIFICATION_MODES_V3.STRICT && evidence.activityMatch !== ACTIVITY_MATCH_V3.CONFIRMED) {
    decision = OPERATIONAL_STATUS_V3.NEW_EVIDENCE;
    reasons.push('La captura no muestra identidad visual suficiente para asociarla con esta actividad.');
    return { mode, decision, academicGrade, reasons, identityAssumedFromContext: false };
  }
  if (mode === VERIFICATION_MODES_V3.CONTEXTUAL && !activity.allowContextualEvidence) {
    decision = OPERATIONAL_STATUS_V3.REVIEW;
    reasons.push('El catálogo no tiene aprobación docente para aceptar evidencia contextual.');
    return { mode, decision, academicGrade, reasons, identityAssumedFromContext: false };
  }
  if (evidence.evidenceQuality === EVIDENCE_QUALITY_V3.ILLEGIBLE || !evidence.finalizationDetected) {
    decision = OPERATIONAL_STATUS_V3.NEW_EVIDENCE;
    reasons.push('No hay una señal legible de finalización; vuelve a adjuntar el resultado final.');
    return { mode, decision, academicGrade, reasons, identityAssumedFromContext: false };
  }
  if (mode === VERIFICATION_MODES_V3.CONTEXTUAL && evidence.activityMatch === ACTIVITY_MATCH_V3.UNKNOWN) {
    reasons.push('Se usa el contexto de la página de actividad aprobado en el catálogo; la identidad de la captura no quedó comprobada visualmente.');
  }
  if (activity.gradingPolicy === ACADEMIC_POLICIES.PERFECT_SCORE) {
    if (evidence.scorePerfectDetected === true && evidence.evidenceQuality === EVIDENCE_QUALITY_V3.SUFFICIENT) {
      decision = OPERATIONAL_STATUS_V3.CREDIT; academicGrade = 1;
      reasons.push('La captura muestra finalización y una fracción válida con puntos iguales al máximo.');
    } else if (evidence.scorePerfectDetected === false && evidence.score !== null && evidence.maxScore !== null && evidence.evidenceQuality === EVIDENCE_QUALITY_V3.SUFFICIENT) {
      decision = OPERATIONAL_STATUS_V3.FAIL; academicGrade = 0;
      reasons.push('La captura muestra claramente un resultado final inferior al máximo; la política de puntuación perfecta fue configurada en el catálogo.');
    } else {
      decision = OPERATIONAL_STATUS_V3.NEW_EVIDENCE;
      reasons.push('La imagen permite leer el cierre, pero no demuestra la puntuación máxima requerida. No se asigna cero por un dato ausente.');
    }
  } else if (activity.gradingPolicy === ACADEMIC_POLICIES.ACTIVITY_COMPLETED) {
    if (evidence.successfulCompletionDetected === true && evidence.evidenceQuality === EVIDENCE_QUALITY_V3.SUFFICIENT) {
      decision = OPERATIONAL_STATUS_V3.CREDIT; academicGrade = 1;
      reasons.push('La señal de finalización satisfactoria cumple la regla configurada para esta actividad.');
    } else if (evidence.finalizationDetected && evidence.successfulCompletionDetected === false) {
      decision = OPERATIONAL_STATUS_V3.FAIL; academicGrade = 0;
      reasons.push('Se detectó fin por tiempo u otra terminación que no demuestra completar satisfactoriamente.');
    } else {
      decision = OPERATIONAL_STATUS_V3.NEW_EVIDENCE;
      reasons.push('La captura no demuestra finalización satisfactoria.');
    }
  } else if (activity.gradingPolicy === 'UMBRAL_CONFIGURADO') {
    decision = OPERATIONAL_STATUS_V3.REVIEW;
    reasons.push('No hay un umbral validado por la profesora en el catálogo; no se infiere uno.');
  } else {
    decision = OPERATIONAL_STATUS_V3.REVIEW;
    reasons.push('La regla académica no está configurada.');
  }
  return { mode, decision, academicGrade, reasons, identityAssumedFromContext: mode === VERIFICATION_MODES_V3.CONTEXTUAL && evidence.activityMatch === ACTIVITY_MATCH_V3.UNKNOWN && decision === OPERATIONAL_STATUS_V3.CREDIT };
}

export function evaluateEvidenceV3(parsed, activity) {
  const evidence = normalizeEvidenceV3(parsed, activity);
  const strict = decisionForMode(evidence, activity, VERIFICATION_MODES_V3.STRICT);
  const contextual = decisionForMode(evidence, activity, VERIFICATION_MODES_V3.CONTEXTUAL);
  const selected = evidence.verificationMode === VERIFICATION_MODES_V3.CONTEXTUAL ? contextual : strict;
  return {
    ...evidence,
    decisions: { STRICT: strict, CONTEXTUAL: contextual },
    selectedDecision: selected.decision,
    simulatedAcademicGrade: selected.academicGrade,
    selectedMode: selected.mode,
    selectedReasons: selected.reasons,
    identityAssumedFromContext: selected.identityAssumedFromContext,
    operationsWarning: 'Esta salida simula una decisión; no es una calificación real ni una verificación antifraude.',
  };
}

function hasUsefulText(parsed) {
  const text = (parsed.ocr_passes ?? []).map((pass) => pass.text).join('\n');
  return /game\s+complete|juego\s+completado|puntuaci[oóo0]n|score|\d{1,4}\s*\/\s*\d{1,4}|\btime\b|\bhora\b|\btiempo\b|caracteristicas\s+del\s+m\.?\s*p\.?\s*l\.?/i.test(text);
}

export function nextPassesV3(readings, parsed, activity, maxPasses = OCR_PASSES_V2.length) {
  const used = new Set(readings.map((reading) => reading.pass));
  const available = OCR_PASSES_V2.filter((pass) => !used.has(pass.pass));
  if (!available.length || parseActivityMatchV3(parsed, activity).value === ACTIVITY_MATCH_V3.CONTRADICTED) return [];
  if (parsed.data_inconsistent) return available.slice(0, 1);

  if (parsed.finalization_detected && activity.gradingPolicy === ACADEMIC_POLICIES.ACTIVITY_COMPLETED && parsed.successful_completion_detected === true) return [];

  const completeScore = parsed.finalization_detected && parsed.score !== null && parsed.max_score !== null && parsed.score_perfect_detected !== null;
  if (completeScore) return [];

  const usefulReads = readings.filter((reading) => {
    const single = parseWordwallResultV2([reading], { configuredActivity: activity });
    return hasUsefulText(single);
  });
  const finalNoScoreReads = readings.filter((reading) => {
    const single = parseWordwallResultV2([reading], { configuredActivity: activity });
    return single.finalization_detected && single.score === null;
  });
  if (parsed.finalization_detected && parsed.score === null && finalNoScoreReads.length >= 2) return [];
  if (!parsed.finalization_detected && usefulReads.length >= 2) return [];
  if (readings.length >= maxPasses) return [];
  // A missing activity title is not itself a reason to OCR the same generic result card again.
  return available.slice(0, 1);
}

export function nextPassV3(readings, parsed, activity, maxPasses = OCR_PASSES_V2.length) {
  return nextPassesV3(readings, parsed, activity, maxPasses)[0] ?? null;
}

export function makeRecordV3(evidence, studentId, receivedAt = new Date().toISOString()) {
  const decision = evidence.decisions[evidence.selectedMode];
  const isWrongActivity = evidence.activityMatch === ACTIVITY_MATCH_V3.CONTRADICTED;
  return {
    student: studentId,
    activityId: evidence.activityId,
    activity: evidence.activityTitle,
    resultStatus: evidence.resultStatus,
    score: evidence.score,
    maxScore: evidence.maxScore,
    durationSeconds: evidence.durationSeconds,
    submissionStatus: decision.decision,
    academicGrade: decision.academicGrade,
    gradingPolicy: evidence.gradingPolicy,
    verificationMode: decision.mode,
    activityMatch: evidence.activityMatch,
    evidenceQuality: evidence.evidenceQuality,
    receivedAt,
    warnings: [...evidence.warnings, ...decision.reasons, ...(isWrongActivity ? ['Pendiente: el alumno debe adjuntar evidencia de la actividad correcta; no se registró cero.'] : [])],
    authenticityVerified: false,
    simulated: true,
  };
}
